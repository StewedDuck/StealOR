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
router.get('/', adminAuth, getSummary);
module.exports = router;
module.exports.getSummary = getSummary;
