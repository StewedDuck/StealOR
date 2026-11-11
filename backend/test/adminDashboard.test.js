const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Tor = require('../src/models/Tor');
const Verification = require('../src/models/IdentityVerification');
const { getSummary } = require('../src/routes/adminDashboardRoutes');

test('admin summary counts persisted records and scopes pending queues', async t => {
    t.mock.method(User, 'countDocuments', async filter => { assert.deepEqual(filter, {}); return 10; });
    t.mock.method(Tor, 'countDocuments', async filter => {
        if (Object.keys(filter).length === 0) return 7;
        assert.deepEqual(filter, { reviewStatus: 'pending' }); return 2;
    });
    t.mock.method(Verification, 'countDocuments', async filter => {
        assert.deepEqual(filter, { status: 'pending' }); return 3;
    });
    await getSummary({}, { json(result) {
        assert.deepEqual(result, { success: true, data: { users: 10, tors: 7, pendingVerifications: 3, pendingTorReviews: 2 } });
    } });
});
test('database failure returns an error rather than fabricated zero counts', async t => {
    t.mock.method(User, 'countDocuments', async () => { throw Error('database unavailable'); });
    t.mock.method(Tor, 'countDocuments', async () => 0);
    t.mock.method(Verification, 'countDocuments', async () => 0);
    await getSummary({}, { status(code) { assert.equal(code, 500); return this; }, json(result) {
        assert.equal(result.success, false); assert.equal(result.data, undefined);
    } });
});
