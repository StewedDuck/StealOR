// Two real read-only API requests. Prints timing and counts only, never profile data.
require('dotenv').config({ quiet: true });
(async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const started = Date.now();
        const response = await fetch('http://localhost:5000/api/matching?refresh=false', {
            headers: { 'x-profile-email': process.argv[2], 'x-profile-proxy-secret': process.env.TOR_PROXY_SECRET },
            signal: AbortSignal.timeout(55000),
        });
        const payload = await response.json();
        console.log(JSON.stringify({ attempt, httpStatus: response.status, elapsedMs: Date.now() - started,
            success: payload.success, total: payload.total,
            visibleMatches: payload.data?.filter(row => row.analysisPipelineStatus !== 'waiting_data' && typeof row.matchingPercentage === 'number' && row.matchingPercentage > 39).length }));
        if (!response.ok) process.exitCode = 1;
    }
})().catch(error => { console.error(JSON.stringify({ probeFailed: error.name })); process.exitCode = 1; });
