const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Tor = require('../models/Tor');
const GovProject = require('../models/GovProject');
const User = require('../models/User');
const TorAnalysis = require('../models/TorAnalysis');
const analyzer = require('./torAnalyzer');
const precomputed = require('./precomputedMatchingService');
const { hash, collection, withAIConcurrency } = require('./matchingCache');
const { visibleFilter, CATALOG_PROJECTION } = require('./torMatchingCatalog');
const { describeMatchingFailure } = require('./matchingFailure');
const { DEFAULT_MODEL } = require('../config/vertex');
const ANALYSIS_VERSION = 'tor-analysis-auto-v1';
const INTERVAL_MS = 60000;
const LEASE_MS = 180000;
const SCAN_BATCH = 100;
const PROFILE_PROJECTION = '_id email accountRole skills projectTypes pastProjects teamQualifications legalEligibility teamSize experienceYears registeredCapital financialStatements certifications certificationDetails hasGovernmentExperience maxPastProjectValue serviceAreas workModes experienceSummary profileSummary';
const ANALYSIS_BATCH = 2;
let running = false;
let interval;

function hasText(value) {
    if (typeof value === 'string') return !!value.trim();
    if (Array.isArray(value)) return value.some(hasText);
    return !!value && typeof value === 'object' && Object.values(value).some(hasText);
}
function hasAnalysisData(tor, source) {
    const data = source === 'government' ? tor.procurementAnalysis || {} : tor;
    return hasText(data.scopeOfWork) || hasText(data.technicalRequirements) || hasText(data.requirements);
}
function sourceFingerprint(tor, source) {
    return hash({ input: analyzer.buildTorText(tor, source), version: source === 'internal' ? `${ANALYSIS_VERSION}-owner-v3` : ANALYSIS_VERSION, model: process.env.VERTEX_AI_MODEL || DEFAULT_MODEL });
}
function analysisReady(analysis) {
    return !!analysis && ['completed', 'needs_review'].includes(analysis.status) &&
        ['ready', 'needs_review'].includes(analysis.relevanceStatus) && !!analysis.projectRelevance?.length;
}

async function ensureAnalysis(tor, source, options = {}) {
    const fingerprint = sourceFingerprint(tor, source);
    const identity = { torSource: source, torId: tor._id };
    let row = await TorAnalysis.findOne(identity).lean();
    if (!hasAnalysisData(tor, source)) {
        if (row?.pipelineState !== 'waiting_data' || row.attemptedFingerprint !== fingerprint) {
            await TorAnalysis.updateOne(identity, { $set: { pipelineState: 'waiting_data', attemptedFingerprint: fingerprint }, $setOnInsert: { status: 'pending' } }, { upsert: true });
        }
        return { state: 'waiting_data', attempted: false };
    }
    if (row?.sourceFingerprint === fingerprint && ['ready', 'not_available'].includes(row.pipelineState)) return { state: row.pipelineState, attempted: false };
    if (row?.leaseUntil > new Date()) return { state: 'processing', attempted: false };
    const sameAttempt = row?.attemptedFingerprint === fingerprint;
    if (sameAttempt && (row.attemptCount >= 3 || row.pipelineState === 'failed' || row.nextAttemptAt > new Date())) return { state: row.pipelineState, attempted: false };
    if (options.inspectOnly) return { state: 'pending', attempted: false };
    const token = randomUUID();
    try {
        await TorAnalysis.updateOne(identity, { $setOnInsert: { status: 'pending', pipelineState: 'pending' } }, { upsert: true });
        row = await TorAnalysis.findOneAndUpdate({ ...identity,
            $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }, { leaseUntil: { $exists: false } }],
        }, { $set: { leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS), pipelineState: 'processing',
            attemptedFingerprint: fingerprint, attemptCount: sameAttempt ? (row?.attemptCount || 0) + 1 : 1, nextAttemptAt: null } }, { returnDocument: 'after' }).lean();
        if (!row) return { state: 'processing', attempted: false };
    } catch (error) { if (error.code === 11000) return { state: 'processing', attempted: false }; throw error; }
    const heartbeat = setInterval(() => {
        TorAnalysis.updateOne({ ...identity, leaseToken: token }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {});
    }, 30000);
    heartbeat.unref();
    try {
        const result = await withAIConcurrency(() => analyzer.analyzeTor(tor, source));
        // Do not publish an analysis of a TOR that changed while Gemini was running.
        const model = source === 'government' ? GovProject : Tor;
        const current = await model.findOne({ _id: tor._id, ...visibleFilter(source) }).lean();
        if (!current || sourceFingerprint(current, source) !== fingerprint) {
            await TorAnalysis.updateOne({ ...identity, leaseToken: token }, { $set: { pipelineState: 'pending' }, $unset: { leaseToken: '', leaseUntil: '' } });
            return { state: 'pending', attempted: true };
        }
        const state = result.projectRelevance?.length ? 'ready' : 'not_available';
        await TorAnalysis.updateOne({ ...identity, leaseToken: token }, { $set: {
            ...result, analysisVersion: ANALYSIS_VERSION, sourceFingerprint: fingerprint,
            pipelineState: state, attemptCount: 0, nextAttemptAt: null, error: null,
        }, $unset: { leaseToken: '', leaseUntil: '' } }, { runValidators: true });
        console.log('[MATCHING PIPELINE] TOR analysis completed');
        return { state, attempted: true };
    } catch (error) {
        const failure = describeMatchingFailure(error);
        const retry = failure.retryable && row.attemptCount < 3;
        await TorAnalysis.updateOne({ ...identity, leaseToken: token }, { $set: {
            pipelineState: retry ? 'retry_wait' : 'failed', error: failure.code,
            nextAttemptAt: retry ? new Date(Date.now() + 60000 * 2 ** (row.attemptCount - 1)) : null,
        }, $unset: { leaseToken: '', leaseUntil: '' } });
        console.warn(`[MATCHING PIPELINE] TOR analysis unavailable (${failure.code})`);
        return { state: retry ? 'retry_wait' : 'failed', attempted: true };
    } finally { clearInterval(heartbeat); }
}

async function scanAnalyses(state) {
    const sources = state.firstSource === 'internal' ? ['internal', 'government'] : ['government', 'internal'];
    let budget = ANALYSIS_BATCH;
    for (const source of sources) {
        const cursorName = `${source}Cursor`;
        const model = source === 'government' ? GovProject : Tor;
        const filter = visibleFilter(source);
        if (state[cursorName]) filter._id = { $gt: state[cursorName] };
        // Check the newest/edited TORs before continuing the older backlog.
        // New imports must not wait for a complete cursor cycle through old projects.
        const newest = await model.find(visibleFilter(source), CATALOG_PROJECTION[source])
            .sort({ updatedAt: -1, _id: -1 }).limit(5).lean();
        for (const tor of newest) {
            if (budget === 0) break;
            const result = await ensureAnalysis(tor, source);
            if (result.attempted) budget--;
        }
        const rows = await model.find(filter, CATALOG_PROJECTION[source]).sort({ _id: 1 }).limit(SCAN_BATCH).lean();
        let visited = 0;
        for (const tor of rows) {
            if (budget === 0) break;
            const result = await ensureAnalysis(tor, source);
            if (result.attempted) budget--;
            state[cursorName] = tor._id;
            visited++;
        }
        if (visited === rows.length && rows.length < SCAN_BATCH) state[cursorName] = null;
    }
    state.firstSource = sources[1];
}
async function scanContractors(state) {
    let profile;
    if (state.activeProfile) profile = await User.findOne({ _id: state.activeProfile, accountRole: 'contractor' }, PROFILE_PROJECTION).lean();
    if (!profile) {
        const query = { accountRole: 'contractor' };
        if (state.profileCursor) query._id = { $gt: state.profileCursor };
        profile = await User.findOne(query, PROFILE_PROJECTION).sort({ _id: 1 }).lean();
        if (!profile) { state.profileCursor = null; state.activeProfile = null; state.matchAnalysisCursor = null; return; }
        state.activeProfile = profile._id;
        state.matchAnalysisCursor = null;
    }
    const query = { status: { $in: ['completed', 'needs_review'] }, relevanceStatus: { $in: ['ready', 'needs_review'] }, 'projectRelevance.0': { $exists: true } };
    if (state.matchAnalysisCursor) query._id = { $gt: state.matchAnalysisCursor };
    const analyses = await TorAnalysis.find(query).sort({ _id: 1 }).limit(SCAN_BATCH).lean();
    const eligible = [];
    for (const analysis of analyses) {
        const model = analysis.torSource === 'government' ? GovProject : Tor;
        const tor = await model.findOne({ _id: analysis.torId, ...visibleFilter(analysis.torSource) }).lean();
        if (tor && analysis.sourceFingerprint === sourceFingerprint(tor, analysis.torSource) && analysis.pipelineState === 'ready') eligible.push(analysis);
    }
    if (eligible.length) { await precomputed.getAvailableMatching(profile, eligible); precomputed.startRefresh(); }
    if (analyses.length < SCAN_BATCH) {
        state.profileCursor = profile._id; state.activeProfile = null; state.matchAnalysisCursor = null;
    } else state.matchAnalysisCursor = analyses.at(-1)._id;
}
async function runAutomaticMatching(options = {}) {
    if (running || mongoose.connection.readyState !== 1) return;
    const coll = collection('matching_pipeline_state');
    if (!coll) return;
    running = true;
    const token = randomUUID();
    let heartbeat;
    try {
        let state;
        try {
            state = await coll.findOneAndUpdate({ _id: 'coordinator', $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: new Date() } }] },
                { $set: { token, leaseUntil: new Date(Date.now() + LEASE_MS) } }, { upsert: true, returnDocument: 'after' });
        } catch (error) { if (error.code === 11000) return; throw error; }
        heartbeat = setInterval(() => { coll.updateOne({ _id: 'coordinator', token }, { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } }).catch(() => {}); }, 30000);
        heartbeat.unref();
        await scanAnalyses(state);
        if (options.scheduleMatching !== false) await scanContractors(state);
        const { governmentCursor, internalCursor, firstSource, profileCursor, activeProfile, matchAnalysisCursor } = state;
        await coll.updateOne({ _id: 'coordinator', token }, { $set: { governmentCursor, internalCursor, firstSource, profileCursor, activeProfile, matchAnalysisCursor, lastScanAt: new Date() } });
    } catch { console.warn('[MATCHING PIPELINE] Background scan unavailable'); }
    finally {
        clearInterval(heartbeat);
        await coll.updateOne({ _id: 'coordinator', token }, { $unset: { token: '', leaseUntil: '' } }).catch(() => {});
        running = false;
    }
}
function startAutomaticMatching() {
    if (interval || process.env.MATCHING_AUTOMATION_ENABLED === 'false') return;
    interval = setInterval(() => void runAutomaticMatching(), INTERVAL_MS);
    interval.unref();
    void runAutomaticMatching();
    console.log('[MATCHING PIPELINE] Automatic scanning enabled (60s interval)');
}
module.exports = { startAutomaticMatching, runAutomaticMatching, ensureAnalysis, hasAnalysisData, sourceFingerprint, analysisReady, ANALYSIS_VERSION };
