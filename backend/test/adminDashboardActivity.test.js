const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeActivity, activityPipeline, loadActivity } = require('../src/services/adminDashboardActivity');
test('activity merges sources chronologically, limits to ten, and excludes private fields', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ _id: `tor-${i}`, title: 'Test', citizenId: 'secret', events: { type: 'tor_created', at: new Date(Date.UTC(2026, 10, i + 1)) } }));
    const result = mergeActivity(rows, [{ _id: 'verification', title: 'คำขอยืนยันตัวตน', events: { type: 'verification_approved', at: new Date('2026-11-15') } }]);
    assert.equal(result.length, 10);
    assert.equal(result[0].href, '/admin/verification');
    assert.equal(result[1].href, '/admin/issue');
    assert.ok(result.every(event => !('citizenId' in event)));
    assert.deepEqual(mergeActivity([], []), []);
});
test('database pipelines order actual event timestamps before limiting and project only metadata', () => {
    for (const kind of ['tor', 'verification']) {
        const pipeline = activityPipeline(kind);
        assert.deepEqual(Object.keys(pipeline[0].$project).sort(), ['events', 'title']);
        assert.deepEqual(pipeline[2], { $match: { 'events.at': { $type: 'date' } } });
        assert.deepEqual(pipeline[3].$sort, { 'events.at': -1, _id: -1 });
        assert.equal(pipeline[4].$limit, 10);
    }
});
test('database errors propagate instead of appearing as an empty feed', async t => {
    t.mock.method(require('../src/models/Tor'), 'aggregate', async () => { throw Error('unavailable'); });
    t.mock.method(require('../src/models/IdentityVerification'), 'aggregate', async () => []);
    await assert.rejects(loadActivity(), /unavailable/);
});
