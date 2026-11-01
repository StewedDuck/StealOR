// Uses the real authenticated API and records only aggregate counts, never profile fields.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
(async () => {
    const started = Date.now();
    const headers = { 'x-profile-email': process.argv[2], 'x-profile-proxy-secret': process.env.TOR_PROXY_SECRET };
    const response = await fetch('http://localhost:5000/api/matching/dashboard', { headers, signal: AbortSignal.timeout(55000) });
    const payload = await response.json();
    assert.equal(response.status, 200); assert.equal(payload.success, true);
    assert.equal(payload.data.trend.length, 6);
    assert.ok(payload.data.qualificationGaps.length <= 7);
    assert.ok(payload.data.closingTors.every(row => row.matchingPercentage > 39 && row.daysLeft >= 0 && row.daysLeft <= 5));
    console.log(JSON.stringify({ httpStatus: response.status, elapsedMs: Date.now() - started, summary: payload.data.summary,
        monthsWithHistory: payload.data.trend.filter(row => row.rate !== null).length,
        gaps: payload.data.qualificationGaps.length, softwareCategories: payload.data.softwareTypes.length,
        historyAvailable: payload.data.historyAvailable, pending: payload.data.pending }));
})().catch(error => { console.error(JSON.stringify({ failed: error.name })); process.exitCode = 1; });
