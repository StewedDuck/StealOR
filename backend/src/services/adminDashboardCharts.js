function buildTorMonths(counts, now = new Date()) {
    const current = new Date(now.getTime() + 7 * 3600000);
    return Array.from({ length: 6 }, (_, index) => {
        const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 5 + index, 1));
        const key = date.toISOString().slice(0, 7);
        const count = status => counts.find(row => row._id.month === key && row._id.status === status)?.count || 0;
        return { key, month: new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date),
            published: count('published'), draft: count('draft'), pending: count('pending_verification') };
    });
}
function buildUserDistribution(counts) {
    const names = { contractor: 'ผู้รับจ้าง', project_owner: 'เจ้าของโครงการ', admin: 'ผู้ดูแลระบบ' };
    return Object.entries(names).map(([role, name]) => ({ name, value: counts.find(row => row._id === role)?.count || 0 }));
}
module.exports = { buildTorMonths, buildUserDistribution };
