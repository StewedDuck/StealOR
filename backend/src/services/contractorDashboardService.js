const { hash } = require('./matchingCache');
const Snapshot = require('../models/DashboardSnapshot');
const bangkokDate = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 10) : null;
};
const round = value => Math.round(value * 100) / 100;
function isOpen(tor, now) {
    if (tor.deadline && new Date(tor.deadline) <= now) return false;
    return tor.source === 'internal' ? ['published', 'open', 'เปิดรับสมัคร'].includes(tor.status) : tor.publicationStatus === 'open';
}
function softwareTypes(row) {
    const tor = row.tor;
    const text = `${tor.projectName || ''} ${tor.description || ''} ${(row.relevanceResults || []).flatMap(item => item.skillGroups || []).flat().join(' ')}`;
    return [
        ['Web App', /web\s*(app|application|site)|เว็บไซต์|เว็บแอป|react|next\.js|ระบบบริหารจัดการเอกสารออนไลน์/i],
        ['ERP', /\berp\b|enterprise resource planning|ระบบวางแผนทรัพยากร/i],
        ['Mobile', /mobile|flutter|android|ios\b|แอปพลิเคชันมือถือ/i],
        ['Cloud', /cloud|\baws\b|azure|คลาวด์/i],
        ['Data/AI', /\bai\b|\bllm\b|data\s*(analysis|analytics|processing|engineering)|chatbot|dashboard|machine learning|ปัญญาประดิษฐ์|วิเคราะห์ข้อมูล/i],
        ['Cyber', /cyber|security|pentest|ความมั่นคงปลอดภัย|ความปลอดภัย/i],
        ['Network', /network|เครือข่าย/i],
    ].filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}
function summarizeDashboard(rows, now = new Date()) {
    const today = bangkokDate(now);
    const assessed = rows.filter(row => row.analysisPipelineStatus !== 'waiting_data' && Number.isFinite(row.matchingPercentage) && typeof row.matchingPercentage === 'number');
    const matched = assessed.filter(row => row.matchingPercentage > 39);
    const closing = matched.filter(row => {
        if (!isOpen(row.tor, now) || !row.tor.deadline) return false;
        const day = bangkokDate(row.tor.deadline);
        const daysLeft = day ? Math.round((new Date(day) - new Date(today)) / 86400000) : NaN;
        return daysLeft >= 0 && daysLeft <= 5;
    }).sort((a, b) => new Date(a.tor.deadline) - new Date(b.tor.deadline));
    const gaps = new Map();
    for (const row of assessed) {
        const missing = new Map();
        for (const criterion of row.relevanceResults || []) {
            if (criterion.semanticMatchingStatus === 'unavailable') continue;
            for (const group of criterion.missingGroups || []) {
                const label = [...new Set(group)].join(' / ');
                if (label) missing.set(group.map(value => value.trim().toLowerCase()).sort().join('|'), label);
            }
        }
        for (const criterion of row.mandatoryResults || []) {
            if (criterion.status !== 'pass' && !criterion.conditionDetails?.length && criterion.text && !/AI.*(?:ไม่พร้อม|ไม่สามารถ|ยังไม่)/i.test(criterion.reason || '')) {
                const certificates = criterion.text.match(/ISO\s*\d{4,5}(?:-\d+)?/gi);
                const label = certificates ? [...new Set(certificates)].join(' / ') : criterion.text;
                missing.set(label.toLowerCase(), label);
            }
            for (const detail of criterion.conditionDetails || []) {
                if (detail.status !== 'pass' && detail.field) missing.set(detail.label.toLowerCase(), detail.label);
            }
        }
        for (const [key, label] of missing) {
            const existing = gaps.get(key) || { qualification: label, missed: 0 };
            existing.missed++; gaps.set(key, existing);
        }
    }
    const software = new Map();
    for (const row of rows.filter(row => isOpen(row.tor, now))) {
        const categories = softwareTypes(row);
        for (const name of categories.length ? categories : ['อื่น ๆ']) software.set(name, (software.get(name) || 0) + 1);
    }
    return {
        summary: {
            matchedCount: matched.length,
            newTodayCount: rows.filter(row => row.tor.createdAt && bangkokDate(row.tor.createdAt) === today).length,
            closingCount: closing.length,
            matchedBudget: matched.reduce((sum, row) => sum + (typeof row.tor.budget === 'number' && Number.isFinite(row.tor.budget) && row.tor.budget >= 0 ? row.tor.budget : 0), 0),
            missingBudgetCount: matched.filter(row => row.tor.budget == null).length,
            assessedCount: assessed.length,
            totalCount: rows.length,
            matchRate: assessed.length ? round(matched.length / assessed.length * 100) : null,
        },
        qualificationGaps: [...gaps.values()].sort((a, b) => b.missed - a.missed || a.qualification.localeCompare(b.qualification)).slice(0, 7),
        softwareTypes: [...software].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
        closingTors: closing.slice(0, 5).map(row => ({ tor: row.tor, matchingPercentage: row.matchingPercentage,
            daysLeft: Math.round((new Date(bangkokDate(row.tor.deadline)) - new Date(today)) / 86400000) })),
        generatedAt: now.toISOString(),
    };
}
function buildTrend(snapshots, now = new Date()) {
    const current = bangkokDate(now).slice(0, 7);
    const [year, month] = current.split('-').map(Number);
    return Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1 - 5 + index, 1));
        const key = date.toISOString().slice(0, 7);
        const points = snapshots.filter(row => row.day.startsWith(key) && typeof row.rate === 'number');
        return { month: new Intl.DateTimeFormat('th-TH', { month: 'short', timeZone: 'UTC' }).format(date), key,
            rate: points.length ? round(points.reduce((sum, row) => sum + row.rate, 0) / points.length) : null,
            samples: points.length };
    });
}
async function loadTrend(email, summary, now = new Date()) {
    const userKey = hash(email.trim().toLowerCase());
    const day = bangkokDate(now);
    if (summary.matchRate !== null) await Snapshot.updateOne({ _id: `${userKey}:${day}` }, {
        $set: { userKey, day, rate: summary.matchRate, matchedCount: summary.matchedCount, assessedCount: summary.assessedCount },
    }, { upsert: true });
    const first = buildTrend([], now)[0].key + '-01';
    const history = await Snapshot.find({ userKey, day: { $gte: first, $lte: day } }).select('day rate').lean();
    return buildTrend(history, now);
}
module.exports = { summarizeDashboard, buildTrend, loadTrend, bangkokDate };
