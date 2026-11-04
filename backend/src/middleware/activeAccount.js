const User = require("../models/User");

async function activeAccount(email, res, next) {
    try {
        const user = await User.findOne({ email }).select("isActive").lean();
        if (user?.isActive === false) {
            return res.status(403).json({
                success: false,
                code: "ACCOUNT_SUSPENDED",
                error: "บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ",
            });
        }
        return next();
    } catch (error) {
        console.error("Account status check failed:", error.message);
        return res.status(503).json({ success: false, error: "ไม่สามารถตรวจสอบสถานะบัญชีได้" });
    }
}

module.exports = activeAccount;

// Legacy endpoints identify accounts by email or MongoDB user ID.
module.exports.fromRequest = async (req, res, next) => {
    const identity = req.body?.userId || req.params.userId || req.query.userId;
    if (!identity || typeof identity !== "string") return next();
    try {
        const mongoose = require("mongoose");
        const query = mongoose.isValidObjectId(identity)
            ? { _id: identity }
            : { email: identity.trim().toLowerCase() };
        const user = await User.findOne(query).select("isActive").lean();
        if (user?.isActive === false) {
            return res.status(403).json({ success: false, code: "ACCOUNT_SUSPENDED", error: "บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ" });
        }
        return next();
    } catch (error) {
        return res.status(503).json({ success: false, error: "ไม่สามารถตรวจสอบสถานะบัญชีได้" });
    }
};
