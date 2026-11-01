const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTorMonths, buildUserDistribution } = require('../src/services/adminDashboardCharts');
test('chart months cross year boundaries and use Bangkok month at UTC rollover', () => {
    const months = buildTorMonths([{ _id: { month: '2026-01', status: 'draft' }, count: 4 }, { _id: { month: '2026-02', status: 'pending_verification' }, count: 2 }], new Date('2026-01-31T18:00:00Z'));
    assert.equal(months.length, 6);
    assert.equal(months[0].key, '2025-09');
    assert.equal(months[4].draft, 4);
    assert.equal(months[5].key, '2026-02');
    assert.equal(months[5].pending, 2);
    assert.equal(months[5].published, 0);
});
test('role distribution preserves counts and zero-fills absent roles', () => {
    assert.deepEqual(buildUserDistribution([{ _id: 'contractor', count: 5 }, { _id: 'admin', count: 2 }]).map(row => row.value), [5, 0, 2]);
});
