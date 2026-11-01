const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Tor = require('../models/Tor');
const IdentityVerification = require('../models/IdentityVerification');

async function getSummary(req, res) {
    try {
        const [users, tors, pendingVerifications, pendingTorReviews] = await Promise.all([
            User.countDocuments({}), Tor.countDocuments({}),
            IdentityVerification.countDocuments({ status: 'pending' }),
            Tor.countDocuments({ reviewStatus: 'pending' }),
        ]);
        return res.json({ success: true, data: { users, tors, pendingVerifications, pendingTorReviews } });
    } catch {
        return res.status(500).json({ success: false, error: 'ไม่สามารถโหลดข้อมูลสรุปแดชบอร์ดได้' });
    }
}
router.get('/charts', adminAuth, async (req, res) => {
    try {
        const now = new Date();
        const { buildTorMonths, buildUserDistribution } = require('../services/adminDashboardCharts');
        const firstMonth = buildTorMonths([], now)[0].key;
        const [tors, users] = await Promise.all([
            Tor.aggregate([
                { $match: { createdAt: { $gte: new Date(`${firstMonth}-01T00:00:00+07:00`), $lte: now } } },
                { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Bangkok' } }, status: '$status' }, count: { $sum: 1 } } },
            ]),
            User.aggregate([{ $group: { _id: '$accountRole', count: { $sum: 1 } } }]),
        ]);
        return res.json({ success: true, data: { torMonths: buildTorMonths(tors, now), userDistribution: buildUserDistribution(users) } });
    } catch {
        return res.status(500).json({ success: false, error: 'ไม่สามารถโหลดข้อมูลกราฟได้' });
    }
});
router.get('/', adminAuth, getSummary);
module.exports = router;
module.exports.getSummary = getSummary;
