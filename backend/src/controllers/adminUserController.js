const mongoose = require("mongoose");
const User = require("../models/User");

function formatUser(user) {
    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
        phone: user.phone,
        company: user.company,
        accountRole: user.accountRole,
        verificationStatus: user.verificationStatus,
        isActive: user.isActive !== false,
        createdAt: user.createdAt,
    };
}

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find()
            .sort({ createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: users.map(formatUser),
        });
    } catch (error) {
        console.error("Get admin users error:", error);
        return res.status(500).json({
            success: false,
            error: "ไม่สามารถโหลดข้อมูลผู้ใช้งานได้",
        });
    }
};

exports.getUserById = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid user ID",
            });
        }

        const user = await User.findById(req.params.id).lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "ไม่พบผู้ใช้งาน",
            });
        }

        return res.json({
            success: true,
            data: formatUser(user),
        });
    } catch (error) {
        console.error("Get admin user error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
};

exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                error: "Invalid user ID",
            });
        }

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                error: "isActive must be a boolean",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "ไม่พบผู้ใช้งาน",
            });
        }

        if (user.email === req.adminEmail) {
            return res.status(403).json({
                success: false,
                error: "ไม่สามารถระงับบัญชีตัวเองได้",
            });
        }

        if (user.accountRole === "admin") {
            return res.status(403).json({
                success: false,
                error: "ไม่สามารถเปลี่ยนสถานะบัญชี Admin ได้",
            });
        }

        user.isActive = isActive;
        await user.save();

        return res.json({
            success: true,
            data: formatUser(user),
        });
    } catch (error) {
        console.error("Update user status error:", error);
        return res.status(500).json({
            success: false,
            error: "ไม่สามารถเปลี่ยนสถานะผู้ใช้งานได้",
        });
    }
};