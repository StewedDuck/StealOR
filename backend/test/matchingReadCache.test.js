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

test('background writes retain warm snapshots and coalesce refreshes without caching an invalidated read as fresh', async () => {
    let now = 10; const cache = createReadCache({ now: () => now });
    await cache.read('analyses', async () => 'old');
    cache.invalidate('analyses', { retainValue: true });
    const task = deferred(); let calls = 0;
    const load = () => { calls++; return task.promise; };
    assert.equal(await cache.read('analyses', load), 'old');
    cache.invalidate('analyses', { retainValue: true });
    assert.equal(await cache.read('analyses', load), 'old');
    assert.equal(calls, 1, 'Writes during refresh must not multiply database reads');
    task.resolve('intermediate'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(await cache.read('analyses', async () => 'latest'), 'intermediate');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await cache.read('analyses', async () => 'wrong'), 'latest');
    cache.invalidate('analyses', { retainValue: true });
    assert.equal(await cache.read('analyses', async () => 'forced', { force: true }), 'forced');
});

test('cold reads return within budget while the shared cache continues warming', async () => {
    const { readWithinBudget } = require('../src/services/matchingReadCache');
    const cache = createReadCache(); const task = deferred(); let calls = 0;
    const read = cache.read('catalog', () => { calls++; return task.promise; });
    assert.equal(await readWithinBudget(read, 5), null);
    task.resolve(['TOR']); await read;
    assert.deepEqual(await readWithinBudget(cache.read('catalog', async () => { calls++; return []; }), 5), { value: ['TOR'] });
    assert.equal(calls, 1);
    await assert.rejects(readWithinBudget(Promise.reject(Error('offline')), 5), /offline/);
});
