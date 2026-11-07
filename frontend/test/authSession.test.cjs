const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function callbacks() {
    const filename = path.resolve(__dirname, '../lib/auth.ts');
    const mod = new Module(filename, module);
    let config;
    mod.require = id => id === 'next-auth' ? { default: value => { config = value; return {}; } }
        : id === 'next-auth/providers/google' ? { default: value => value } : require(id);
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
    return config.callbacks;
}
test('backend failures retain the signed session instead of logging the user out', async t => {
    const { jwt } = callbacks();
    const token = { email: 'admin@example.com' };
    for (const status of [404, 500, 503]) {
        t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status }));
        assert.equal(await jwt({ token }), token);
    }
    t.mock.method(console, 'error', () => {});
    t.mock.method(globalThis, 'fetch', async () => { throw Error('timeout'); });
    assert.equal(await jwt({ token }), token);
});
test('confirmed suspension stays enforced until the backend confirms an active account', async t => {
    const { jwt, session } = callbacks();
    const token = { email: 'admin@example.com' };
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403, json: async () => ({ code: 'ACCOUNT_SUSPENDED' }) }));
    await jwt({ token });
    assert.equal(token.accountSuspended, true);
    const result = await session({ session: { user: { email: token.email } }, token });
    assert.equal(result.accountSuspended, true);
    assert.equal(result.user.email, '');
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
    await jwt({ token });
    assert.equal(token.accountSuspended, true);
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
    await jwt({ token });
    assert.equal(token.accountSuspended, false);
});
