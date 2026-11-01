const { formatDate } = require("./Shared");
const { emailLayout } = require("./emailLayout");

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));

const verificationRequest = (p) => ({
    subject: `มีคำขอยืนยันบัญชีเจ้าของโครงการ: ${p.ownerName}`,

    text: [
        "มีคำขอยืนยันตัวตนใหม่รอการตรวจสอบ",
        "",
        `ชื่อ: ${p.ownerName}`,
        `อีเมล: ${p.ownerEmail}`,
        `ส่งคำขอเมื่อ: ${formatDate(p.submittedAt)}`,
        "",
        `ตรวจสอบคำขอ: ${p.reviewUrl}`,
    ].join("\n"),

    html: emailLayout({
        title: "มีคำขอยืนยันตัวตนใหม่",
        subtitle: "มี Project Owner ส่งคำขอใหม่ รอการตรวจสอบจากผู้ดูแลระบบ",

        content: `
            <p style="font-size:14px;line-height:1.7;">
                สวัสดีผู้ดูแลระบบ
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"
                style="margin:20px 0;background:#F5F5F2;border-radius:10px;">
                <tr>
                    <td style="padding:20px;">
                        <div style="color:#4B7DB8;font-size:12px;font-weight:600;">
                            VERIFICATION REQUEST
                        </div>

                        <div style="margin-top:10px;font-size:17px;font-weight:700;color:#26323D;">
                            ${escapeHtml(p.ownerName)}
                        </div>

                        <p style="font-size:13px;color:#718096;">
                            ${escapeHtml(p.ownerEmail)}
                        </p>

                        <p style="font-size:13px;color:#26323D;">
                            ส่งคำขอเมื่อ:
                            <strong>${escapeHtml(formatDate(p.submittedAt))}</strong>
                        </p>

                        <div style="color:#9B7841;font-size:13px;font-weight:600;">
                            สถานะ: รอการตรวจสอบ
                        </div>
                    </td>
                </tr>
            </table>

            <a href="${escapeHtml(p.reviewUrl)}"
                style="display:inline-block;padding:12px 20px;background:#4B7DB8;
                color:#FCFCFA;text-decoration:none;border-radius:8px;
                font-size:13px;font-weight:600;">
                ตรวจสอบคำขอ
            </a>
        `,
    }),
});

module.exports = { verificationRequest };