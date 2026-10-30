const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const GovProject = require('../src/models/GovProject');
const Tor = require('../src/models/Tor');
const TorAnalysis = require('../src/models/TorAnalysis');
const User = require('../src/models/User');
const analyzer = require('../src/services/torAnalyzer');
const precomputed = require('../src/services/precomputedMatchingService');
const service = require('../src/services/automaticMatchingService');
const { visibleFilter } = require('../src/services/torMatchingCatalog');

function query(get) { return { sort() { return this; }, limit() { return this; }, lean: async () => get() }; }
function setup(t) {
    let current = { _id: 'gov1', project_name: 'Software', procurementAnalysis: { scopeOfWork: ['Develop React app'] } };
    let row;
    let calls = 0;
    let fail = false;
    let mutateDuringAnalysis = false;
    const apply = update => {
        if (!row) row = { torSource: 'government', torId: current._id, ...update.$setOnInsert };
        Object.assign(row, update.$set);
        for (const key of Object.keys(update.$unset || {})) delete row[key];
    };
    t.mock.method(TorAnalysis, 'findOne', () => query(() => row && { ...row }));
    t.mock.method(TorAnalysis, 'updateOne', async (_, update) => { apply(update); return { modifiedCount: 1 }; });
    t.mock.method(TorAnalysis, 'findOneAndUpdate', (_, update) => query(() => {
        if (row?.leaseUntil > new Date()) return null;
        apply(update);
        return { ...row };
    }));
    t.mock.method(GovProject, 'findOne', () => query(() => current));
    t.mock.method(analyzer, 'analyzeTor', async () => {
        calls++;
        await new Promise(resolve => setTimeout(resolve, 2));
        if (mutateDuringAnalysis) current = { ...current, procurementAnalysis: { scopeOfWork: ['Changed during analysis'] } };
        if (fail) throw new Error('AI timeout');
        return { status: 'completed', requirements: [], projectRelevance: [{ text: 'React', skillGroups: [['react']], profileFields: ['skills'] }],
            relevanceStatus: 'ready', scoringStatus: 'ready', modelName: 'test', analyzedAt: new Date() };
    });
    return { get current() { return current; }, set current(value) { current = value; },
        get row() { return row; }, set row(value) { row = value; }, get calls() { return calls; },
        set fail(value) { fail = value; }, set mutateDuringAnalysis(value) { mutateDuringAnalysis = value; } };
}

test('missing data waits without AI; content arrivals and relevant edits trigger analysis once', async t => {
    const env = setup(t);
    env.current = { _id: 'gov1', project_name: 'Software' };
    assert.equal((await service.ensureAnalysis(env.current, 'government')).state, 'waiting_data');
    assert.equal(env.calls, 0);
    env.current = { ...env.current, procurementAnalysis: { scopeOfWork: ['Develop React app'] } };
    assert.equal((await service.ensureAnalysis(env.current, 'government')).state, 'ready');
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 1);
    env.current = { ...env.current, updatedAt: new Date() };
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 1, 'Unrelated database timestamps do not invalidate analysis');
    env.current.procurementAnalysis.scopeOfWork = ['Develop Vue app'];
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 2);
});

test('concurrent attempts claim one TOR analysis and keep a durable fingerprint', async t => {
    const env = setup(t);
    await Promise.all([service.ensureAnalysis(env.current, 'government'), service.ensureAnalysis(env.current, 'government')]);
    assert.equal(env.calls, 1);
    assert.equal(env.row.sourceFingerprint, service.sourceFingerprint(env.current, 'government'));
    assert.equal(env.row.leaseToken, undefined);
});

test('failed analysis backs off, stops after three attempts, and changed requirements reset it', async t => {
    const env = setup(t);
    env.fail = true;
    for (let i = 1; i <= 3; i++) {
        const result = await service.ensureAnalysis(env.current, 'government');
        assert.equal(result.state, i < 3 ? 'retry_wait' : 'failed');
        env.row.nextAttemptAt = new Date(0);
    }
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 3);
    env.fail = false;
    env.current.procurementAnalysis.scopeOfWork = ['New requirement'];
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 4);
    assert.equal(env.row.pipelineState, 'ready');
});

test('a source edit during an AI call cannot publish an obsolete analysis', async t => {
    const env = setup(t);
    env.mutateDuringAnalysis = true;
    assert.equal((await service.ensureAnalysis(env.current, 'government')).state, 'pending');
    assert.equal(env.row.sourceFingerprint, undefined);
    assert.equal(env.row.projectRelevance, undefined);
});

test('content and visibility rules exclude empty structures and private internal drafts', () => {
    assert.equal(service.hasAnalysisData({ procurementAnalysis: { scopeOfWork: [{ text: '' }] } }, 'government'), false);
    assert.equal(service.hasAnalysisData({ scopeOfWork: ['Build software'] }, 'internal'), true);
    assert.equal(visibleFilter('internal').status, 'published');
    assert.ok(visibleFilter('internal').applicationDeadline.$gt instanceof Date);
    assert.ok(visibleFilter('government').contract_status.$not.test('ยกเลิกโครงการ'));
});

test('scheduled scans analyze new TORs and schedule contractor matches without a page request', async t => {
    const env = setup(t);
    const originalDb = mongoose.connection.db;
    const readyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
    Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
    let state = {};
    const collection = {
        async createIndex() {},
        async findOneAndUpdate(_, update) { Object.assign(state, update.$set); return { ...state }; },
        async updateOne(_, update) { Object.assign(state, update.$set); for (const key of Object.keys(update.$unset || {})) delete state[key]; },
    };
    mongoose.connection.db = { collection: () => collection };
    t.after(() => {
        mongoose.connection.db = originalDb;
        if (readyState) Object.defineProperty(mongoose.connection, 'readyState', readyState);
        else delete mongoose.connection.readyState;
    });
    const profile = { _id: 'user1', accountRole: 'contractor', skills: ['React'] };
    t.mock.method(GovProject, 'find', () => query(() => [env.current]));
    t.mock.method(Tor, 'find', () => query(() => []));
    t.mock.method(TorAnalysis, 'find', () => query(() => env.row?.sourceFingerprint ? [{ ...env.row, _id: 'analysis1' }] : []));
    t.mock.method(User, 'findOne', filter => query(() => filter._id?.$gt ? null : profile));
    let matched = 0;
    t.mock.method(precomputed, 'getAvailableMatching', async (user, analyses) => {
        matched++;
        assert.equal(user._id, 'user1');
        assert.equal(analyses.length, 1);
    });
    t.mock.method(precomputed, 'startRefresh', () => {});
    await Promise.all([service.runAutomaticMatching(), service.runAutomaticMatching()]);
    assert.equal(env.calls, 1);
    assert.equal(matched, 1);
    assert.equal(GovProject.findOne.mock.callCount(), 1,
        'Only the analysis publication guard reads a single TOR; contractor scans use the shared catalog');
    assert.doesNotMatch(TorAnalysis.findOne.mock.calls[0].arguments[1], /requirements|projectRelevance/,
        'Analysis readiness checks must not download full evaluated criteria');
    assert.ok(state.lastScanAt instanceof Date);
    // No page request: the next scan notices a source update on its own.
    env.current.procurementAnalysis.scopeOfWork = ['New software scope'];
    await service.runAutomaticMatching();
    assert.equal(env.calls, 2);
    profile.skills = ['React', 'Docker'];
    await service.runAutomaticMatching();
    assert.equal(matched, 2);
});

test('matching API includes unanalyzed visible TORs with null scores and distinct waiting states', async t => {
    t.mock.method(User, 'findOne', async () => ({ toObject: () => ({ _id: 'user1', skills: ['React'] }) }));
    t.mock.method(TorAnalysis, 'find', () => query(() => []));
    t.mock.method(Tor, 'find', filter => {
        assert.equal(filter.status, 'published');
        assert.ok(filter.applicationDeadline.$gt instanceof Date);
        return query(() => [{ _id: 'internal1', projectName: 'New TOR', status: 'published', scopeOfWork: ['Build React app'] }]);
    });
    t.mock.method(GovProject, 'find', filter => {
        assert.ok(filter.contract_status.$not instanceof RegExp);
        return query(() => [{ _id: 'gov1', project_id: '123', project_name: 'Waiting for document' }]);
    });
    t.mock.method(analyzer, 'analyzeTor', () => assert.fail('List requests cannot await new TOR analysis'));
    let payload;
    await require('../src/controllers/matchingController').getMatchedTors({ profileEmail: 'private@example.com', query: {} }, {
        json(value) { payload = value; return this; }, status() { return this; },
    });
    assert.equal(payload.success, true);
    assert.equal(payload.total, 2);
    assert.equal(payload.waitingForData, 1);
    assert.equal(payload.pending, 1);
    assert.ok(payload.data.every(item => item.matchingPercentage === null));
    assert.equal(payload.data.find(item => item.torSource === 'government').analysisPipelineStatus, 'waiting_data');
    assert.equal(payload.data.find(item => item.torSource === 'internal').analysisPipelineStatus, 'pending');
    assert.equal(payload.data.find(item => item.torSource === 'internal').tor.projectName, 'New TOR');
});

test('fixed Vertex configuration reopens an old configuration failure once, preserving retry limits', async t => {
    const env = setup(t);
    t.mock.method(require('../src/config/vertex'), 'getVertexConfig', () => ({ project: 'fixed-project', credentialsPath: __filename }));
    const { configurationRecoveryKey } = require('../src/services/matchingFailure');
    env.row = { pipelineState: 'failed', error: 'AI_CONFIGURATION', attemptCount: 3,
        attemptedFingerprint: service.sourceFingerprint(env.current, 'government') };
    assert.equal((await service.ensureAnalysis(env.current, 'government')).state, 'ready');
    assert.equal(env.calls, 1);
    assert.equal(env.row.attemptedConfigurationKey, configurationRecoveryKey());
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 1, 'Successful analysis remains reusable');
    env.row.pipelineState = 'failed';
    env.row.error = 'AI_CONFIGURATION';
    env.row.attemptCount = 3;
    await service.ensureAnalysis(env.current, 'government');
    assert.equal(env.calls, 1, 'Unchanged failing configuration cannot loop');
});
