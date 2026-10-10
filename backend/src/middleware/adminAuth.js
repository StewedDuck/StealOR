const crypto = require("crypto");

function adminAuth(req, res, next) {
    const expected = process.env.TOR_PROXY_SECRET;
    const received = req.get("x-internal-secret");
    const email = req.get("x-admin-email")?.trim().toLowerCase();

    if (!expected || !received || !email) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    const a = Buffer.from(expected);
    const b = Buffer.from(received);

    if (
        a.length !== b.length ||
        !crypto.timingSafeEqual(a, b)
    ) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    req.adminEmail = email;
    next();
}

module.exports = adminAuth;