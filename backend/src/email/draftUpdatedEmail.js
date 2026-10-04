const { emailLayout } = require("./emailLayout");

function draftUpdatedEmail({
    userName,
    projectName,
    torUrl,
}) {
    return emailLayout({
        title: "TOR ร่างที่คุณบันทึกไว้มีการอัปเดต",

        subtitle:
            "มีการเปลี่ยนแปลงข้อมูลใน TOR ที่คุณกำลังติดตาม",

        content: `
            <p style="
                margin:0 0 20px;
                font-size:14px;
                line-height:1.7;
                color:#26323D;
            ">
                สวัสดีคุณ <strong>${userName || "ผู้ใช้งาน"}</strong>
            </p>

            <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                    margin:20px 0 24px;
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
                            TOR UPDATED
                        </div>

                        <div style="
                            color:#26323D;
                            font-size:17px;
                            font-weight:700;
                            line-height:1.5;
                        ">
                            ${projectName}
                        </div>

                        <div style="
                            margin-top:10px;
                            color:#718096;
                            font-size:13px;
                            line-height:1.6;
                        ">
                            TOR ที่คุณบันทึกไว้ยังอยู่ในสถานะร่าง
                            และเจ้าของโครงการได้อัปเดตข้อมูล
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
                ดูรายละเอียด TOR
            </a>
        `,
    });
}

module.exports = { draftUpdatedEmail };