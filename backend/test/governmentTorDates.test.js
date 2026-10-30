const test = require('node:test');
const assert = require('node:assert/strict');
const { governmentTorDates } = require('../src/services/governmentTorDates');
const { marketTor, CATALOG_PROJECTION } = require('../src/services/torMatchingCatalog');
const { addMarketDocumentSummaries } = require('../src/services/marketDocumentSummary');

const comment = '2026-09-21T17:00:00.000Z';
const bid = '2026-11-01T09:00:00.000Z';
const project = { _id: 'tor', project_id: '69099257828', documents: {
    draftEbidding: { commentDeadlineAt: comment }, invitation: { status: 'not_found' },
}, procurementAnalysis: { biddingClosingDate: { dateTime: bid } } };

test('Draft cards use the stored comment deadline, while open TORs use the bidding deadline', () => {
    assert.equal(governmentTorDates(project).deadline, comment);
    assert.equal(marketTor(project, 'government').deadline, comment);
    assert.equal(governmentTorDates(project, 'open').deadline, bid);
    assert.equal(governmentTorDates({ ...project, documents: { ...project.documents, invitation: { status: 'available' } } }).deadline, bid);
    assert.match(CATALOG_PROJECTION.government, /documents.draftEbidding.commentDeadlineAt/);
});

test('a missing or invalid Draft comment deadline never falls back to the bid date', () => {
    for (const value of [null, undefined, 'invalid date']) {
        const dates = governmentTorDates({ ...project, documents: { draftEbidding: { commentDeadlineAt: value } } });
        assert.equal(dates.deadline, null);
        assert.equal(dates.biddingDeadline, bid);
    }
});

test('local invitation status and displayed deadline remain consistent', async () => {
    const tor = marketTor(project, 'government');
    const lookup = available => async () => ({ documents: {
        invitation: { available, files: available ? [{}] : [] },
        draftEbidding: { available: true, files: [{}] }, priceEstimate: { available: false, files: [] },
    } });
    assert.equal((await addMarketDocumentSummaries([tor], lookup(false)))[0].deadline, comment);
    assert.equal((await addMarketDocumentSummaries([tor], lookup(true)))[0].deadline, bid);
});
