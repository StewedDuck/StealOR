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
