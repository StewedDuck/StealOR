const test = require('node:test');
const assert = require('node:assert/strict');
const { matchingAccountFilter } = require('../src/services/matchingAccess');
const User = require('../src/models/User');
const Tor = require('../src/models/Tor');
const GovProject = require('../src/models/GovProject');
const TorAnalysis = require('../src/models/TorAnalysis');
const { getMatchedTors } = require('../src/controllers/matchingController');
for (const role of ['contractor', 'project_owner', 'admin']) test(`matching access for ${role} follows the UI role policy`, async t => {
    let captured;
    t.mock.method(User, 'findOne', async filter => {
        captured = filter;
        return filter.accountRole.$in.includes(role) ? { toObject: () => ({ _id: 'user', accountRole: role }) } : null;
    });
    for (const Model of [Tor, GovProject, TorAnalysis]) t.mock.method(Model, 'find', () => ({ lean: async () => [] }));
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await getMatchedTors({ profileEmail: 'signed-in@test.com', query: { refresh: 'false' } }, res);
    assert.equal(captured.email, 'signed-in@test.com');
    assert.equal(res.code, role === 'admin' ? 403 : 200);
    assert.equal(captured.isActive.$ne, false);
});
test('matching policy does not broaden access to inactive accounts or admins', () => {
    assert.deepEqual(matchingAccountFilter(), { accountRole: { $in: ['contractor', 'project_owner'] }, isActive: { $ne: false } });
});
