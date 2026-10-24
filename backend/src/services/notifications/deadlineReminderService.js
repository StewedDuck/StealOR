const Bookmark = require('../../models/Bookmark');
const GovProject = require('../../models/GovProject');
const Tor = require('../../models/Tor');
const User = require('../../models/User');
const { notify, eventKey } = require('./deliveryService');
const { formatDate } = require('../../email/Shared');
const { appUrl } = require('../../email/Shared');
const DAY = 86400000;
function bangkokDay(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.floor((time + 7 * 3600000) / DAY) : NaN;
}
function getDaysUntil(deadline, now = new Date()) {
    return deadline ? bangkokDay(deadline) - bangkokDay(now) : null;
}
function createReminderService(deps = {}) {
    const bookmarksModel = deps.Bookmark || Bookmark, gov = deps.GovProject || GovProject;
    const torsModel = deps.Tor || Tor, users = deps.User || User, deliver = deps.notify || notify;
    async function checkDeadlineReminders(now = new Date()) {
        for (const bookmark of await bookmarksModel.find({}).lean()) {
            try {
                const tor = bookmark.source === 'government'
                    ? await gov.findOne({ project_id: bookmark.projectId }).lean()
                    : await torsModel.findById(bookmark.torId).lean();
                if (!tor || (bookmark.source === 'internal' && tor.status !== 'published') || /ยกเลิก|สิ้นสุด/.test(tor.contract_status || '')) continue;
                const deadline = bookmark.source === 'government'
                    ? tor.procurementAnalysis?.biddingClosingDate?.dateTime || tor.raw_data?.submission_deadline || tor.raw_data?.deadline
                    : tor.applicationDeadline;
                const days = getDaysUntil(deadline, now);
                if (![5, 1].includes(days) || new Date(deadline) <= now) continue;
                const user = await users.findOne({ email: bookmark.userId.trim().toLowerCase(), accountRole: 'contractor' }).lean();
                if (!user) continue;
                const type = days === 5 ? 'deadline_5_days' : 'deadline_1_day';
                const title = `TOR ที่บันทึกไว้ปิดรับใน ${days} วัน: ${tor.project_name || tor.projectName}`;
                await deliver({ key: eventKey([user.email, bookmark.source, String(tor._id), type, new Date(deadline).toISOString()]),
                    user, source: bookmark.source, projectId: bookmark.source === 'government' ? bookmark.projectId : null,
                    torId: bookmark.source === 'internal' ? bookmark.torId : null, type, title,
                    message: `TOR ที่คุณบันทึกไว้จะปิดรับในอีก ${days} วัน กรุณาตรวจสอบรายละเอียดก่อนยื่นข้อเสนอ`, url: `${appUrl()}/contractor/saved`,
                    details: { projectName: tor.project_name || tor.projectName, agencyName: tor.dept_name || tor.agencyName, label: 'TOR ใกล้ปิดรับ', buttonLabel: 'ดู TOR ที่บันทึกไว้', facts: [{ label: 'ปิดรับ', value: formatDate(deadline) }, { label: 'เหลืออีก', value: `${days} วัน` }] } });
            } catch { console.warn('[NOTIFICATION] Saved TOR reminder deferred'); }
        }
    }
    async function checkOwnerReminders(now = new Date()) {
        for (const tor of await torsModel.find({ status: { $in: ['draft', 'published'] } }).lean()) {
            try {
                const owner = await users.findOne({ email: tor.ownerId, accountRole: 'project_owner', verificationStatus: 'approved' }).lean();
                if (!owner) continue;
                let type, title, deadline;
                if (tor.status === 'draft') {
                    deadline = tor.submissionDeadline;
                    if (!deadline || !Number.isFinite(new Date(deadline).getTime()) || new Date(deadline) > now) continue;
                    type = 'owner_draft_ready'; title = `TOR ฉบับร่างครบกำหนดแล้ว สามารถเผยแพร่ได้: ${tor.projectName}`;
                } else {
                    deadline = tor.applicationDeadline;
                    const days = getDaysUntil(deadline, now);
                    if (![3, 0].includes(days)) continue;
                    type = days === 3 ? 'owner_deadline_3_days' : 'owner_deadline_today';
                    title = `TOR ${days === 3 ? 'จะปิดรับในอีก 3 วัน' : 'ครบกำหนดปิดรับวันนี้'}: ${tor.projectName}`;
                }
                await deliver({ key: eventKey([owner.email, String(tor._id), type, new Date(deadline).toISOString()]), user: owner,
                    source: 'internal', torId: String(tor._id), type, title, message: title,
                    url: `${appUrl()}/project_own/${tor.status === 'draft' ? 'draft_TOR' : 'my_TOR'}`,
                    details: { projectName: tor.projectName, agencyName: tor.agencyName, label: tor.status === 'draft' ? 'TOR พร้อมเผยแพร่' : 'กำหนดปิดรับ TOR', buttonLabel: 'จัดการ TOR ของฉัน', facts: [{ label: 'กำหนดเวลา', value: formatDate(deadline) }] } });
            } catch { console.warn('[NOTIFICATION] Owner TOR reminder deferred'); }
        }
    }
    return { checkDeadlineReminders, checkOwnerReminders };
}
module.exports = { ...createReminderService(), createReminderService, getDaysUntil };
