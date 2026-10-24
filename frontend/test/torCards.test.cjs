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
    assert.match(relevance, /ยังประเมินไม่ได้/);
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
        ...[0, 39, NaN, Infinity].map(score => ({ ...matching, matchingPercentage: score })),
        { ...matching, matchingPercentage: 80, analysisPipelineStatus: 'waiting_data' }]) {
        assert.equal(shouldShowMatchingCard(value), false);
    }
    for (const score of [39.01, 40, 100]) {
        assert.equal(shouldShowMatchingCard({ ...matching, matchingPercentage: score }), true);
    }
});
