const { randomUUID } = require('node:crypto');
const matchingService = require('./torMatchingService');
const { SCORING_VERSION, ALGORITHM_VERSION, PROMPT_VERSION, TTL_MS, hash, collection } = require('./matchingCache');
const { DEFAULT_MODEL } = require('../config/vertex');

// One process-wide queue: page requests never create independent worker pools.
const queue = new Map();
let active = 0;
const CONCURRENCY = 2;
const MAX_QUEUED = 500;
const LEASE_MS = 180000;
const RETRY_MS = 60000;
const MAX_FAILURES = 3;
const OPTIONS = { bidSubmissionDate: null, requiredFinancialYear: null };

function descriptor(contractor, analysis) {
    const profile = {};
    const fields = new Set([
        'pastProjects', 'teamQualifications', 'legalEligibility', 'teamSize',
        'experienceYears', 'registeredCapital', 'financialStatements',
        ...(analysis.requirements || []).map(r => r.profileField),
        ...(analysis.projectRelevance || []).flatMap(r => r.profileFields || []),
    ]);
    for (const field of fields) {
        if (!field) continue;
        const root = field.split('.')[0];
        if (contractor[root] !== undefined) profile[root] = contractor[root];
    }
    const id = hash({ contractorId: String(contractor._id), source: analysis.torSource, torId: String(analysis.torId) });
    const fingerprint = hash({
        algorithm: ALGORITHM_VERSION, prompt: PROMPT_VERSION,
        ...(analysis.torSource === 'internal' ? { ownerCriteriaVersion: 'v2' } : {}),
        model: process.env.VERTEX_AI_MODEL || DEFAULT_MODEL,
        profile, requirements: analysis.requirements || [],
        relevance: analysis.projectRelevance || [], status: analysis.status,
        relevanceStatus: analysis.relevanceStatus, options: OPTIONS,
        // Past-project eligibility depends on the current year.
        year: new Date().getUTCFullYear(),
    });
    return { id, fingerprint };
}

async function compute(task) {
    const coll = collection('precomputed_matching');
    if (!coll) return;
    const token = randomUUID();
    const now = new Date();
    // Atomic ownership across Node processes; expired leases recover after restart.
    try {
        await coll.updateOne({ _id: task.id }, { $setOnInsert: { expiresAt: new Date(Date.now() + TTL_MS) } }, { upsert: true });
        const claimed = await coll.updateOne({
            _id: task.id,
            $and: [
                { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
                ...(task.force ? [] : [{ $or: [{ fingerprint: { $ne: task.fingerprint } }, { expiresAt: { $lte: now } }, { retryAt: { $lte: now } }] }]),
            ],
        }, { $set: { token, attemptedFingerprint: task.fingerprint, leaseUntil: new Date(Date.now() + LEASE_MS), expiresAt: new Date(Date.now() + TTL_MS) } });
        if (!claimed.modifiedCount) return;
        const start = Date.now();
        const heartbeat = setInterval(() => {
            coll.updateOne({ _id: task.id, token }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
        }, 30000);
        heartbeat.unref();
        let result;
        let failure;
        try {
            result = await matchingService.calculateMatching(task.contractor, task.analysis, {
                ...OPTIONS, onSemanticError: value => { failure = value; },
            });
        } finally {
            clearInterval(heartbeat);
        }
        const unavailable = result.relevanceResults.some(r => r.semanticMatchingStatus === 'unavailable');
        const failureCount = unavailable ? (task.failureCount || 0) + 1 : 0;
        const canRetry = unavailable && failure?.retryable !== false && failureCount < MAX_FAILURES;
        await coll.updateOne({ _id: task.id, token }, {
            $set: {
                fingerprint: task.fingerprint, scoringVersion: SCORING_VERSION, result, computedAt: new Date(),
                expiresAt: new Date(Date.now() + TTL_MS),
                failureCount,
                contractorId: String(task.contractor._id), torId: String(task.analysis.torId), torSource: task.analysis.torSource,
                ...(result.matchingPercentage > 39 && !(task.previousPercentage > 39) ? { notificationPending: true } : {}),
                ...(unavailable ? { failureCode: failure?.code || 'AI_UNAVAILABLE', failureRetryable: failure?.retryable !== false } : {}),
                ...(canRetry ? { retryAt: new Date(Date.now() + RETRY_MS * 2 ** (failureCount - 1)) } : {}),
            },
            $unset: { leaseUntil: '', token: '', ...(!canRetry ? { retryAt: '' } : {}), ...(!unavailable ? { failureCode: '', failureRetryable: '' } : {}) },
        });
        try {
            if (result.matchingPercentage > 39 && !(task.previousPercentage > 39)) {
                await require('./notifications/matchingNotificationService').notifyNewMatching(task.contractor, task.analysis, result);
                await coll.updateOne({ _id: task.id, fingerprint: task.fingerprint }, { $set: { notificationPending: false } });
            }
        } catch { console.warn('[NOTIFICATION] New matching notification deferred'); }
        console.log(`[MATCHING] Background result completed in ${Date.now() - start}ms`);
    } catch {
        console.warn('[MATCHING] Background calculation unavailable');
        await coll.updateOne({ _id: task.id, token }, {
            $set: {
                failureCode: 'COMPUTATION_UNAVAILABLE', failureCount: (task.failureCount || 0) + 1,
                ...((task.failureCount || 0) + 1 < MAX_FAILURES ? { retryAt: new Date(Date.now() + RETRY_MS) } : {}),
            },
            $unset: { leaseUntil: '', token: '' },
        }).catch(() => {});
    }
}
function drain() {
    for (const [key, task] of queue) {
        if (active >= CONCURRENCY) break;
        if (task.running) continue;
        task.running = true;
        active++;
        compute(task).finally(() => {
            active--;
            queue.delete(key);
            drain();
        });
    }
}
async function getAvailableMatching(contractor, analyses, options = {}) {
    const descriptors = analyses.map(analysis => ({ ...descriptor(contractor, analysis), analysis, contractor }));
    const coll = collection('precomputed_matching');
    let stored = [];
    if (coll) {
        try {
            stored = await coll.find({ _id: { $in: descriptors.map(d => d.id) } }).toArray();
        } catch {
            console.warn('[MATCHING] Stored results unavailable');
        }
    }
    // Formula-only migration reuses evaluated groups; it never invokes Gemini.
    await Promise.all(stored.map(async row => {
        if (!row.result || row.scoringVersion === SCORING_VERSION) return;
        const result = matchingService.rescoreMatchingResult(row.result);
        row.result = result;
        row.scoringVersion = SCORING_VERSION;
        try {
            await coll.updateOne({ _id: row._id, fingerprint: row.fingerprint, computedAt: row.computedAt }, {
                $set: { result, scoringVersion: SCORING_VERSION },
            });
        } catch { console.warn('[MATCHING] Stored score migration unavailable'); }
    }));
    const byId = new Map(stored.map(row => [row._id, row]));
    return descriptors.map(task => {
        const row = byId.get(task.id);
        task.previousPercentage = row?.result?.matchingPercentage ?? null;
        const now = new Date();
        const fresh = row?.result && row.fingerprint === task.fingerprint && row.expiresAt > now && row.computedAt?.getTime() + TTL_MS > Date.now();
        const sameAttempt = row?.attemptedFingerprint === task.fingerprint;
        task.failureCount = !options.force && sameAttempt ? row?.failureCount || 0 : 0;
        task.force = !!options.force;
        const unavailable = fresh && row.result.relevanceResults.some(r => r.semanticMatchingStatus === 'unavailable');
        const blocked = sameAttempt && (task.failureCount >= MAX_FAILURES || row?.failureRetryable === false || ['AI_CONFIGURATION', 'AI_AUTHENTICATION'].includes(row?.failureCode));
        const pending = !fresh || !!row?.retryAt || unavailable || (sameAttempt && !!row?.failureCode) || row?.leaseUntil > now;
        if (options.refresh !== false && pending && (!blocked || options.force) &&
            (!row?.retryAt || row.retryAt <= now || !sameAttempt || options.force) && !queue.has(task.id) && queue.size < MAX_QUEUED) {
            queue.set(task.id, task);
        }
        const running = row?.leaseUntil > now || queue.get(task.id)?.running;
        const queued = queue.has(task.id) && !running;
        const refreshState = running ? 'running' : queued ? 'queued' : blocked ? 'failed' :
            pending && row?.retryAt ? 'retry_wait' : pending ? 'idle' : 'ready';
        return {
            result: row?.result || null,
            matchingStatus: refreshState === 'failed' ? 'unavailable' : pending || queued || running ? (row?.result ? 'stale' : 'pending') : 'ready',
            refreshState,
            failureCode: sameAttempt ? row?.failureCode || null : null,
            retryAt: row?.retryAt || null,
            computedAt: row?.computedAt || null,
        };
    });
}
// Start after the response can be assembled; no AI is awaited by list handlers.
function startRefresh() { setImmediate(drain); }
module.exports = { getAvailableMatching, startRefresh, descriptor };
