const mongoose = require('mongoose');
const User = require('../../models/User');
const Verification = require('../../models/IdentityVerification');
const { notify } = require('./deliveryService');
const { verificationRequest } = require('../../email/Admin');
const { accountApproved, accountRejected } = require('../../email/ProjectOwner');
const { appUrl } = require('../../email/Shared');
async function initializeNotifications() {
    await mongoose.connection.db.collection('notification_system_state').updateOne({ _id: 'activation' }, { $setOnInsert: { enabledAt: new Date() } }, { upsert: true });
}
async function reconcileVerificationNotifications() {
    const state = await mongoose.connection.db.collection('notification_system_state').findOne({ _id: 'activation' });
    if (!state) return;
    const records = await Verification.find({ updatedAt: { $gte: state.enabledAt } }).lean();
    const admins = await User.find({ accountRole: 'admin' }).lean();
    for (const record of records) {
        try {
            const owner = await User.findById(record.userId).lean();
            if (!owner) continue;
            // A newly submitted request belongs to every admin, even if already reviewed by the next scan.
            if (record.createdAt >= state.enabledAt) for (const admin of admins) {
                const title = 'มีคำขอยืนยันตัวตนใหม่';
                await notify({ key: `verification:${record._id}:requested:${admin.email.toLowerCase()}`, user: admin,
                    source: 'verification', verificationId: record._id, type: 'identity_verification_requested', title,
                    message: `${owner.name} ส่งคำขอยืนยันตัวตน รอการตรวจสอบ`,
                    email: verificationRequest({ ownerName: owner.name, ownerEmail: owner.email, submittedAt: record.createdAt, reviewUrl: `${appUrl()}/admin/verification` }) });
            }
            if (['approved', 'rejected'].includes(record.status) && record.reviewedAt >= state.enabledAt) {
                const approved = record.status === 'approved';
                const title = approved ? 'การยืนยันตัวตนได้รับการอนุมัติ' : 'การยืนยันตัวตนไม่ผ่าน';
                await notify({ key: `verification:${record._id}:${record.status}:${owner.email.toLowerCase()}`, user: owner,
                    source: 'verification', verificationId: record._id, type: `identity_verification_${record.status}`, title,
                    message: approved ? 'ยืนยันตัวตนสำเร็จ' : `เหตุผล: ${record.rejectionReason}`,
                    email: approved ? accountApproved({ name: owner.name }) : accountRejected({ name: owner.name, reason: record.rejectionReason }) });
            }
        } catch { console.warn('[NOTIFICATION] Verification reconciliation deferred'); }
    }
}
module.exports = { initializeNotifications, reconcileVerificationNotifications };
