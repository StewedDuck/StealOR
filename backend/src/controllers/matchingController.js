const { readMatchingData, invalidateMatchingData, readWithinBudget } = require('../services/matchingReadCache');
const { matchingAccountFilter } = require('../services/matchingAccess');
const mongoose = require("mongoose");
const { loadVisibleCatalog, marketTor } = require('../services/torMatchingCatalog');
const { hasAnalysisData, analysisReady, sourceFingerprint } = require('../services/automaticMatchingService');
const { getAvailableMatching, loadStoredMatching, startRefresh } = require("../services/precomputedMatchingService");

const User = require("../models/User");
const Tor = require("../models/Tor");
const GovProject = require("../models/GovProject");
const TorAnalysis = require("../models/TorAnalysis");

const {
    calculateMatching,
} = require("../services/torMatchingService");

async function getTorMatching(req, res) {
    try {
        const { torSource, torId } = req.params;

        // Validate TOR source.
        if (!["internal", "government"].includes(torSource)) {
            return res.status(400).json({
                success: false,
                error: "Invalid TOR source",
            });
        }

        if (!mongoose.isValidObjectId(torId)) {
            return res.status(400).json({
                success: false,
                error: "Invalid TOR ID",
            });
        }

        // Identify the logged-in user through profileAuth.
        const contractor = await User.findOne({
            email: req.profileEmail,
            ...matchingAccountFilter(),
        });

        if (!contractor) {
            return res.status(403).json({
                success: false,
                error: "บัญชีนี้ไม่มีสิทธิ์ใช้โหมดผู้รับจ้าง หรือยังไม่พบโปรไฟล์ กรุณาตรวจสอบบัญชีที่เข้าสู่ระบบ",
            });
        }

        // Retrieve the original TOR.
        let tor;

        if (torSource === "government") {
            tor = await GovProject.findById(torId);
        } else {
            tor = await Tor.findOne({
                _id: torId,
                status: "published",
            });
        }

        if (!tor) {
            return res.status(404).json({
                success: false,
                error: "TOR not found or not available",
            });
        }

        // Retrieve the analyzed requirements.
        const torAnalysis = await TorAnalysis.findOne({
            torSource,
            torId,
            status: "completed",
        });

        if (!torAnalysis) {
            return res.status(404).json({
                success: false,
                error: "Completed TOR analysis not found",
            });
        }

        // Do not guess the bid submission date or financial year.
        // These must be verified from the original TOR.
        const options = {
            bidSubmissionDate: null,
            requiredFinancialYear: null,
        };

        const [cached] = await getAvailableMatching(contractor.toObject(), [torAnalysis.toObject()], { refresh: false });
        const calculated = cached?.matchingStatus === 'ready' ? cached.result : await calculateMatching(
            contractor,
            torAnalysis,
            options
        );

        const result = require('../services/torMatchingService').refreshMatchingExplanations(calculated, contractor, torAnalysis);
        return res.json({
            success: true,
            data: {
                torId,
                torSource,
                contractorId: contractor._id,
        
                // Mandatory eligibility
                eligibility: result.eligibility,
                mandatorySummary: result.mandatorySummary,
                mandatoryResults: result.mandatoryResults,
        
                // Project relevance score range
                matchingPercentage: result.matchingPercentage,
                matchingPercentageUpperBound:
                    result.matchingPercentageUpperBound,
        
                scoringStatus: result.scoringStatus,
                weightingMethod: result.weightingMethod,
                meetsDisplayThreshold: result.meetsDisplayThreshold,
        
                // Matching details
                relevanceResults: result.relevanceResults,
                scoredResults: result.scoredResults,
            },
        });
    } catch (error) {
        console.error("[MATCHING] Detail calculation unavailable");

        return res.status(500).json({
            success: false,
            error: "Unable to calculate TOR matching",
        });
    }
}

async function getMatchedTors(req, res) {
    const startedAt = Date.now();
    const timings = {};
    try {
        const contractor = await User.findOne({
            email: req.profileEmail,
            ...matchingAccountFilter(),
        });

        if (!contractor) {
            return res.status(403).json({
                success: false,
                error: "บัญชีนี้ไม่มีสิทธิ์ใช้โหมดผู้รับจ้าง หรือยังไม่พบโปรไฟล์ กรุณาตรวจสอบบัญชีที่เข้าสู่ระบบ",
            });
        }
        timings.profileMs = Date.now() - startedAt;

        if (req.query?.snapshot === 'true') {
            return res.json(await require('../services/matchingSnapshotService').loadMatchingSnapshot(contractor.toObject()._id));
        }

        const reads = Promise.all([
            readMatchingData('catalog', loadVisibleCatalog, { ttlMs: 15000 }),
            readMatchingData('analyses', () => TorAnalysis.find({}, 'torId torSource status relevanceStatus requirements projectRelevance pipelineState sourceFingerprint attemptedFingerprint error nextAttemptAt').lean(), { ttlMs: 15000 }),
            loadStoredMatching(contractor.toObject()._id, { force: req.query?.retry === 'true' }),
        ]);
        // Normal list reads must not wait past the proxy timeout on a cold cache.
        // Explicit retry requests retain their write/queue semantics below.
        const loaded = req.query?.retry === 'true' ? { value: await reads } : await readWithinBudget(reads);
        if (!loaded) {
            return res.json(await require('../services/matchingSnapshotService').loadMatchingSnapshot(contractor.toObject()._id));
        }
        const [catalog, analyses, storedRows] = loaded.value;
        const analysisMap = new Map(analyses.map(analysis => [`${analysis.torSource}:${analysis.torId}`, analysis]));
        timings.catalogMs = Date.now() - startedAt - timings.profileMs;
        const phases = catalog.map(({ tor, source }) => {
            const analysis = analysisMap.get(`${source}:${tor._id}`);
            if (!hasAnalysisData(tor, source)) return 'waiting_data';
            const fingerprint = analysis?.sourceFingerprint ? sourceFingerprint(tor, source) : null;
            if (fingerprint && analysis.sourceFingerprint !== fingerprint) {
                return analysis.attemptedFingerprint === fingerprint && ['processing', 'retry_wait', 'failed'].includes(analysis.pipelineState) ? analysis.pipelineState : 'pending';
            }
            // A failed/redundant refresh does not invalidate a completed
            // analysis when the source inputs are still exactly the same.
            if (fingerprint && analysis.sourceFingerprint === fingerprint && analysisReady(analysis)) return 'ready';
            return analysis?.pipelineState || (analysisReady(analysis) ? 'ready' : analysis?.status === 'failed' ? 'failed' : 'pending');
        });
        if (req.query?.retry === 'true' && catalog.length) {
            invalidateMatchingData('analyses');
            await TorAnalysis.updateMany({
                $or: catalog.map(({ tor, source }) => ({ torId: tor._id, torSource: source })), pipelineState: 'failed',
            }, { $set: { pipelineState: 'pending', attemptCount: 0, nextAttemptAt: null } });
        }
        const readyKeys = new Set(catalog.filter((_, index) => phases[index] === 'ready').map(({ tor, source }) => `${source}:${tor._id}`));
        const visibleKeys = new Set(catalog.map(({ tor, source }) => `${source}:${tor._id}`));
        const readyAnalyses = analyses.filter(analysis => readyKeys.has(`${analysis.torSource}:${analysis.torId}`) && analysisReady(analysis));
        const otherAnalyses = analyses.filter(analysis => visibleKeys.has(`${analysis.torSource}:${analysis.torId}`) && !readyKeys.has(`${analysis.torSource}:${analysis.torId}`) && analysisReady(analysis));
        const [readyResults, olderResults] = await Promise.all([
            getAvailableMatching(contractor.toObject(), readyAnalyses, { storedRows, refresh: req.query?.refresh !== 'false', force: req.query?.retry === 'true' }),
            getAvailableMatching(contractor.toObject(), otherAnalyses, { storedRows, refresh: false }),
        ]);
        const available = new Map([...readyAnalyses.map((analysis, i) => [`${analysis.torSource}:${analysis.torId}`, readyResults[i]]),
            ...otherAnalyses.map((analysis, i) => [`${analysis.torSource}:${analysis.torId}`, olderResults[i]])]);
        const matchedTors = [];
        let pending = 0, failed = 0, retrying = 0, waitingForData = 0, withoutCriteria = 0;
        for (const [index, { tor, source }] of catalog.entries()) {
            const torId = String(tor._id);
            const analysis = analysisMap.get(`${source}:${torId}`);
            const entry = available.get(`${source}:${torId}`);
            const phase = phases[index];
            if (phase === 'waiting_data') waitingForData++;
            else if (phase === 'not_available') withoutCriteria++;
            else if (phase === 'failed' || entry?.matchingStatus === 'unavailable') failed++;
            else if (phase !== 'ready' || !entry?.result || entry.matchingStatus !== 'ready') pending++;
            if (phase === 'retry_wait' || entry?.refreshState === 'retry_wait') retrying++;
            const result = entry?.result || {
                eligibility: 'unknown', mandatorySummary: { total: 0, passed: 0, failed: 0, unknown: 0 },
                mandatoryResults: [], scoredResults: [], relevanceResults: [], matchingPercentage: null,
                matchingPercentageUpperBound: null, scoringStatus: 'not_available', weightingMethod: null, meetsDisplayThreshold: false,
            };
            const normalizedTor = marketTor(tor, source);
            matchedTors.push({
                ...result, tor: normalizedTor, torId, torSource: source, projectId: normalizedTor.projectId,
                projectName: normalizedTor.projectName, agencyName: normalizedTor.agencyName, budget: normalizedTor.budget,
                analysisStatus: analysis?.status || 'pending', relevanceStatus: analysis?.relevanceStatus || 'not_available',
                isProvisional: analysis?.relevanceStatus === 'needs_review', analysisPipelineStatus: phase,
                matchingStatus: phase === 'ready' ? entry?.matchingStatus || 'pending' : phase === 'failed' ? 'unavailable' : result.matchingPercentage == null ? 'pending' : 'stale',
                refreshState: phase === 'ready' ? entry?.refreshState || 'idle' : phase === 'processing' ? 'running' : phase === 'retry_wait' ? 'retry_wait' : phase === 'failed' ? 'failed' : 'idle',
                failureCode: (phase === 'ready' ? entry?.failureCode : analysis?.error || entry?.failureCode) || null,
                retryAt: (phase === 'ready' ? entry?.retryAt : analysis?.nextAttemptAt || entry?.retryAt) || null, computedAt: entry?.computedAt || null,
                inputFingerprint: entry?.inputFingerprint || null,
            });
        }

        if (req.query?.refresh !== 'false') startRefresh();
        const page = selectMatchingPage(matchedTors, req.query);
        if (Date.now() - startedAt > 2000) console.log('[MATCHING] Slow stored-result read', {
            ...timings, resultsMs: Date.now() - startedAt - timings.profileMs - timings.catalogMs,
            totalMs: Date.now() - startedAt,
        });
        return res.json({ success: true, pending, failed, retrying, waitingForData, withoutCriteria, ...page });
    } catch (error) {
        console.error("[MATCHING] List retrieval unavailable");

        return res.status(500).json({
            success: false,
            error: "Unable to retrieve matched TORs",
        });
    }
}

// Filter and sort the entire available dataset before slicing pages.
function selectMatchingPage(rows, query = {}) {
    const search = String(query.search || '').trim().toLocaleLowerCase();
    const filtered = rows.filter(row =>
        (!search || `${row.projectName || ''} ${row.agencyName || ''}`.toLocaleLowerCase().includes(search)) &&
        (!query.source || query.source === 'all' || row.torSource === query.source) &&
        (!query.eligibility || query.eligibility === 'all' || row.eligibility === query.eligibility)
    );
    filtered.sort((a, b) => {
        if (a.matchingPercentage == null && b.matchingPercentage != null) return 1;
        if (b.matchingPercentage == null && a.matchingPercentage != null) return -1;
        return ((a.matchingPercentage ?? 0) - (b.matchingPercentage ?? 0)) * (query.sort === 'asc' ? 1 : -1) ||
            `${a.torSource}:${a.torId}`.localeCompare(`${b.torSource}:${b.torId}`);
    });
    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    // Preserve the legacy full-list contract when pagination is not requested.
    const limit = query.limit == null ? null : Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
    return { total: filtered.length, page, limit, data: limit ? filtered.slice((page - 1) * limit, page * limit) : filtered };
}

module.exports = {
    selectMatchingPage,
    getTorMatching,
    getMatchedTors,
};
