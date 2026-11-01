const crypto = require("crypto");

function profileAuth(req, res, next) {
    const expected = process.env.TOR_PROXY_SECRET;
    const received = req.get("x-profile-proxy-secret");
    const email = req.get("x-profile-email")
        ?.trim()
        .toLowerCase();

    if (!expected || !received || !email) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
        return res.status(401).json({
            success: false,
            error: "Unauthorized",
        });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(401).json({
            success: false,
            error: "Invalid profile identity",
        });
    }

    req.profileEmail = email;
    next();
}

module.exports = profileAuth;