const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDashboard, buildTrend } = require('../src/services/contractorDashboardService');
const now = new Date('2026-10-25T18:00:00Z'); // 26 October in Bangkok.
const row = (id, score, tor = {}, rest = {}) => ({ tor: { id, source: 'internal', status: 'published', projectName: id, budget: 100, createdAt: '2026-10-25T18:00:00Z', deadline: '2026-10-29T10:00:00+07:00', ...tor }, matchingPercentage: score, relevanceResults: [], mandatoryResults: [], ...rest });
test('summary uses real >39 scores, separates unscored and counts Bangkok arrivals', () => {
    const data = summarizeDashboard([
        row('one', 39.01), row('two', 39), row('three', null),
        row('four', 80, { budget: null, createdAt: '2026-10-25T12:00:00Z' }),
        row('five', 90, {}, { analysisPipelineStatus: 'waiting_data' }),
    ], now);
    assert.equal(data.summary.matchedCount, 2);
    assert.equal(data.summary.assessedCount, 3);
    assert.equal(data.summary.matchRate, 66.67);
    assert.equal(data.summary.newTodayCount, 4);
    assert.equal(data.summary.matchedBudget, 100);
    assert.equal(data.summary.missingBudgetCount, 1);
});
test('closing list includes only matched open TORs within five days and sorts earliest first', () => {
    const data = summarizeDashboard([
        row('tomorrow', 80, { deadline: '2026-10-27T18:00:00+07:00' }),
        row('five-days', 90, { deadline: '2026-10-31T18:00:00+07:00' }),
        row('draft', 80, { status: 'draft' }), row('low-score', 20),
        row('past', 90, { deadline: '2026-10-25T18:00:00+07:00' }),
        row('missing', 90, { deadline: null }), row('later', 90, { deadline: '2026-11-01T18:00:00+07:00' }),
    ], now);
    assert.equal(data.summary.closingCount, 2);
    assert.deepEqual(data.closingTors.map(row => row.tor.id), ['tomorrow', 'five-days']);
    assert.deepEqual(data.closingTors.map(row => row.daysLeft), [1, 5]);
});
test('software categories come from actual text and exclude draft/closed TORs', () => {
    const data = summarizeDashboard([
        row('React website', 80), row('Python AI Chatbot', 60),
        row('Flutter Mobile', 0, { status: 'draft' }),
        row('Cloud', 80, { deadline: '2020-01-01' }),
    ], now);
    assert.equal(data.softwareTypes.find(row => row.name === 'Web App').value, 1);
    assert.equal(data.softwareTypes.find(row => row.name === 'Data/AI').value, 1);
    assert.equal(data.softwareTypes.some(row => row.name === 'Mobile' || row.name === 'Cloud'), false);
});
test('gaps count each TOR once per group, include profile conditions, skip unavailable AI', () => {
    const data = summarizeDashboard([
        row('one', 50, {}, { relevanceResults: [{ missingGroups: [['AWS'], ['AWS']] }, { missingGroups: [['React']], semanticMatchingStatus: 'unavailable' }], mandatoryResults: [{ status: 'unknown', text: 'ISO 27001 certificate' }] }),
        row('two', 30, {}, { relevanceResults: [{ missingGroups: [['AWS']] }] }),
    ], now);
    assert.equal(data.qualificationGaps.find(row => row.qualification === 'AWS').missed, 2);
    assert.equal(data.qualificationGaps.some(row => row.qualification === 'React'), false);
    assert.equal(data.qualificationGaps.find(row => row.qualification === 'ISO 27001').missed, 1);
});
test('empty and unassessed data do not fabricate a rate or budgets', () => {
    const data = summarizeDashboard([row('pending', null)], now);
    assert.equal(data.summary.matchRate, null);
    assert.equal(data.summary.matchedBudget, 0);
    assert.equal(data.summary.matchedCount, 0);
});
test('six-month trend uses only real snapshots and preserves absent months as null', () => {
    const points = buildTrend([{ day: '2026-09-01', rate: 20 }, { day: '2026-09-02', rate: 40 }, { day: '2026-10-26', rate: 50 }], now);
    assert.equal(points.length, 6);
    assert.equal(points[0].key, '2026-05');
    assert.equal(points[0].rate, null);
    assert.equal(points[4].rate, 30);
    assert.equal(points[5].rate, 50);
});

test('cached previews read trend history without overwriting daily assessment history', async t => {
    const Snapshot = require('../src/models/DashboardSnapshot');
    t.mock.method(Snapshot, 'updateOne', async () => assert.fail('Preview must not overwrite history'));
    t.mock.method(Snapshot, 'find', () => ({ select() { return this; }, lean: async () => [] }));
    const { loadTrend } = require('../src/services/contractorDashboardService');
    const trend = await loadTrend('account@example.com', { matchRate: 25 }, now, { record: false });
    assert.equal(trend.length, 6);
    assert.ok(trend.every(point => point.rate === null));
});
