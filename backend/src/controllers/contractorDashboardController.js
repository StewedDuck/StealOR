const { getMatchedTors } = require('./matchingController');
const { addMarketDocumentSummaries } = require('../services/marketDocumentSummary');
const { summarizeDashboard, loadTrend, buildTrend } = require('../services/contractorDashboardService');
async function getContractorDashboard(req, res) {
    try {
        let status = 200, payload;
        // Reuse matching authorization and the exact stored scores; dashboard reads never invoke AI.
        await getMatchedTors({ profileEmail: req.profileEmail, includeSnapshotDetails: true, query: { refresh: 'false', ...(req.query?.snapshot === 'true' ? { snapshot: 'true' } : {}) } }, {
            status(code) { status = code; return this; }, json(value) { payload = value; return this; },
        });
        if (status !== 200 || !payload?.success) return res.status(status).json(payload);
        const rows = payload.data || [];
        const tors = await addMarketDocumentSummaries(rows.map(row => row.tor));
        const now = new Date();
        const data = summarizeDashboard(rows.map((row, index) => ({ ...row, tor: tors[index] })), now);
        let historyAvailable = true;
        try { data.trend = await loadTrend(req.profileEmail, data.summary, now, { record: !payload.isCachedSnapshot }); }
        catch { historyAvailable = false; data.trend = buildTrend([], now); }
        return res.json({ success: true, data: { ...data, historyAvailable, isCachedSnapshot: !!payload.isCachedSnapshot, pending: payload.pending,
            failed: payload.failed, waitingForData: payload.waitingForData } });
    } catch {
        return res.status(500).json({ success: false, error: 'โหลดข้อมูลแดชบอร์ดไม่สำเร็จ กรุณาลองอีกครั้ง' });
    }
}
module.exports = { getContractorDashboard };
