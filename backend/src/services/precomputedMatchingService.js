const { configurationRecoveryKey, canRecoverConfiguration } = require('./matchingFailure');
const { readMatchingData, invalidateMatchingData } = require('./matchingReadCache');
const { randomUUID } = require('node:crypto');
const matchingService = require('./torMatchingService');
const { SCORING_VERSION, ALGORITHM_VERSION, PROMPT_VERSION, hash, collection } = require('./matchingCache');
const { DEFAULT_MODEL } = require('../config/vertex');
const User = require('../models/User');

// One process-wide queue: page requests never create independent worker pools.
const queue = new Map();
let active = 0;
const CONCURRENCY = 2;
const MAX_QUEUED = 500;
const LEASE_MS = 180000;
const RETRY_MS = 60000;
const MAX_FAILURES = 3;
const OPTIONS = { bidSubmissionDate: null, requiredFinancialYear: null };

function normalizeMatchingProfile(contractor) {
    const raw = typeof contractor.toObject === 'function' ? contractor.toObject() : contractor;
    // Lean background reads omit schema defaults. Apply the same defaults used
    // by API documents, including nested past-project and legal fields.
    return { ...raw, ...User.hydrate(raw).toObject(), _id: raw._id };
}

function profileDescriptor(contractor, analysis) {
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
    const legacyId = hash({ contractorId: String(contractor._id), source: analysis.torSource, torId: String(analysis.torId) });
    const fingerprint = hash({
        algorithm: ALGORITHM_VERSION, prompt: PROMPT_VERSION,
        ...(analysis.torSource === 'internal' ? { ownerCriteriaVersion: 'v2' } : {}),
        model: process.env.VERTEX_AI_MODEL || DEFAULT_MODEL,
        profile, requirements: analysis.requirements || [],
        relevance: analysis.projectRelevance || [], status: analysis.status,
        relevanceStatus: analysis.relevanceStatus, options: OPTIONS,
        // Past-project eligibility depends on the current year.
        year: new Date().getUTCFullYear(),
        // Rolling experience windows can cross their cutoff on any day.
        ...((analysis.requirements || []).some(r => r.category === 'mandatory' &&
            ['pastProjects', 'maxPastProjectValue', 'projectTypes'].includes(r.profileField))
            ? { eligibilityDate: new Date().toISOString().slice(0, 10) } : {}),
    });
    // Results for different inputs must never overwrite each other, including
    // workers still running older application code against the same database.
    const id = hash({ identity: legacyId, fingerprint });
    return { id, legacyId, fingerprint };
}

function descriptor(contractor, analysis) {
    return profileDescriptor(normalizeMatchingProfile(contractor), analysis);
}

async function compute(task) {
    const coll = collection('precomputed_matching');
    if (!coll) return;
    const token = randomUUID();
    const now = new Date();
    // Atomic ownership across Node processes; expired leases recover after restart.
    try {
        await coll.updateOne({ _id: task.id }, { $setOnInsert: { contractorId: String(task.contractor._id) } }, { upsert: true });
        const claimed = await coll.updateOne({
            _id: task.id,
            $and: [
                { $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] },
                ...(task.force ? [] : [{ $or: [{ fingerprint: { $ne: task.fingerprint } }, { retryAt: { $lte: now } }] }]),
            ],
        }, { $set: { token, attemptedFingerprint: task.fingerprint, attemptedConfigurationKey: task.configurationKey || '', leaseUntil: new Date(Date.now() + LEASE_MS) } });
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
                failureCount,
                contractorId: String(task.contractor._id), torId: String(task.analysis.torId), torSource: task.analysis.torSource,
                ...(result.matchingPercentage > 39 && !(task.previousPercentage > 39) ? { notificationPending: true } : {}),
                ...(unavailable ? { failureCode: failure?.code || 'AI_UNAVAILABLE', failureRetryable: failure?.retryable !== false } : {}),
                ...(canRetry ? { retryAt: new Date(Date.now() + RETRY_MS * 2 ** (failureCount - 1)) } : {}),
            },
            $unset: { expiresAt: '', leaseUntil: '', token: '', ...(!canRetry ? { retryAt: '' } : {}), ...(!unavailable ? { failureCode: '', failureRetryable: '' } : {}) },
        });
        try {
            if (result.matchingPercentage > 39 && !(task.previousPercentage > 39)) {
                await require('./notifications/matchingNotificationService').notifyNewMatching(task.contractor, task.analysis, result);
                await coll.updateOne({ _id: task.id, fingerprint: task.fingerprint }, { $set: { notificationPending: false } });
            }
        } catch { console.warn('[NOTIFICATION] New matching notification deferred'); }
        invalidateMatchingData('stored:', { retainValue: true });
        console.log(`[MATCHING] Background result completed in ${Date.now() - start}ms`);
    } catch {
        invalidateMatchingData('stored:', { retainValue: true });
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
async function loadStoredMatching(contractorId, options = {}) {
    const coll = collection('precomputed_matching');
    if (!coll) return [];
    const id = String(contractorId);
    try {
        return await readMatchingData(`stored:${id}`, () => coll.find({ contractorId: id }, { projection: {
            contractorId: 1, torId: 1, torSource: 1, fingerprint: 1, attemptedFingerprint: 1,
            computedAt: 1, 'result.torId': 1, 'result.torSource': 1, 'result.matchingPercentage': 1,
        } }).toArray(), { force: !!options.force });
    } catch {
        console.warn('[MATCHING] Stored results unavailable');
        // A failed read must never masquerade as an empty successful result.
        throw new Error('Stored matching results unavailable');
    }
}
async function getAvailableMatching(contractor, analyses, options = {}) {
    contractor = normalizeMatchingProfile(contractor);
    const descriptors = analyses.map(analysis => ({ ...profileDescriptor(contractor, analysis), analysis, contractor }));
    if (descriptors.length === 0) return [];
    const coll = collection('precomputed_matching');
    const metadata = options.storedRows || await loadStoredMatching(contractor._id, options);
    const metadataById = new Map(metadata.map(row => [row._id, row]));
    // Read all version identities cheaply, then download evidence only for the
    // requested current inputs (or the latest saved fallback). Never discard an
    // exact current fingerprint just because another version was computed later.
    const selectedIds = [...new Set(descriptors.flatMap(task => {
        const exact = metadataById.get(task.id);
        if (exact) return [exact._id];
        const legacy = metadataById.get(task.legacyId);
        if (legacy?.result && legacy.fingerprint === task.fingerprint) return [legacy._id];
        const latest = metadata.filter(row => row.result &&
            String(row.torId || row.result.torId) === String(task.analysis.torId) &&
            (row.torSource || row.result.torSource) === task.analysis.torSource)
            .sort((a, b) => new Date(b.computedAt || 0) - new Date(a.computedAt || 0))[0];
        return latest ? [latest._id] : [];
    }))];
    const candidates = selectedIds.length ? await readMatchingData(
        `stored:${contractor._id}:details:${hash([...selectedIds].sort())}`,
        () => coll.find({ contractorId: String(contractor._id), _id: { $in: selectedIds } }).toArray(),
        { force: !!options.force },
    ) : [];
    const candidatesById = new Map(candidates.map(row => [row._id, row]));
    let migrated = false;
    const stored = await Promise.all(descriptors.map(async task => {
        const exact = candidatesById.get(task.id);
        if (exact) return { ...exact };
        const legacy = candidatesById.get(task.legacyId);
        if (legacy?.result && legacy.fingerprint === task.fingerprint) {
            const { _id, ...saved } = legacy;
            await coll.updateOne({ _id: task.id }, { $setOnInsert: { ...saved, cacheFormat: 'input-v1' } }, { upsert: true });
            migrated = true;
            return { ...saved, _id: task.id };
        }
        // Keep the last result visible while changed inputs are evaluated.
        const older = candidates.filter(row => row.result &&
            String(row.torId || row.result.torId) === String(task.analysis.torId) &&
            (row.torSource || row.result.torSource) === task.analysis.torSource)
            .sort((a, b) => new Date(b.computedAt || 0) - new Date(a.computedAt || 0))[0];
        return older ? { ...older } : null;
    }));
    if (migrated) invalidateMatchingData(`stored:${contractor._id}`);
    // Formula-only migration reuses evaluated groups; it never invokes Gemini.
    await Promise.all(stored.filter(Boolean).map(async row => {
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
    const byId = new Map(descriptors.map((task, index) => [task.id, stored[index]]));
    return descriptors.map(task => {
        const row = byId.get(task.id);
        task.previousPercentage = row?.result?.matchingPercentage ?? null;
        const now = new Date();
        const fresh = row?.result && row.fingerprint === task.fingerprint;
        task.configurationKey = configurationRecoveryKey();
        const recovering = canRecoverConfiguration(row?.failureCode, row?.attemptedConfigurationKey, task.configurationKey);
        const sameAttempt = row?.attemptedFingerprint === task.fingerprint && !recovering;
        task.failureCount = !options.force && sameAttempt ? row?.failureCount || 0 : 0;
        task.force = !!options.force || recovering;
        const unavailable = fresh && row.result.relevanceResults.some(r => r.semanticMatchingStatus === 'unavailable');
        const blocked = sameAttempt && (task.failureCount >= MAX_FAILURES || row?.failureRetryable === false || ['AI_CONFIGURATION', 'AI_AUTHENTICATION'].includes(row?.failureCode));
        const pending = !fresh || !!row?.retryAt || unavailable || (sameAttempt && !!row?.failureCode);
        // A stale snapshot may have queued this ID before another worker
        // completed it. Queue bookkeeping must not demote a valid result.
        if (!pending && queue.has(task.id) && !queue.get(task.id).running) queue.delete(task.id);
        if (options.refresh !== false && pending && (!blocked || options.force) &&
            (!row?.retryAt || row.retryAt <= now || !sameAttempt || options.force) && !queue.has(task.id) && queue.size < MAX_QUEUED) {
            queue.set(task.id, task);
        }
        const running = pending && (row?.leaseUntil > now || queue.get(task.id)?.running);
        const queued = pending && queue.has(task.id) && !running;
        const refreshState = running ? 'running' : queued ? 'queued' : blocked ? 'failed' :
            pending && row?.retryAt ? 'retry_wait' : pending ? 'idle' : 'ready';
        return {
            result: row?.result ? matchingService.refreshMatchingExplanations(row.result, contractor, task.analysis) : null,
            matchingStatus: refreshState === 'failed' ? 'unavailable' : pending || queued || running ? (row?.result ? 'stale' : 'pending') : 'ready',
            refreshState,
            failureCode: sameAttempt ? row?.failureCode || null : null,
            retryAt: row?.retryAt || null,
            computedAt: row?.computedAt || null,
            inputFingerprint: task.fingerprint,
        };
    });
}
// Start after the response can be assembled; no AI is awaited by list handlers.
function startRefresh() { setImmediate(drain); }
module.exports = { getAvailableMatching, loadStoredMatching, startRefresh, descriptor, normalizeMatchingProfile };
