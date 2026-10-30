const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Compile application TS/TSX with the existing TypeScript dependency.
// This loader is scoped to these test modules and leaves Node's global loader intact.
const root = path.resolve(__dirname, '..');
const cache = new Map();
function load(relative) {
    const base = path.resolve(root, relative);
    const filename = [base, `${base}.ts`, `${base}.tsx`].find(file => fs.existsSync(file));
    if (!filename) throw Error(`Missing module: ${relative}`);
    if (filename.endsWith('.css')) return {};
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
    }).outputText;
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    const originalRequire = mod.require.bind(mod);
    mod.require = specifier => {
        if (specifier.endsWith('.css')) return {};
        if (specifier.startsWith('@/')) return load(specifier.slice(2));
        if (specifier.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), specifier)));
        return originalRequire(specifier);
    };
    cache.set(filename, mod);
    mod._compile(compiled, filename);
    return mod.exports;
}

const { torBookmarkKey, savedTorToMarketTor } = load('lib/torIdentity');
const { getGovernmentPublicationStatus, getTorProgressStatus } = load('lib/torPublicationStatus');
const { TorMatchingCard, MatchingModal } = load('components/TorMatchingCard');
const tor = { id: 'mongo-id', source: 'government', projectId: '69109005145', projectName: 'Software project', agencyName: 'Agency', budget: 1000, deadline: null, status: 'Active', createdAt: '', updatedAt: '' };
const matching = { torId: 'mongo-id', torSource: 'government', matchingPercentage: 50, eligibility: 'unknown', mandatorySummary: { total: 0, passed: 0, failed: 0, unknown: 0 }, mandatoryResults: [], relevanceResults: [
    { criterionId: 'pass', text: 'React', status: 'pass', matchedGroups: [['react']], missingGroups: [], skillGroups: [['react']], profileFields: ['skills'], matchDetails: [{ groupIndex: 0, skillGroup: ['react'], evidence: 'React', matchType: 'exact', reason: 'พบทักษะ React ตรงกับข้อกำหนด' }], semanticMatchingStatus: 'not_needed' },
    { criterionId: 'unknown', text: 'Data integration', status: 'unknown', matchedGroups: [], missingGroups: [['api integration']], skillGroups: [['api integration']], profileFields: ['skills'], matchDetails: [], semanticMatchingStatus: 'completed' },
] };
const callbacks = { onViewDetails() {}, onMatchingDetails() {}, onBookmark() {}, onDocuments() {} };

test('Draft matching cards show the MongoDB comment deadline rather than the bidding deadline', () => {
    const { getTorDisplayDeadline } = load('lib/torDeadline');
    const draft = { ...tor, publicationStatus: 'draft', deadline: '2099-12-25T00:00:00Z',
        biddingDeadline: '2099-12-25T00:00:00Z', commentDeadlineAt: '2099-11-18T00:00:00Z' };
    assert.equal(getTorDisplayDeadline(draft), draft.commentDeadlineAt);
    assert.equal(getTorDisplayDeadline(draft, 'open'), draft.biddingDeadline);
    assert.equal(getTorDisplayDeadline({ ...draft, commentDeadlineAt: null }), null);
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor: draft, matching, saved: false, progressStatus: 'draft' }));
    assert.match(markup, /18/);
    assert.match(markup, /พ.ย./);
    assert.doesNotMatch(markup, /25 ธ.ค./);
    assert.equal(getTorProgressStatus({ ...draft, commentDeadlineAt: '2000-01-01' }, 'draft'), 'draft');
});

test('closed comment periods remain Draft and use a separate orange badge and filter', () => {
    const { isTorCommentClosed, matchesTorStatusFilter } = load('lib/torPublicationStatus');
    const draft = { ...tor, publicationStatus: 'draft', commentDeadlineAt: '2000-01-01T00:00:00Z',
        deadline: '2000-01-01T00:00:00Z', biddingDeadline: '2099-01-01T00:00:00Z' };
    assert.equal(getTorProgressStatus(draft), 'draft');
    assert.equal(isTorCommentClosed(draft), true);
    assert.equal(matchesTorStatusFilter(draft, 'draft'), true);
    assert.equal(matchesTorStatusFilter(draft, 'comments_closed'), true);
    assert.equal(matchesTorStatusFilter(draft, 'closed'), false);
    assert.equal(matchesTorStatusFilter(draft, 'open'), false);
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, {
        ...callbacks, tor: draft, matching, saved: true, progressStatus: getTorProgressStatus(draft),
    }));
    assert.match(markup, />Draft</);
    assert.match(markup, /class="tor-status-badge tor-comment-closed">ปิดรับความคิดเห็น/);
    assert.doesNotMatch(markup, /tm-publication-closed/);

    const published = { ...draft, publicationStatus: 'open' };
    assert.equal(getTorProgressStatus(published), 'open', 'Invitation starts the independent bidding period');
    assert.equal(isTorCommentClosed(published), false);
    assert.equal(matchesTorStatusFilter(published, 'comments_closed'), false);
    assert.equal(matchesTorStatusFilter(published, 'published'), true);
    const closedBid = { ...published, biddingDeadline: '2000-01-01T00:00:00Z' };
    assert.equal(getTorProgressStatus(closedBid), 'closed');
    assert.equal(matchesTorStatusFilter(closedBid, 'closed'), true);
    assert.equal(matchesTorStatusFilter(closedBid, 'comments_closed'), false);
    for (const commentDeadlineAt of [null, 'invalid', '2099-01-01T00:00:00Z']) {
        assert.equal(isTorCommentClosed({ ...draft, commentDeadlineAt }), false);
    }
    assert.equal(getTorProgressStatus({ ...draft, publicationStatus: 'unknown' }), 'unknown',
        'An expired date without an invitation cannot establish closed bidding');
    const exactCutoff = { ...draft, commentDeadlineAt: '2026-10-28T17:00:00Z' };
    assert.equal(isTorCommentClosed(exactCutoff, 'draft', new Date('2026-10-28T16:59:59Z')), false);
    assert.equal(isTorCommentClosed(exactCutoff, 'draft', new Date('2026-10-28T17:00:00Z')), true);
});

test('saved cold-start previews wait for freshness validation and full modal details', () => {
    const { getMatchingProgress, getMatchingActivity } = load('lib/matchingStatus');
    const preview = { ...matching, isCachedSnapshot: true, matchingStatus: 'stale', computedAt: '2026-10-01T00:00:00Z' };
    assert.deepEqual(getMatchingProgress([preview]), { completed: 0, total: 1 });
    assert.equal(getMatchingActivity([preview]).queued, 0, 'Reading a saved result is not an AI queue');
    const markup = renderToStaticMarkup(React.createElement(MatchingModal, { item: { tor, matching: preview }, onClose() {} }));
    assert.match(markup, /กำลังโหลดรายละเอียดผลที่บันทึกไว้/);
    assert.doesNotMatch(markup, /aria-valuenow/);
});

test('matching progress counts completed evaluations at every score and excludes stale or unfinished work', () => {
    const { getMatchingProgress } = load('lib/matchingStatus');
    const rows = [
        { ...matching, matchingStatus: 'ready', matchingPercentage: 0 },
        { ...matching, matchingStatus: 'ready', matchingPercentage: 20 },
        { ...matching, matchingStatus: 'ready', matchingPercentage: 80 },
        { ...matching, matchingStatus: 'stale', matchingPercentage: 90 },
        { ...matching, matchingStatus: 'pending', matchingPercentage: null },
        { ...matching, matchingStatus: 'unavailable', matchingPercentage: null },
        { ...matching, analysisPipelineStatus: 'waiting_data', matchingStatus: 'pending', matchingPercentage: null },
    ];
    assert.deepEqual(getMatchingProgress(rows), { completed: 3, total: 7 });
    assert.deepEqual(getMatchingProgress([]), { completed: 0, total: 0 });
});

test('waiting data and failed TORs do not imply ongoing matching work', () => {
    const { getMatchingActivity } = load('lib/matchingStatus');
    const completed = Array.from({ length: 38 }, () => ({ ...matching, matchingStatus: 'ready', refreshState: 'ready' }));
    const waiting = Array.from({ length: 39 }, () => ({ ...matching, matchingStatus: 'pending', analysisPipelineStatus: 'waiting_data', refreshState: 'idle' }));
    const failed = Array.from({ length: 24 }, () => ({ ...matching, matchingStatus: 'unavailable', refreshState: 'failed' }));
    const queued = Array.from({ length: 6 }, () => ({ ...matching, matchingStatus: 'pending', refreshState: 'queued' }));
    assert.deepEqual(getMatchingActivity([...completed, ...waiting, ...failed, ...queued]), {
        processing: 0, queued: 6, retrying: 0, failed: 24, waitingForData: 39, withoutCriteria: 0,
    });
    const terminal = getMatchingActivity([...completed, ...waiting, ...failed]);
    assert.equal(terminal.processing + terminal.queued, 0, 'No spinner for blocked or finished work');
    assert.equal(getMatchingActivity([{ ...matching, matchingStatus: 'stale', refreshState: 'retry_wait' }]).retrying, 1);
    assert.equal(getMatchingActivity([{ ...matching, matchingStatus: 'pending', analysisPipelineStatus: 'processing' }]).processing, 1);
});

test('older snapshots cannot roll 40 completed TORs back to 10 for identical inputs', () => {
    const { mergeMatchingSnapshot } = load('lib/matchingSnapshot');
    const { getMatchingProgress } = load('lib/matchingStatus');
    const previous = { data: Array.from({ length: 40 }, (_, i) => ({ ...matching, torId: String(i),
        matchingStatus: 'ready', analysisPipelineStatus: 'ready', inputFingerprint: `input-${i}`,
        computedAt: '2026-10-28T10:01:00Z' })) };
    const incoming = { data: previous.data.map((row, i) => i < 10 ? row : ({ ...row,
        matchingStatus: 'pending', computedAt: null })) };
    assert.equal(getMatchingProgress(mergeMatchingSnapshot(previous, incoming).data).completed, 40);
    const changed = { data: incoming.data.map(row => ({ ...row, inputFingerprint: 'changed-profile' })) };
    assert.equal(getMatchingProgress(mergeMatchingSnapshot(previous, changed).data).completed, 10,
        'Real input changes must invalidate old results');
    assert.equal(mergeMatchingSnapshot(previous, { data: [] }).data.length, 0, 'Removed TORs stay removed');
    const newer = { ...incoming.data[20], computedAt: '2026-10-28T10:02:00Z', matchingStatus: 'unavailable' };
    assert.equal(mergeMatchingSnapshot(previous, { data: [newer] }).data[0], newer, 'Newer computation wins');
});

test('navigation reuses matching evidence with MongoDB and public IDs while isolating accounts', () => {
    const { readMatchingSnapshot, writeMatchingSnapshot, matchingByTor } = load('lib/matchingSnapshot');
    const data = { ...matching, projectId: tor.projectId };
    writeMatchingSnapshot('first@example.com', { data: [data], pending: 2 });
    assert.equal(readMatchingSnapshot('second@example.com'), undefined);
    assert.equal(readMatchingSnapshot(null), undefined);
    const rows = matchingByTor(readMatchingSnapshot('first@example.com').data);
    assert.equal(rows[torBookmarkKey(tor)], data);
    assert.equal(rows['government:mongo-id'], data);
    writeMatchingSnapshot('second@example.com', { data: [] });
    assert.equal(readMatchingSnapshot('first@example.com'), undefined);
});

test('closed saved TORs retain the matching card and identify historical evidence', () => {
    const { savedMatchingSnapshot, shouldShowMatchingCard } = load('lib/matchingStatus');
    const saved = { ...tor, match: { percent: 83.33, matchedRequirements: ['React'], unmatchedRequirements: ['Docker'] } };
    const result = savedMatchingSnapshot(saved);
    assert.equal(shouldShowMatchingCard(result), true);
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor, matching: result, saved: true, progressStatus: 'closed' }));
    assert.match(markup, /83.33%/);
    assert.match(markup, /ผล Matching ณ วันที่บันทึก/);
    assert.match(markup, /React/);
    assert.match(markup, /Docker/);
    assert.match(markup, /รายละเอียดการแมตช์/);
    assert.equal(savedMatchingSnapshot({ ...saved, match: null }), undefined);
});

test('refresh restores only recent matching results for the same signed-in account', t => {
    const previousWindow = global.window;
    let saved;
    global.window = { sessionStorage: {
        setItem(key, value) { saved = value; },
        getItem() { return saved; },
    } };
    t.after(() => { if (previousWindow === undefined) delete global.window; else global.window = previousWindow; });
    const modulePath = path.resolve(root, 'lib/matchingSnapshot.ts');
    load('lib/matchingSnapshot').writeMatchingSnapshot('returning@example.com', { data: [matching] });
    cache.delete(modulePath);
    const refreshed = load('lib/matchingSnapshot');
    assert.equal(refreshed.readMatchingSnapshot('different@example.com'), undefined);
    assert.equal(refreshed.readMatchingSnapshot('returning@example.com').data[0].matchingPercentage, 50);
    const expired = JSON.parse(saved);
    expired.savedAt = Date.now() - 2 * 60 * 60 * 1000;
    saved = JSON.stringify(expired);
    cache.delete(modulePath);
    assert.equal(load('lib/matchingSnapshot').readMatchingSnapshot('returning@example.com'), undefined);
});

test('saved government bookmarks and matching TORs use the same key after reload', () => {
    assert.equal(torBookmarkKey(tor), torBookmarkKey({ source: 'government', projectId: tor.projectId, bookmarkId: 'bookmark' }));
    assert.equal(torBookmarkKey(tor), 'government:69109005145');
    assert.equal(torBookmarkKey({ source: 'internal', id: 'internal-id' }), torBookmarkKey({ source: 'internal', torId: 'internal-id' }));
    assert.equal(torBookmarkKey({ source: 'government', id: 'mongo-id' }), '');
});

test('matching, market and saved cards resolve Draft from the same invitation metadata', () => {
    const publication = getGovernmentPublicationStatus({ documents: { invitation: { available: false, files: [] } } });
    assert.equal(publication, 'draft');
    const saved = { ...tor, bookmarkId: 'bookmark', savedFrom: 'market', savedAt: '', match: null };
    assert.equal(getTorProgressStatus(tor, publication), 'draft');
    assert.equal(getTorProgressStatus(savedTorToMarketTor(saved), publication), 'draft');
    assert.equal(getTorProgressStatus(tor), 'unknown', 'No deadline must not imply Open');
    assert.equal(getTorProgressStatus({ ...tor, source: 'internal', status: 'เปิดรับสมัคร' }), 'open');
    assert.equal(getTorProgressStatus({ ...tor, deadline: '2000-01-01' }, 'open'), 'closed');
});

test('shared matching card renders Draft, score, saved icon and matching details on all consumers', () => {
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor, matching, saved: true, progressStatus: 'draft' }));
    assert.match(markup, />Draft</);
    assert.doesNotMatch(markup, /เปิดรับสมัคร/);
    assert.match(markup, /50%/);
    assert.match(markup, /บันทึกแล้ว/);
    assert.match(markup, /fill="currentColor"/);
    assert.match(markup, /รายละเอียดการแมตช์/);
    assert.match(markup, /ยังยืนยันไม่ได้ 1 ข้อ/);
    const unsaved = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor, matching, saved: false, progressStatus: 'unknown' }));
    assert.doesNotMatch(unsaved, /บันทึกแล้ว/);
    assert.match(unsaved, />Unknown</);
});

test('shared matching modal preserves Thai exact reasons and shows unresolved evidence', () => {
    const markup = renderToStaticMarkup(React.createElement(MatchingModal, { item: { tor, matching }, onClose() {} }));
    assert.match(markup, /พบทักษะ React ตรงกับข้อกำหนด/);
    assert.match(markup, /api integration/);
    assert.match(markup, /ทักษะที่ยังไม่พบหลักฐาน/);
});

test('failed AI is labelled as retrying or failed instead of updating indefinitely', () => {
    const { getMatchingRefreshLabel } = load('lib/matchingStatus');
    assert.equal(getMatchingRefreshLabel({ ...matching, refreshState: 'retry_wait' }), 'AI ไม่พร้อม — รอลองใหม่');
    assert.equal(getMatchingRefreshLabel({ ...matching, refreshState: 'failed' }), 'ประเมินไม่สำเร็จ — กรุณาลองใหม่');
    assert.equal(getMatchingRefreshLabel({ ...matching, refreshState: 'running' }), 'กำลังประเมินผลใหม่');
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, {
        ...callbacks, tor, matching: { ...matching, matchingStatus: 'stale', refreshState: 'retry_wait' }, saved: true, progressStatus: 'open',
    }));
    assert.match(markup, /AI ไม่พร้อม — รอลองใหม่/);
    assert.doesNotMatch(markup, /กำลังอัปเดต/);
});

test('relevance bars show partial group coverage while retaining evidence and reasons', () => {
    const partial = {
        ...matching.relevanceResults[0], status: 'unknown', text: 'Web application stack',
        skillGroups: [['php'], ['laravel', 'laravel framework'], ['bootstrap', 'tailwind css'], ['javascript framework', 'javascript library']],
        matchedGroups: [['php'], ['javascript framework', 'javascript library']],
        missingGroups: [['laravel', 'laravel framework'], ['bootstrap', 'tailwind css']],
        matchDetails: [{ groupIndex: 3, skillGroup: ['javascript framework', 'javascript library'], evidence: 'React', matchType: 'semantic', reason: 'React เป็น JavaScript Library จึงตรงกับข้อกำหนด' }],
    };
    const markup = renderToStaticMarkup(React.createElement(MatchingModal, {
        item: { tor, matching: { ...matching, relevanceResults: [partial, matching.relevanceResults[0]] } }, onClose() {},
    }));
    const relevance = markup.slice(markup.indexOf('<h3>คุณสมบัติที่ใช้คิด Match %</h3>'));
    assert.match(relevance, /aria-valuenow="50"/);
    assert.match(relevance, /ยืนยันได้ 2 จาก 4 กลุ่ม/);
    assert.match(relevance, /aria-valuenow="100"/);
    assert.match(relevance, /React เป็น JavaScript Library จึงตรงกับข้อกำหนด/);
    assert.match(relevance, /laravel หรือ laravel framework/);
    assert.match(relevance, /bootstrap หรือ tailwind css/);
    assert.match(relevance, /คะแนนที่ได้เข้าคะแนนรวม 25%/);
    assert.doesNotMatch(relevance, /tm-result-badge|tm-stat-grid/);
    assert.doesNotMatch(relevance, />ผ่าน<|>ไม่ผ่าน<|>ไม่ทราบ</);
    assert.match(markup, /คะแนนความตรงกัน: 50%/);
});

test('an unassessable criterion avoids a misleading zero-percent bar and keeps the AI warning', () => {
    const unassessable = { ...matching.relevanceResults[1], skillGroups: [], matchedGroups: [], missingGroups: [], semanticMatchingStatus: 'unavailable' };
    const markup = renderToStaticMarkup(React.createElement(MatchingModal, {
        item: { tor, matching: { ...matching, relevanceResults: [unassessable] } }, onClose() {},
    }));
    const relevance = markup.slice(markup.indexOf('<h3>คุณสมบัติที่ใช้คิด Match %</h3>'));
    assert.match(relevance, /class="tm-result-badge tm-unknown">ข้อมูลไม่เพียงพอ/);
    assert.doesNotMatch(relevance, /ยังประเมินไม่ได้/);
    assert.match(relevance, /การวิเคราะห์เพิ่มเติมด้วย AI ยังไม่พร้อม/);
    assert.doesNotMatch(relevance, /role="progressbar"|NaN|Infinity/);
});

test('partial credit is consistent between the card, criterion bar and earned contribution', () => {
    const partial = { ...matching.relevanceResults[0], status: 'unknown',
        skillGroups: [['php'], ['laravel'], ['tailwind'], ['library']],
        matchedGroups: [['php'], ['tailwind'], ['library']], missingGroups: [['laravel']],
        appliedWeight: 5.56, earnedWeight: 4.17, coveragePercentage: 75,
    };
    const data = { ...matching, matchingPercentage: 4.17, relevanceResults: [partial] };
    const card = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor, matching: data, saved: false, progressStatus: 'open' }));
    const modal = renderToStaticMarkup(React.createElement(MatchingModal, { item: { tor, matching: data }, onClose() {} }));
    assert.match(card, /4\.17%/);
    assert.match(card, /พบทักษะตรงกัน \(1\)/);
    assert.match(modal, /aria-valuenow="75"/);
    assert.match(modal, /คะแนนที่ได้เข้าคะแนนรวม 4\.17%/);
});

test('a TOR waiting for content displays an explicit waiting message and never a zero score', () => {
    const data = { ...matching, matchingPercentage: null, relevanceResults: [], analysisPipelineStatus: 'waiting_data', matchingStatus: 'pending' };
    const markup = renderToStaticMarkup(React.createElement(TorMatchingCard, { ...callbacks, tor, matching: data, saved: false, progressStatus: 'unknown' }));
    assert.match(markup, /รอข้อมูล TOR/);
    assert.match(markup, /N\/A/);
    assert.doesNotMatch(markup, />0%<|พบทักษะตรงกัน \(0\)/);
});

test('only scores above 39 with TOR data use matching cards across all pages', () => {
    const { shouldShowMatchingCard } = load('lib/matchingStatus');
    for (const value of [undefined, null, { ...matching, matchingPercentage: null },
        ...[0, 5.13, 39, NaN, Infinity].map(score => ({ ...matching, matchingPercentage: score })),
        { ...matching, matchingPercentage: 80, analysisPipelineStatus: 'waiting_data' }]) {
        assert.equal(shouldShowMatchingCard(value), false);
    }
    for (const score of [39.01, 40, 100]) {
        assert.equal(shouldShowMatchingCard({ ...matching, matchingPercentage: score }), true);
    }
});

test('mandatory modal shows Thai insufficient-data labels and per-condition profile evidence', () => {
    const item = { tor, matching: { ...matching, mandatorySummary: { total: 1, passed: 0, failed: 0, unknown: 1 }, mandatoryResults: [{ requirementId: 'legal', text: 'คุณสมบัติตามกฎหมาย', status: 'unknown', reason: 'ข้อมูลยังไม่ครบ', conditionDetails: [
        { field: 'legalEligibility.bankruptcyStatus', label: 'สถานะล้มละลาย', status: 'pass', actual: 'ไม่มีสถานะนี้', expected: 'ไม่มีสถานะนี้', reason: 'ข้อมูลตรงกับเงื่อนไข' },
        { field: 'legalEligibility.legalCapacity', label: 'มีความสามารถตามกฎหมาย', status: 'unknown', actual: 'ยังไม่ได้ระบุ', expected: 'ใช่', reason: 'ยังไม่ได้ระบุข้อมูลในโปรไฟล์' },
    ] }] } };
    const markup = renderToStaticMarkup(React.createElement(MatchingModal, { item, onClose() {} }));
    assert.match(markup, /ข้อมูลไม่เพียงพอ/);
    assert.doesNotMatch(markup, /ไม่ทราบ/);
    assert.match(markup, /สถานะล้มละลาย/);
    assert.match(markup, /ข้อมูลในโปรไฟล์/);
    assert.match(markup, /ยังไม่ได้ระบุ/);
});

test('failed API message stays readable and keeps diagnostic metadata separate', async t => {
    const { getContractorNotifications } = load('lib/torApi');
    t.mock.method(global, 'fetch', async () => new Response(JSON.stringify({ success: false, error: 'Cannot connect to backend' }), { status: 502, headers: { 'content-type': 'application/json' } }));
    t.mock.method(console, 'error', () => { assert.fail('Handled API failures must not produce duplicate console errors'); });
    await assert.rejects(getContractorNotifications('private@example.com'), error => {
        assert.equal(error.status, 502);
        assert.equal(error.endpoint, '/api/notifications');
        assert.doesNotMatch(error.message, /HTTP|\/api\//);
        assert.match(error.message, /เชื่อมต่อระบบ/);
        assert.doesNotMatch(error.message, /private@example.com/);
        return true;
    });
});


test('UTC comment deadlines display the Thai calendar date across midnight without double shifting', () => {
    const draft = { ...tor, publicationStatus: 'draft', commentDeadlineAt: '2099-11-17T17:00:00.000Z' };
    const render = value => renderToStaticMarkup(React.createElement(TorMatchingCard, {
        ...callbacks, tor: { ...draft, commentDeadlineAt: value }, matching, saved: false, progressStatus: 'draft',
    }));
    assert.match(render(draft.commentDeadlineAt), /ปิดรับ 18 พ.ย. 2642/);
    assert.match(render('2099-11-18T00:00:00+07:00'), /ปิดรับ 18 พ.ย. 2642/);
    assert.match(render('2099-11-17T16:59:59Z'), /ปิดรับ 17 พ.ย. 2642/);
});

test('inline evaluation status hides diagnostics and missing TOR data, showing only work and retry', () => {
    const Status = load('components/MatchingEvaluationStatus').default;
    const idle = { processing: 0, queued: 0, retrying: 0, failed: 0, waitingForData: 0, withoutCriteria: 0 };
    const render = (activity, extra = {}) => renderToStaticMarkup(React.createElement(Status, {
        progress: { completed: 42, total: 82 }, activity, checking: false, sending: false, onRetry() {}, ...extra,
    }));
    const pending = render({ ...idle, retrying: 6, failed: 5, waitingForData: 29 });
    assert.match(pending, /กำลังค้นหา TOR ที่ตรงกับคุณเพิ่มเติม/);
    assert.match(pending, /บางรายการยังประเมินไม่ได้/);
    assert.match(pending, /<button[^>]*>.*ลองใหม่<\/button>/);
    assert.doesNotMatch(pending, /<details|ดูสถานะการประเมิน|ประเมินแล้ว|รอข้อมูล TOR|82/);
    const complete = render(idle, { progress: { completed: 82, total: 82 } });
    assert.doesNotMatch(complete, /role="status"|<button|บางรายการยังประเมินไม่ได้|tm-message/);
    assert.equal(complete, '');
    assert.equal(render({ ...idle, waitingForData: 29, withoutCriteria: 2 }), '');
    assert.match(render({ ...idle, failed: 5 }, { sending: true }), /<button[^>]*disabled=""/);
});

test('dashboard restores the same account snapshot, isolates accounts, and expires old data', t => {
    const { readDashboardSnapshot, writeDashboardSnapshot } = load('lib/dashboardSnapshot');
    let now = 100;
    t.mock.method(Date, 'now', () => now);
    const data = { summary: { matchedCount: 13 }, trend: [], qualificationGaps: [{ qualification: 'AWS', missed: 2 }] };
    writeDashboardSnapshot('dashboard-a', data);
    assert.equal(readDashboardSnapshot('dashboard-a').summary.matchedCount, 13);
    assert.equal(readDashboardSnapshot('dashboard-a').qualificationGaps.length, 1);
    assert.equal(readDashboardSnapshot('dashboard-a').isCachedSnapshot, true);
    assert.equal(readDashboardSnapshot('dashboard-b'), undefined);
    now += 60 * 60 * 1000 + 1;
    assert.equal(readDashboardSnapshot('dashboard-a'), undefined);
});

test('navigation list cache coalesces concurrent page/sidebar reads and keeps account snapshots isolated', async t => {
    const { fetchList, readListSnapshot, invalidateList } = load('lib/listCache');
    let now = 1000; t.mock.method(Date, 'now', () => now);
    let calls = 0, finish;
    const task = new Promise(resolve => { finish = resolve; });
    const loader = () => { calls++; return task; };
    const first = fetchList('notifications:test-a', loader);
    const second = fetchList('notifications:test-a', loader);
    finish([{ _id: 'one', read: false }]);
    assert.deepEqual(await first, await second);
    assert.equal(calls, 1);
    assert.equal(readListSnapshot('notifications:test-b'), undefined);
    now += 6000;
    await assert.rejects(fetchList('notifications:test-a', async () => { throw Error('offline'); }));
    assert.equal(readListSnapshot('notifications:test-a').length, 1);
    invalidateList('notifications:');
    assert.equal(readListSnapshot('notifications:test-a'), undefined);
});

test('list mutation invalidates old in-flight responses without losing the updated snapshot', async () => {
    const { fetchList, readListSnapshot, invalidateList, updateLists } = load('lib/listCache');
    await fetchList('notifications:mutation', async () => [{ _id: 'one', read: false }]);
    updateLists('notifications:mutation', rows => rows.map(row => ({ ...row, read: true })));
    let finish;
    const pending = fetchList('notifications:mutation', () => new Promise(resolve => { finish = resolve; }));
    await Promise.resolve();
    updateLists('notifications:mutation', rows => rows.map(row => ({ ...row, read: true })));
    finish([{ _id: 'one', read: false }]); await pending;
    assert.equal(readListSnapshot('notifications:mutation')[0].read, true);
    invalidateList('notifications:');
});
