const mongoose = require('mongoose');

// Short-lived database snapshots. Stale snapshots are served while one read refreshes them.
// This cache contains no AI computations and never shares contractor results under a common key.
function createReadCache({ now = Date.now, maxEntries = 32 } = {}) {
    const entries = new Map();
    function invalidate(prefix = '') {
        for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    }
    function read(key, loader, { ttlMs = 5000, force = false } = {}) {
        if (force) entries.delete(key);
        let entry = entries.get(key);
        if (entry && now() < entry.expiresAt && entry.value !== undefined) return Promise.resolve(entry.value);
        if (entry?.pending) return entry.value !== undefined ? Promise.resolve(entry.value) : entry.pending;
        if (!entry) {
            if (entries.size >= maxEntries) {
                // Do not evict in-flight reads: that would multiply slow database requests.
                const oldest = [...entries].find(([, item]) => !item.pending);
                if (oldest) entries.delete(oldest[0]);
                else return Promise.resolve().then(loader);
            }
            entry = { value: undefined, expiresAt: 0, pending: null };
            entries.set(key, entry);
        }
        const current = entry;
        current.pending = Promise.resolve().then(loader).then(value => {
            if (entries.get(key) === current) { current.value = value; current.expiresAt = now() + ttlMs; }
            return value;
        }).catch(error => {
            if (current.value === undefined) { if (entries.get(key) === current) entries.delete(key); throw error; }
            console.warn('[MATCHING] Snapshot refresh deferred; retaining previous data');
            // Back off transient failures rather than hammering the database on every poll.
            current.expiresAt = now() + ttlMs;
            return current.value;
        }).finally(() => { current.pending = null; });
        return current.value !== undefined ? (current.pending.catch(() => {}), Promise.resolve(current.value)) : current.pending;
    }
    return { read, invalidate };
}
const databases = new WeakMap();
function currentCache() {
    const client = mongoose.connection.getClient();
    if (mongoose.connection.readyState !== 1 || !client?.topology) return null;
    if (!databases.has(client)) databases.set(client, createReadCache());
    return databases.get(client);
}
function readMatchingData(key, loader, options) {
    return currentCache()?.read(key, loader, options) || Promise.resolve().then(loader);
}
function invalidateMatchingData(prefix) { currentCache()?.invalidate(prefix); }
module.exports = { createReadCache, readMatchingData, invalidateMatchingData };
