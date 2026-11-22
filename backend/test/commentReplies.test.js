const test = require('node:test');
const assert = require('node:assert/strict');
const Comment = require('../src/models/Comment');
const Tor = require('../src/models/Tor');
const User = require('../src/models/User');
const { createComment, getComments, deleteComment } = require('../src/controllers/commentController');
const PROJECT = '507f1f77bcf86cd799439011', PARENT = '507f191e810c19729de860ea';
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function setup(t, owner = 'owner@example.com') {
    t.mock.method(Tor, 'findById', id => {
        assert.equal(id, PROJECT);
        return { select: () => ({ lean: async () => owner ? { ownerId: owner } : null }) };
    });
    return t.mock.method(Comment, 'create', async data => ({ _id: 'new-comment', ...data }));
}
const request = (body = {}, email = 'contractor@example.com') => ({ profileEmail: email, body: {
    projectId: PROJECT, userName: 'Test user', content: ' A reply ', ...body,
} });

test('authenticated contractor replies to a comment on the same TOR', async t => {
    const writes = setup(t);
    t.mock.method(Comment, 'findOne', async filter => {
        assert.deepEqual(filter, { _id: PARENT, projectId: PROJECT });
        return { _id: PARENT };
    });
    const res = response();
    await createComment(request({ parentId: PARENT }), res);
    assert.equal(res.code, 201);
    assert.equal(res.body.data.parentId, PARENT);
    assert.equal(res.body.data.content, 'A reply');
    assert.equal(res.body.data.isTorOwner, false);
    assert.equal(writes.mock.calls[0].arguments[0].userId, 'contractor@example.com');
});
test('owner replies carry the owner badge determined by TOR ownership', async t => {
    setup(t);
    t.mock.method(Comment, 'findOne', async () => ({ _id: PARENT }));
    const res = response();
    await createComment(request({ parentId: PARENT }, 'owner@example.com'), res);
    assert.equal(res.code, 201);
    assert.equal(res.body.data.isTorOwner, true);
});
test('spoofed userId and owner badge cannot impersonate the TOR owner', async t => {
    setup(t);
    const res = response();
    await createComment(request({ userId: 'owner@example.com', isTorOwner: true }), res);
    assert.equal(res.body.data.userId, 'contractor@example.com');
    assert.equal(res.body.data.isTorOwner, false);
});
test('rejects a missing or different-TOR parent without saving', async t => {
    const writes = setup(t);
    t.mock.method(Comment, 'findOne', async filter => {
        assert.equal(filter.projectId, PROJECT);
        return null;
    });
    const res = response();
    await createComment(request({ parentId: PARENT }), res);
    assert.equal(res.code, 404);
    assert.equal(writes.mock.callCount(), 0);
});
test('rejects malformed parent IDs and blank, non-text or overlength replies', async t => {
    const writes = setup(t);
    for (const body of [{ parentId: 'bad-id' }, { content: ' ' }, { content: {} }, { content: 'a'.repeat(1001) }]) {
        const res = response();
        await createComment(request(body), res);
        assert.equal(res.code, 400);
    }
    assert.equal(writes.mock.callCount(), 0);
});
test('top-level comments remain supported with no parent', async t => {
    setup(t);
    const res = response();
    await createComment(request(), res);
    assert.equal(res.code, 201);
    assert.equal(res.body.data.parentId, null);
});
test('listing existing comments and replies derives badges from current TOR ownership', async t => {
    setup(t);
    t.mock.method(Comment, 'find', () => ({ sort: () => ({ lean: async () => [
        { _id: PARENT, userId: 'OWNER@example.com', content: 'Original' },
        { _id: 'reply', userId: 'contractor@example.com', parentId: PARENT, isTorOwner: true },
    ] }) }));
    const res = response();
    await getComments({ params: { projectId: PROJECT } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.data[0].isTorOwner, true);
    assert.equal(res.body.data[1].isTorOwner, false);
    assert.equal(res.body.data[1].parentId, PARENT);
});
test('comments on a project with no internal owner never get an owner badge', async t => {
    setup(t, null);
    const res = response();
    await createComment(request({}, 'owner@example.com'), res);
    assert.equal(res.body.data.isTorOwner, false);
});
test('deleting a comment uses authenticated identity and does not delete other replies', async t => {
    t.mock.method(Comment, 'findOne', async filter => {
        assert.equal(filter.userId, 'contractor@example.com');
        return { _id: PARENT };
    });
    const deletes = t.mock.method(Comment, 'deleteOne', async filter => {
        assert.deepEqual(filter, { _id: PARENT });
        return { deletedCount: 1 };
    });
    const res = response();
    await deleteComment({ profileEmail: 'contractor@example.com', params: { commentId: PARENT }, body: { userId: 'owner@example.com' } }, res);
    assert.equal(res.code, 200);
    assert.equal(deletes.mock.callCount(), 1);
});
test('comment write routes require authenticated profile middleware', () => {
    const routes = require('../src/routes/commentRoutes').stack;
    for (const method of ['post', 'delete']) {
        const route = routes.find(layer => layer.route?.methods[method]).route;
        assert.equal(route.stack[0].handle.name, 'profileAuth');
    }
});

for (const role of ['admin', 'contractor']) {
    test(`${role} receives the badge when it is the actual TOR creator, without a role lookup`, async t => {
        setup(t, 'owner@example.com');
        t.mock.method(User, 'findOne', () => { throw Error('Ownership must not depend on account role'); });
        const res = response();
        await createComment(request({}, 'owner@example.com'), res);
        assert.equal(res.code, 201);
        assert.equal(res.body.data.isTorOwner, true);
    });
}
test('a project owner commenting on another owner’s TOR does not get a badge', async t => {
    setup(t, 'actual-creator@example.com');
    const res = response();
    await createComment(request({}, 'different-project-owner@example.com'), res);
    assert.equal(res.code, 201);
    assert.equal(res.body.data.isTorOwner, false);
});
test('listing badges identifies the creator on both comments and replies regardless of role', async t => {
    setup(t, 'owner@example.com');
    t.mock.method(Comment, 'find', () => ({ sort: () => ({ lean: async () => [
        { _id: PARENT, userId: 'owner@example.com', isTorOwner: true },
        { _id: 'reply', parentId: PARENT, userId: 'owner@example.com', isTorOwner: true },
    ] }) }));
    const res = response();
    await getComments({ params: { projectId: PROJECT } }, res);
    assert.equal(res.code, 200);
    assert.ok(res.body.data.every(comment => comment.isTorOwner === true));
});
