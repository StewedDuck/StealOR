const test = require('node:test');
const assert = require('node:assert/strict');
const Tor = require('../src/models/Tor');
const Comment = require('../src/models/Comment');
const { getSharedDraftTors, getTors } = require('../src/controllers/torController');
const { createComment } = require('../src/controllers/commentController');
function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
}
test('shared draft browsing includes other owners while owner management stays scoped', async t => {
    const rows = [{ _id: 'draft-a', status: 'draft' }, { _id: 'draft-b', status: 'draft' }];
    const queries = [];
    t.mock.method(Tor, 'find', query => {
        queries.push(query);
        return { select(fields) {
            assert.ok(!fields.split(' ').includes('ownerId'));
            return this;
        }, sort() { return query.ownerId ? Promise.resolve([rows[0]]) : this; }, lean: async () => rows };
    });
    for (const ownerId of ['account-a', 'account-b']) {
        const res = response();
        await getSharedDraftTors({ ownerId }, res);
        assert.deepEqual(res.body.data, rows);
    }
    const managed = response();
    await getTors({ ownerId: 'account-a', query: { status: 'draft' } }, managed);
    assert.deepEqual(queries, [{ status: 'draft' }, { status: 'draft' }, { ownerId: 'account-a', status: 'draft' }]);
    assert.equal(managed.body.data.length, 1);
});
test('another account can submit a review for a shared draft', async t => {
    t.mock.method(Comment, 'create', async data => ({ _id: 'review', ...data }));
    const res = response();
    await createComment({ body: { userId: 'reviewer@example.com', userName: 'Reviewer', projectId: 'other-owner-draft', content: ' ข้อเสนอแนะจากบัญชีอื่น ' } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.projectId, 'other-owner-draft');
    assert.equal(res.body.data.content, 'ข้อเสนอแนะจากบัญชีอื่น');
});
test('shared draft route is read-only and registered before owner-only middleware', () => {
    const routes = require('../src/routes/torRoutes').stack;
    const index = routes.findIndex(layer => layer.route?.path === '/drafts');
    const auth = routes.findIndex(layer => layer.handle.name === 'torOwnerAuth');
    assert.ok(index >= 0 && index < auth);
    assert.deepEqual(Object.keys(routes[index].route.methods), ['get']);
});
