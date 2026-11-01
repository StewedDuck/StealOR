const test = require('node:test');
const assert = require('node:assert/strict');
const { addMarketDocumentSummaries } = require('../src/services/marketDocumentSummary');
const GovProject = require('../src/models/GovProject');
const Tor = require('../src/models/Tor');
const { getMarketTors } = require('../src/controllers/torController');
test('market list uses narrow projections and lean queries; keeps owner reference price', async t => {
    let governmentProjection, internalProjection;
    t.mock.method(GovProject, 'find', () => ({ select(value) { governmentProjection = value; return this; }, sort() { return this; }, lean: async () => [] }));
    t.mock.method(Tor, 'find', () => ({ select(value) { internalProjection = value; return this; }, sort() { return this; }, lean: async () => [{ _id: 'owner-tor', projectName: 'Project', budget: 100, referencePriceEstimate: 80 }] }));
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await getMarketTors({}, res);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data[0].referencePriceEstimate, 80);
    assert.match(governmentProjection, /raw_data.project_description/);
    assert.doesNotMatch(governmentProjection, /(?:^|\s)(?:raw_data|procurementAnalysis)(?:\s|$)/);
    assert.doesNotMatch(governmentProjection, /documentExtraction|scopeOfWork|technicalRequirements/);
    assert.match(internalProjection, /referencePriceEstimate/);
});
test('market summary resolves status from actual local invitation files with bounded parallelism', async () => {
    let active = 0, max = 0;
    const rows = Array.from({ length: 20 }, (_, i) => ({ source: 'government', projectId: String(i) }));
    const results = await addMarketDocumentSummaries(rows, async id => {
        active++; max = Math.max(max, active);
        await new Promise(resolve => setImmediate(resolve)); active--;
        if (id === '2') throw Error('File unavailable');
        return { documents: { invitation: { available: id === '0', files: id === '0' ? [{}] : [] }, priceEstimate: { available: true, files: [{}] } } };
    });
    assert.equal(max <= 8, true);
    assert.equal(results[0].publicationStatus, 'open');
    assert.equal(results[1].publicationStatus, 'draft');
    assert.equal(results[2].publicationStatus, 'unknown');
    assert.deepEqual(results[0].documentTypes, ['priceEstimate', 'invitation']);
    assert.deepEqual(results.map(row => row.projectId), rows.map(row => row.projectId));
});
