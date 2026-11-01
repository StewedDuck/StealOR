const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Tor = require('../src/models/Tor');
const GovProject = require('../src/models/GovProject');
const TorAnalysis = require('../src/models/TorAnalysis');
const { getMatchedTors } = require('../src/controllers/matchingController');

function matches(doc, query) {
    return Object.entries(query).every(([key, value]) => {
        if (key === '$and') return value.every(q => matches(doc, q));
        if (key === '$or') return value.some(q => matches(doc, q));
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            return Object.entries(value).every(([op, operand]) => {
                if (op === '$exists') return (doc[key] !== undefined) === operand;
                if (op === '$in') return operand.includes(doc[key]);
                if (op === '$ne') return doc[key] !== operand;
                if (op === '$lte') return doc[key] <= operand;
                if (op === '$gt') return doc[key] > operand;
                throw Error(op);
            });
        }
        return doc[key] === value;
    });
}
function memoryCollection() {
    const docs = new Map();
    let completions = 0;
    return {
        docs, get completions() { return completions; },
        async createIndex() {},
        find(query) { return { toArray: async () => [...docs.values()].filter(doc => matches(doc, query)).map(doc => ({ ...doc })) }; },
        async updateOne(query, update, options = {}) {
            let doc = docs.get(query._id);
            if (doc && !matches(doc, query)) return { modifiedCount: 0 };
            if (!doc) {
                if (!options.upsert) return { modifiedCount: 0 };
                doc = { _id: query._id, ...update.$setOnInsert };
            }
            Object.assign(doc, update.$set);
            for (const key of Object.keys(update.$unset || {})) delete doc[key];
            docs.set(query._id, doc);
            if (update.$set?.result) completions++;
            return { modifiedCount: 1 };
        },
    };
}
async function eventually(condition) {
    for (let i = 0; i < 100; i++) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('Background result was not persisted');
}

test('lean worker profiles and hydrated API profiles have identical matching fingerprints', () => {
    const { descriptor, normalizeMatchingProfile } = require('../src/services/precomputedMatchingService');
    const raw = { _id: new mongoose.Types.ObjectId(), skills: ['React'],
        pastProjects: [{ projectName: 'Web app' }], legalEligibility: { legalCapacity: true } };
    const hydrated = User.hydrate(raw).toObject();
    const analysis = { torId: new mongoose.Types.ObjectId(), torSource: 'government', status: 'completed',
        relevanceStatus: 'ready', requirements: [{ category: 'mandatory', profileField: 'pastProjects' }],
        projectRelevance: [{ profileFields: ['skills', 'pastProjects.projectName'] }] };
    assert.notDeepEqual(raw.pastProjects, hydrated.pastProjects, 'Reproduce nested defaults missing from lean reads');
    assert.deepEqual(descriptor(raw, analysis), descriptor(hydrated, analysis));
    assert.deepEqual(normalizeMatchingProfile(raw), normalizeMatchingProfile(hydrated));
    assert.notEqual(descriptor({ ...raw, skills: ['Vue'] }, analysis).fingerprint, descriptor(raw, analysis).fingerprint);
});

test('a stale queued task or leftover lease cannot demote a completed current result', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const service = require('../src/services/precomputedMatchingService');
    const profile = { _id: 'already-completed', skills: ['React'] };
    const analysis = { torId: 'queued-tor', torSource: 'government', status: 'completed', relevanceStatus: 'ready', projectRelevance: [] };
    const [queued] = await service.getAvailableMatching(profile, [analysis]);
    assert.equal(queued.refreshState, 'queued');
    const task = service.descriptor(profile, analysis);
    coll.docs.set(task.id, {
        _id: task.id, contractorId: profile._id, fingerprint: task.fingerprint,
        scoringVersion: require('../src/services/matchingCache').SCORING_VERSION,
        result: { matchingPercentage: 80, relevanceResults: [], mandatoryResults: [] },
        computedAt: new Date(), leaseUntil: new Date(Date.now() + 60000),
    });
    const [completed] = await service.getAvailableMatching(profile, [analysis]);
    assert.equal(completed.matchingStatus, 'ready');
    assert.equal(completed.refreshState, 'ready');
    assert.equal(completed.inputFingerprint, task.fingerprint);
    let calculations = 0;
    t.mock.method(require('../src/services/torMatchingService'), 'calculateMatching', async () => { calculations++; });
    service.startRefresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calculations, 0, 'Obsolete queued work is cancelled');
});

test('a fresh service instance after restart reuses persisted results without calculating again', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    const modulePath = require.resolve('../src/services/precomputedMatchingService');
    const originalModule = require.cache[modulePath];
    t.after(() => {
        require.cache[modulePath] = originalModule;
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const profile = { _id: 'restart-test', skills: ['React'] };
    const analysis = { torId: 'persisted-tor', torSource: 'government', status: 'completed', relevanceStatus: 'ready', projectRelevance: [] };
    const task = originalModule.exports.descriptor(profile, analysis);
    const computedAt = new Date('2026-10-01T00:00:00Z');
    coll.docs.set(task.id, { _id: task.id, contractorId: profile._id, fingerprint: task.fingerprint,
        scoringVersion: require('../src/services/matchingCache').SCORING_VERSION, computedAt,
        result: { matchingPercentage: 80, relevanceResults: [], mandatoryResults: [] } });
    let calculations = 0;
    t.mock.method(require('../src/services/torMatchingService'), 'calculateMatching', async () => { calculations++; });
    for (let restart = 0; restart < 2; restart++) {
        delete require.cache[modulePath];
        const coldService = require(modulePath);
        const [entry] = await coldService.getAvailableMatching(profile, [analysis]);
        assert.equal(entry.matchingStatus, 'ready');
        assert.equal(entry.computedAt, computedAt);
        coldService.startRefresh();
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(calculations, 0);
    assert.equal(coll.docs.get(task.id).fingerprint, task.fingerprint);
});

test('cold-start preview reads saved cards without loading analysis criteria or running AI', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const computedAt = new Date('2026-10-01T00:00:00Z');
    for (const contractorId of ['own', 'other']) coll.docs.set(contractorId, {
        _id: contractorId, contractorId, torId: 'gov', torSource: 'government', computedAt,
        result: { matchingPercentage: contractorId === 'own' ? 80 : 99, relevanceResults: [] },
    });
    t.mock.method(GovProject, 'find', (_, projection) => {
        assert.doesNotMatch(projection, /scopeOfWork|technicalRequirements|documentExtraction/);
        return { lean: async () => [{ _id: 'gov', project_id: '123', project_name: 'Project' }] };
    });
    t.mock.method(Tor, 'find', () => ({ lean: async () => [] }));
    t.mock.method(TorAnalysis, 'find', () => assert.fail('Preview must not download analysis criteria'));
    t.mock.method(require('../src/services/torMatchingService'), 'calculateMatching', () => assert.fail('Preview must not calculate'));
    const result = await require('../src/services/matchingSnapshotService').loadMatchingSnapshot('own');
    assert.equal(result.isCachedSnapshot, true);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].matchingPercentage, 80);
    assert.equal(result.data[0].computedAt, computedAt);
    assert.equal(result.data[0].matchingStatus, 'stale', 'Saved preview must not claim freshness');
    coll.docs.get('own').result.relevanceResults = [{ missingGroups: [['AWS']] }];
    coll.docs.get('own').result.mandatoryResults = [{ text: 'ISO 27001', status: 'unknown' }];
    const originalFind = coll.find.bind(coll);
    coll.aggregate = pipeline => {
        assert.equal(pipeline[0].$match.contractorId, 'own');
        assert.equal(pipeline[1].$sort.computedAt, -1);
        assert.ok(pipeline[2].$group);
        const projection = pipeline.at(-1).$project;
        assert.equal(projection['result.relevanceResults.missingGroups'], 1);
        assert.equal(projection['result.mandatoryResults.text'], 1);
        return originalFind(pipeline[0].$match);
    };
    const detailed = await require('../src/services/matchingSnapshotService').loadMatchingSnapshot('own', { includeDetails: true });
    assert.deepEqual(detailed.data[0].relevanceResults[0].missingGroups, [['AWS']]);
    assert.equal(detailed.data[0].mandatoryResults[0].text, 'ISO 27001');
    assert.equal(detailed.data[0].matchingPercentage, 80);

});

test('legacy results migrate without AI and older writers cannot overwrite the current input version', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const service = require('../src/services/precomputedMatchingService');
    const profile = { _id: 'immutable-test', skills: ['React'] };
    const analysis = { torId: 'same-tor', torSource: 'government', status: 'completed', relevanceStatus: 'ready',
        projectRelevance: [{ profileFields: ['skills'] }] };
    const task = service.descriptor(profile, analysis);
    const computedAt = new Date('2026-10-01T00:00:00Z');
    const legacy = { _id: task.legacyId, contractorId: profile._id, torId: analysis.torId, torSource: analysis.torSource,
        fingerprint: task.fingerprint, computedAt, scoringVersion: require('../src/services/matchingCache').SCORING_VERSION,
        result: { matchingPercentage: 80, relevanceResults: [], mandatoryResults: [] } };
    coll.docs.set(legacy._id, legacy);
    t.mock.method(require('../src/services/torMatchingService'), 'calculateMatching', () => assert.fail('Migration must reuse evaluated evidence'));
    const [migrated] = await service.getAvailableMatching(profile, [analysis], { refresh: false });
    assert.equal(migrated.matchingStatus, 'ready');
    assert.equal(migrated.computedAt, computedAt);
    assert.notEqual(task.id, task.legacyId);
    assert.ok(coll.docs.has(task.id));
    Object.assign(legacy, { fingerprint: 'older-worker-input', computedAt: new Date(), result: { matchingPercentage: 2, relevanceResults: [] } });
    const [again] = await service.getAvailableMatching(profile, [analysis]);
    assert.equal(again.matchingStatus, 'ready');
    assert.equal(again.result.matchingPercentage, 80);
    assert.equal(again.computedAt, computedAt);
    assert.notEqual(service.descriptor({ ...profile, skills: ['Vue'] }, analysis).id, task.id);
});

test('a failed stored-result read rejects instead of replacing completed TORs with an empty list', async t => {
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    const coll = memoryCollection();
    coll.find = () => ({ async toArray() { throw new Error('Transient database failure'); } });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const { loadStoredMatching } = require('../src/services/precomputedMatchingService');
    await assert.rejects(loadStoredMatching('contractor'), /Stored matching results unavailable/);
});

test('list API returns pending immediately, persists background results, reuses them and marks profile changes stale', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    let profile = { _id: 'contractor', skills: ['React'] };
    const analysis = { torId: 'tor', torSource: 'internal', status: 'completed', relevanceStatus: 'ready', projectRelevance: [{ skillGroups: [['react']], profileFields: ['skills'] }] };
    t.mock.method(User, 'findOne', async () => ({ toObject: () => profile }));
    t.mock.method(TorAnalysis, 'find', () => ({ lean: async () => [analysis] }));
    t.mock.method(TorAnalysis, 'updateMany', async () => ({ modifiedCount: 0 }));
    t.mock.method(Tor, 'find', () => ({ lean: async () => [{ _id: 'tor', projectName: 'Software', scopeOfWork: ['Build React'] }] }));
    t.mock.method(GovProject, 'find', () => ({ lean: async () => [] }));
    async function request(query = {}) {
        let payload;
        await getMatchedTors({ profileEmail: 'private@example.com', query }, {
            json(value) { payload = value; return this; },
            status() { return this; },
        });
        assert.equal(payload.success, true);
        return payload;
    }
    const readOnly = await request({ refresh: 'false' });
    assert.equal(readOnly.pending, 1);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coll.docs.size, 0, 'Market/Saved reads must not enqueue calculation');
    const [first, concurrent] = await Promise.all([request(), request()]);
    assert.equal(first.pending, 1);
    assert.equal(concurrent.pending, 1);
    assert.equal(first.data.length, 1);
    assert.equal(first.data[0].matchingPercentage, null);
    assert.equal(coll.completions, 0, 'Response must not wait for calculation');
    await eventually(() => coll.completions === 1);
    const warm = await request();
    assert.equal(warm.pending, 0);
    assert.equal(warm.data[0].matchingStatus, 'ready');
    assert.equal(warm.data[0].matchingPercentage, 100);
    assert.equal(warm.data[0].relevanceResults[0].matchDetails[0].matchType, 'exact');
    assert.deepEqual(warm.data[0].scoredResults, []);
    assert.equal(coll.completions, 1);
    analysis.sourceFingerprint = require('../src/services/automaticMatchingService').sourceFingerprint({
        projectName: 'Software', scopeOfWork: ['Build React'],
    }, 'internal');
    analysis.pipelineState = 'failed';
    analysis.error = 'AI_CONFIGURATION';
    const redundantFailure = await request();
    assert.equal(redundantFailure.pending, 0, 'Failed refresh of unchanged source must retain the completed analysis');
    assert.equal(redundantFailure.data[0].matchingStatus, 'ready');
    assert.equal(redundantFailure.data[0].failureCode, null);
    delete analysis.sourceFingerprint;
    delete analysis.pipelineState;
    delete analysis.error;
    // Returning after the old seven-day TTL, or logging in with new session
    // metadata, must not re-run matching for unchanged evidence.
    const persisted = [...coll.docs.values()][0];
    persisted.computedAt = new Date(Date.now() - 30 * 86400000);
    persisted.expiresAt = new Date(0);
    profile = { ...profile, lastLogin: new Date(), updatedAt: new Date() };
    const returning = await request({ retry: 'true' });
    assert.equal(returning.pending, 0);
    assert.equal(returning.data[0].matchingStatus, 'ready');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coll.completions, 1, 'Even manual retry must reuse successful unchanged results');
    profile = require('../src/services/precomputedMatchingService').normalizeMatchingProfile(profile);
    assert.equal((await request()).pending, 0, 'Schema defaults must not restart matching');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coll.completions, 1);
    profile = { ...profile, skills: ['React', 'Vue'] };
    const stale = await request();
    assert.equal(stale.pending, 1);
    assert.equal(stale.data[0].matchingStatus, 'stale');
    await eventually(() => coll.completions === 2);
    analysis.projectRelevance[0].text = 'Changed TOR requirement';
    assert.equal((await request()).data[0].matchingStatus, 'stale');
    await eventually(() => coll.completions === 3);
    analysis.torSource = 'government';
    analysis.torId = 'govtor';
    t.mock.method(Tor, 'find', () => ({ lean: async () => [] }));
    t.mock.method(GovProject, 'find', () => ({ lean: async () => [{ _id: 'govtor', project_id: '69109005145', project_name: 'Software', procurementAnalysis: { scopeOfWork: ['Build React'] } }] }));
    await request();
    await eventually(() => coll.completions === 4);
    const government = await request({ refresh: 'false' });
    assert.equal(government.data[0].projectId, '69109005145', 'Saved cards join matching by the public e-GP project ID');
    // Upgrade evaluated results without asking AI to re-evaluate the evidence.
    const row = [...coll.docs.values()].find(value => value.result?.torId === 'govtor');
    row.scoringVersion = 'old-all-or-nothing';
    row.result.matchingPercentage = 0;
    row.result.relevanceResults = [{ status: 'unknown', skillGroups: [['react'], ['docker']], matchedGroups: [['react']], missingGroups: [['docker']] }];
    const upgraded = await request({ refresh: 'false' });
    assert.equal(upgraded.pending, 0);
    assert.equal(upgraded.data[0].matchingPercentage, 50);
    assert.equal(upgraded.data[0].relevanceResults[0].earnedWeight, 50);
    assert.equal(row.result.matchingPercentage, 50, 'Formula upgrade persists without recalculating matching');

});

test('AI failures show retry_wait, stop after three failures, and a manual retry can recover', async t => {
    const { getAvailableMatching, startRefresh } = require('../src/services/precomputedMatchingService');
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    let failing = true;
    t.mock.method(require('../src/services/torMatchingService'), 'calculateMatching', async (_, __, options) => {
        if (failing) options.onSemanticError({ code: 'AI_TIMEOUT', retryable: true });
        return { relevanceResults: [{ status: failing ? 'unknown' : 'pass', semanticMatchingStatus: failing ? 'unavailable' : 'completed' }] };
    });
    const profile = { _id: 'retry-test', skills: ['React'] };
    const analysis = { torId: 'retry-tor', torSource: 'internal', status: 'completed', relevanceStatus: 'ready', projectRelevance: [] };
    for (let attempt = 1; attempt <= 3; attempt++) {
        await getAvailableMatching(profile, [analysis]);
        startRefresh();
        await eventually(() => coll.completions === attempt);
        const [entry] = await getAvailableMatching(profile, [analysis], { refresh: false });
        assert.equal(entry.refreshState, attempt < 3 ? 'retry_wait' : 'failed');
        assert.equal(entry.matchingStatus, attempt < 3 ? 'stale' : 'unavailable');
        assert.equal(entry.failureCode, 'AI_TIMEOUT');
        for (const doc of coll.docs.values()) if (doc.retryAt) doc.retryAt = new Date(0);
    }
    await getAvailableMatching(profile, [analysis]);
    startRefresh();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coll.completions, 3, 'No endless automatic failure loop');
    failing = false;
    await getAvailableMatching(profile, [analysis], { force: true });
    startRefresh();
    await eventually(() => coll.completions === 4);
    const [recovered] = await getAvailableMatching(profile, [analysis], { refresh: false });
    assert.equal(recovered.matchingStatus, 'ready');
    assert.equal(recovered.refreshState, 'ready');
    assert.equal(recovered.failureCode, null);
});

test('matching reads only identity metadata for history and downloads evidence for the exact requested version', async t => {
    const coll = memoryCollection();
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    mongoose.connection.db = { collection: () => coll };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const service = require('../src/services/precomputedMatchingService');
    const profile = { _id: 'history-owner', skills: ['React'] };
    const analysis = { torId: 'history-tor', torSource: 'internal', status: 'completed', relevanceStatus: 'ready', projectRelevance: [] };
    const task = service.descriptor(profile, analysis);
    const result = { torId: 'history-tor', torSource: 'internal', matchingPercentage: 80, relevanceResults: [] };
    coll.docs.set(task.id, { _id: task.id, contractorId: profile._id, torId: analysis.torId, torSource: 'internal', fingerprint: task.fingerprint,
        scoringVersion: require('../src/services/matchingCache').SCORING_VERSION, result, computedAt: new Date('2026-10-01') });
    for (let i = 0; i < 20; i++) coll.docs.set(`history-${i}`, { _id: `history-${i}`, contractorId: profile._id, torId: analysis.torId,
        torSource: 'internal', fingerprint: `old-${i}`, result: { ...result, matchingPercentage: 2 }, computedAt: new Date('2026-10-30') });
    const reads = [];
    const originalFind = coll.find.bind(coll);
    coll.find = (query, options) => { reads.push({ query, options }); return originalFind(query); };
    const [entry] = await service.getAvailableMatching(profile, [analysis], { refresh: false });
    assert.equal(entry.result.matchingPercentage, 80);
    assert.equal(entry.matchingStatus, 'ready');
    assert.equal(reads[0].options.projection['result.relevanceResults'], undefined);
    assert.deepEqual(reads[1].query._id.$in, [task.id]);
    assert.equal(reads[1].query.contractorId, profile._id);
});
