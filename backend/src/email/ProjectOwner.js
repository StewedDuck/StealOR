const { appUrl } = require("./Shared");
const { emailLayout } = require("./emailLayout");

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[char]));

const accountApproved = (p) => ({
    subject: "บัญชี Project Owner ของคุณได้รับการอนุมัติแล้ว",

    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        "การยืนยันตัวตนของคุณได้รับการอนุมัติแล้ว",
        "คุณสามารถเข้าใช้งานบัญชี Project Owner ได้แล้ว",
        "",
        `เข้าสู่ระบบ: ${appUrl()}`,
    ].join("\n"),

    html: emailLayout({
        title: "การยืนยันตัวตนได้รับการอนุมัติ",
        subtitle: "บัญชี Project Owner ของคุณได้รับการยืนยันเรียบร้อยแล้ว",

        content: `
            <p style="font-size:14px;line-height:1.7;">
                สวัสดีคุณ <strong>${escapeHtml(p.name)}</strong>
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"
                style="margin:20px 0;background:#F5F5F2;border-radius:10px;">
                <tr>
                    <td style="padding:20px;">
                        <div style="color:#4B7DB8;font-size:12px;font-weight:600;">
                            VERIFICATION APPROVED
                        </div>

                        <div style="margin-top:10px;font-size:17px;font-weight:700;color:#26323D;">
                            ยืนยันตัวตนสำเร็จ
                        </div>

                        <p style="font-size:13px;color:#718096;line-height:1.7;">
                            บัญชี Project Owner ของคุณได้รับการอนุมัติแล้ว
                            คุณสามารถเข้าใช้งานระบบได้ตามสิทธิ์ของบัญชี
                        </p>
                    </td>
                </tr>
            </table>

            <a href="${escapeHtml(appUrl())}"
                style="display:inline-block;padding:12px 20px;background:#4B7DB8;
                color:#FCFCFA;text-decoration:none;border-radius:8px;
                font-size:13px;font-weight:600;">
                เข้าสู่ระบบ sTealORs
            </a>
        `,
    }),
});

const accountRejected = (p) => ({
    subject: "ผลการตรวจสอบบัญชี Project Owner ของคุณ",

    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        "การยืนยันตัวตนของคุณไม่ผ่านการตรวจสอบ",
        "",
        `เหตุผล: ${p.reason}`,
        "",
        `เข้าสู่ระบบ: ${appUrl()}`,
    ].join("\n"),

    html: emailLayout({
        title: "การยืนยันตัวตนไม่ผ่าน",
        subtitle: "กรุณาตรวจสอบเหตุผลและข้อมูลการยืนยันตัวตนของคุณ",

        content: `
            <p style="font-size:14px;line-height:1.7;">
                สวัสดีคุณ <strong>${escapeHtml(p.name)}</strong>
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"
                style="margin:20px 0;background:#F5F5F2;border-radius:10px;">
                <tr>
                    <td style="padding:20px;">
                        <div style="color:#9B7841;font-size:12px;font-weight:600;">
                            VERIFICATION REJECTED
                        </div>

                        <div style="margin-top:10px;font-size:17px;font-weight:700;color:#26323D;">
                            ไม่สามารถอนุมัติบัญชีได้
                        </div>

                        <p style="font-size:13px;color:#718096;">
                            เหตุผล:
                        </p>

                        <p style="font-size:14px;color:#26323D;line-height:1.7;">
                            ${escapeHtml(p.reason)}
                        </p>
                    </td>
                </tr>
            </table>

            <a href="${escapeHtml(appUrl())}"
                style="display:inline-block;padding:12px 20px;background:#4B7DB8;
                color:#FCFCFA;text-decoration:none;border-radius:8px;
                font-size:13px;font-weight:600;">
                เข้าสู่ระบบ sTealORs
            </a>
        `,
    }),
});

module.exports = { accountApproved, accountRejected };