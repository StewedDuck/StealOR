const crypto = require("crypto");

function torOwnerAuth(req, res, next) {
    const expected = process.env.TOR_PROXY_SECRET;
    const received = req.get("x-tor-proxy-secret");

    if (!expected || !received) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    const a = Buffer.from(received);
    const b = Buffer.from(expected);

    if (
        a.length !== b.length ||
        !crypto.timingSafeEqual(a, b)
    ) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    const email = req.get("x-owner-email")
        ?.trim()
        .toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(401).json({
            success: false,
            error: "Invalid owner identity",
        });
    }

    req.ownerId = email;
    next();
}

module.exports = torOwnerAuth;