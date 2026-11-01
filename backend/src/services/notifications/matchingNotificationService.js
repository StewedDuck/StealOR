const { MATCHING_ROLES } = require('../matchingAccess');
const Tor = require('../../models/Tor');
const GovProject = require('../../models/GovProject');
const { notify, eventKey } = require('./deliveryService');
const { appUrl } = require('../../email/Shared');
function createMatchingNotificationService(deps = {}) {
const torModel = deps.Tor || Tor, govModel = deps.GovProject || GovProject, deliver = deps.notify || notify;
return async function notifyNewMatching(contractor, analysis, result) {
    if (!contractor.email || !(result.matchingPercentage > 39)) return;
    const internal = analysis.torSource === 'internal';
    const tor = internal ? await torModel.findById(analysis.torId).lean() : await govModel.findById(analysis.torId).lean();
    if (!tor || (internal && (tor.status !== 'published' || !(tor.applicationDeadline > new Date()))) || /ยกเลิก|สิ้นสุด/.test(tor.contract_status || '')) return;
    const title = `พบ TOR ที่ตรงกับคุณ: ${internal ? tor.projectName : tor.project_name}`;
    await deliver({ key: eventKey([contractor.email, analysis.torSource, String(analysis.torId), 'new_matching']),
        user: contractor, source: analysis.torSource, torId: internal ? String(analysis.torId) : null,
        projectId: internal ? null : tor.project_id, type: 'new_matching', title,
        message: `มีคะแนน Match ${result.matchingPercentage}% ดูเงื่อนไขบังคับและรายละเอียดก่อนยื่นข้อเสนอ`, url: `${appUrl()}/contractor/matching`,
        details: { projectName: internal ? tor.projectName : tor.project_name, agencyName: internal ? tor.agencyName : tor.dept_name, label: 'NEW TOR MATCH', buttonLabel: 'ดู TOR ที่ตรงกับคุณ', facts: [{ label: 'Match', value: `${result.matchingPercentage}%` }] } });
};
}
const notifyNewMatching = createMatchingNotificationService();
async function reconcileMatchingNotifications() {
    const { collection } = require('../matchingCache');
    const User = require('../../models/User');
    const coll = collection('precomputed_matching');
    if (!coll) return;
    const rows = await coll.find({ notificationPending: true }).limit(100).toArray();
    for (const row of rows) {
        try {
            const user = await User.findById(row.contractorId).lean();
            if (user && user.isActive !== false && MATCHING_ROLES.includes(user.accountRole)) await notifyNewMatching(user, { torId: row.torId, torSource: row.torSource }, row.result);
            await coll.updateOne({ _id: row._id, fingerprint: row.fingerprint }, { $set: { notificationPending: false } });
        } catch { console.warn('[NOTIFICATION] Matching event reconciliation deferred'); }
    }
}
module.exports = { notifyNewMatching, reconcileMatchingNotifications, createMatchingNotificationService };
