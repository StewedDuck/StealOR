const User = require("../models/User");
const ADMIN_GMAILS = [
    "admin@gmail.com",
    "stealors.admin@gmail.com",
    "cooldogng@gmail.com",
];

async function syncUser(req, res) {
    try {
        const { name, email, image } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: "Name and email are required",
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        let user = await User.findOne({
            email: normalizedEmail,
        });
        if (!user) {
            user = await User.create({
                name: name.trim(),
                email: normalizedEmail,
                image: image || null,
                accountRole: ADMIN_GMAILS.includes(normalizedEmail)
                    ? "admin"
                    : "contractor",
            });
        } else {
            user.name = name.trim();

            if (image !== undefined) {
                user.image = image || null;
            }

            if (ADMIN_GMAILS.includes(normalizedEmail)) {
                user.accountRole = "admin";
            }

            await user.save();
        }
        return res.json({
            success:true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image,
                accountRole: user.accountRole,
                verificationStatus: user.verificationStatus,
            },
        });
    }catch (error) {
        console.error("Sync user error:", error);

        return res.status(500).json({
            success: false,
            error: "ไม่สามารถบันทึกข้อมูลผู้ใช้ได้",
        });
    }
}

module.exports = { syncUser };
