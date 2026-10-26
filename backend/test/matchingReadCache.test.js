const test = require('node:test');
const assert = require('node:assert/strict');
const { createReadCache } = require('../src/services/matchingReadCache');
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
test('concurrent cold requests share one database read, with keys isolating accounts', async () => {
    const cache = createReadCache(); const task = deferred(); let calls = 0;
    const loader = () => { calls++; return task.promise; };
    const a = cache.read('account-a', loader), b = cache.read('account-a', loader);
    task.resolve('a'); assert.equal(await a, 'a'); assert.equal(await b, 'a'); assert.equal(calls, 1);
    assert.equal(await cache.read('account-b', async () => 'b'), 'b');
    assert.equal(await cache.read('account-a', loader), 'a');
});
test('expired snapshot returns previous results immediately while one refresh runs', async () => {
    let now = 0; const cache = createReadCache({ now: () => now });
    await cache.read('rows', async () => 'old', { ttlMs: 10 }); now = 11;
    const task = deferred(); let calls = 0;
    const loader = () => { calls++; return task.promise; };
    assert.equal(await cache.read('rows', loader), 'old');
    assert.equal(await cache.read('rows', loader), 'old'); assert.equal(calls, 1);
    task.resolve('new'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(await cache.read('rows', loader), 'new');
});
test('invalidation after new matching result prevents an older in-flight read from repopulating cache', async () => {
    const cache = createReadCache(); const task = deferred();
    const old = cache.read('stored:user', () => task.promise);
    cache.invalidate('stored:');
    assert.equal(await cache.read('stored:user', async () => 'new'), 'new');
    task.resolve('old'); await old;
    assert.equal(await cache.read('stored:user', async () => 'wrong'), 'new');
});
test('cold failures can retry, and failed background refresh retains existing results', async () => {
    let now = 0; const cache = createReadCache({ now: () => now });
    await assert.rejects(cache.read('rows', async () => { throw Error('database offline'); }));
    assert.equal(await cache.read('rows', async () => 'last result', { ttlMs: 10 }), 'last result'); now = 11;
    assert.equal(await cache.read('rows', async () => { throw Error('offline'); }), 'last result');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await cache.read('rows', async () => 'wrong'), 'last result');
});
test('manual force retry bypasses cached data', async () => {
    const cache = createReadCache(); await cache.read('rows', async () => 'old');
    assert.equal(await cache.read('rows', async () => 'new', { force: true }), 'new');
});
