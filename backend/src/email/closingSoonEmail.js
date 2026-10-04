const { emailLayout } = require("./emailLayout");

function closingSoonEmail({
    userName,
    projectName,
    agencyName,
    deadline,
    daysLeft,
    torUrl,
}) {
    return emailLayout({
        title: "TOR ที่คุณบันทึกไว้ใกล้ปิดรับ",

        subtitle:
            "อย่าลืมตรวจสอบรายละเอียดก่อนหมดเขตรับสมัคร",

        content: `
            <p style="
                font-size:14px;
                line-height:1.7;
            ">
                สวัสดี ${userName || "ผู้ใช้งาน"}
            </p>

            <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                    margin:20px 0;
                    background:#F5F5F2;
                    border-radius:10px;
                "
            >
                <tr>
                    <td style="padding:20px;">

                        <div style="
                            color:#4B7DB8;
                            font-size:12px;
                            font-weight:600;
                            margin-bottom:8px;
                        ">
                            TOR ใกล้ปิดรับ
                        </div>

                        <div style="
                            font-size:17px;
                            font-weight:700;
                            color:#26323D;
                        ">
                            ${projectName}
                        </div>

                        <div style="
                            margin-top:8px;
                            font-size:13px;
                            color:#718096;
                        ">
                            ${agencyName || "ไม่ระบุหน่วยงาน"}
                        </div>

                        <div style="
                            margin-top:18px;
                            font-size:13px;
                        ">
                            ปิดรับ:
                            <strong>${deadline}</strong>
                        </div>

                        <div style="
                            margin-top:6px;
                            color:#9B7841;
                            font-weight:600;
                        ">
                            เหลืออีก ${daysLeft} วัน
                        </div>

                    </td>
                </tr>
            </table>

            <a
                href="${torUrl}"
                style="
                    display:inline-block;
                    padding:12px 20px;
                    background:#4B7DB8;
                    color:#FCFCFA;
                    text-decoration:none;
                    border-radius:8px;
                    font-size:13px;
                    font-weight:600;
                "
            >
                ดู TOR ที่บันทึกไว้
            </a>
        `,
    });
}

module.exports = { closingSoonEmail };