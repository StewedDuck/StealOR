const crypto = require('node:crypto');
const mongoose = require('mongoose');

const ALGORITHM_VERSION = 'tor-matching-v3';
const PROMPT_VERSION = 'semantic-th-v5';
const SCORING_VERSION = 'partial-groups-v2-owner';
const TTL_MS = 7 * 86400000;
function canonical(value) {
    if (value == null || typeof value !== 'object') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (Array.isArray(value)) return value.map(canonical);
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}
function hash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
const indexes = new WeakMap();
function collection(name) {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return null;
    const coll = mongoose.connection.db.collection(name);
    const db = mongoose.connection.db;
    if (!indexes.has(db)) indexes.set(db, new Set());
    const names = indexes.get(db);
    if (!names.has(name)) {
        names.add(name);
        coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {
            names.delete(name);
            console.warn('[MATCHING] TTL index unavailable');
        });
    }
    return coll;
}
// Shared by relevance matching and mandatory past-project verification.
let activeAI = 0;
const waitingAI = [];
async function withAIConcurrency(work) {
    if (activeAI >= 2) {
        if (waitingAI.length >= 100) throw new Error('Matching AI queue is full');
        await new Promise(resolve => waitingAI.push(resolve));
    } else {
        activeAI++;
    }
    try {
        return await work();
    } finally {
        const next = waitingAI.shift();
        if (next) next();
        else activeAI--;
    }
}
module.exports = { SCORING_VERSION, ALGORITHM_VERSION, PROMPT_VERSION, TTL_MS, hash, collection, withAIConcurrency };
