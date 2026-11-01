const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function loadCache() {
    const filename = path.resolve(__dirname, '../lib/adminDashboardSnapshot.ts');
    const mod = new Module(filename, module);
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
    return mod.exports;
}
const summary = { users: 7, tors: 17, pendingVerifications: 0, pendingTorReviews: 0 };
test('cache isolates accounts and sections and expires after five minutes', t => {
    let now = 1000000;
    t.mock.method(Date, 'now', () => now);
    const cache = loadCache();
    cache.writeAdminSnapshot('Admin@example.com', 'summary', summary);
    assert.deepEqual(cache.readAdminSnapshot(' admin@example.com ', 'summary'), summary);
    assert.equal(cache.readAdminSnapshot('other@example.com', 'summary'), null);
    assert.equal(cache.readAdminSnapshot('admin@example.com', 'charts'), null);
    now += 300000;
    assert.equal(cache.readAdminSnapshot('admin@example.com', 'summary'), null);
});
test('session storage survives module reload and storage failures are optional', t => {
    const storage = new Map();
    t.after(() => { delete globalThis.window; });
    globalThis.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } };
    loadCache().writeAdminSnapshot('admin@example.com', 'summary', summary);
    assert.deepEqual(loadCache().readAdminSnapshot('admin@example.com', 'summary'), summary);
    globalThis.window.sessionStorage.getItem = () => { throw Error('storage disabled'); };
    globalThis.window.sessionStorage.setItem = () => { throw Error('storage disabled'); };
    const cache = loadCache();
    assert.equal(cache.readAdminSnapshot('admin@example.com', 'summary'), null);
    cache.writeAdminSnapshot('admin@example.com', 'summary', summary);
    assert.deepEqual(cache.readAdminSnapshot('admin@example.com', 'summary'), summary);
});
