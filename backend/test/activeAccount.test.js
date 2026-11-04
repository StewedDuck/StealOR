const { test } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const activeAccount = require('../src/middleware/activeAccount');

test('live suspension blocks existing identities and reactivation restores access', async () => {
    const original = User.findOne;
    let account = { isActive: true };
    User.findOne = () => ({ select: () => ({ lean: async () => account }) });
    try {
        const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        let allowed = 0;
        const next = () => { allowed++; };
        await activeAccount('user@example.com', res, next);
        assert.equal(allowed, 1);
        account.isActive = false;
        await activeAccount('user@example.com', res, next);
        assert.equal(allowed, 1);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
        await activeAccount.fromRequest({ body: { userId: 'user@example.com' }, params: {}, query: {} }, res, next);
        assert.equal(allowed, 1);
        account.isActive = true;
        await activeAccount('user@example.com', res, next);
        assert.equal(allowed, 2);
        account = null;
        await activeAccount('new@example.com', res, next);
        assert.equal(allowed, 3);
        User.findOne = () => { throw new Error('database unavailable'); };
        await activeAccount('user@example.com', res, next);
        assert.equal(res.statusCode, 503);
        assert.equal(allowed, 3);
    } finally { User.findOne = original; }
});
