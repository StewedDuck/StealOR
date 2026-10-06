function emailLayout({
    title,
    subtitle,
    content,
}) {
    return `
    <!DOCTYPE html>
    <html>
        <body style="
        margin:0;
        padding:0;
        background:#F5F5F2;
        font-family: Arial, sans-serif;
        color:#26323D;
        ">
            <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="background:#F5F5F2; padding: 40px 16px;"
            >
                <tr>
                    <td align="center">
                    <table
                        width="600"
                        cellpadding="0"
                        cellspacing="0"
                        style="
                            max-width:600px;
                            width:100%;
                            background:#FCFCFA;
                            border-radius:14px;
                            overflow:hidden;
                            border:1px solid #E1E5E8;
                        "
                    >

                    <!-- Header -->
                    <tr>
                        <td style="
                            background:#1F2933;
                            padding: 24px 32px;
                            "
                        >

                            <div style="
                                color:#FCFCFA;
                                font-size:22px;
                                font-weight:700;
                            ">
                                sTealORs
                            </div>

                            <div style="
                                color:#AFC5DD;
                                font-size: 12px;
                                margin-top:4px;
                            ">
                                ค้นหา TOR · กรุงเทพฯ
                            </div>
                        </td>
                    </tr>

                    <!-- Body -->
                    <tr>
                        <td style="padding: 32px;">
                            <h1 style="
                                margin:0;
                                font-size: 22px;
                                color:#26323D;
                            ">
                                ${title}
                            </h1>

                            ${subtitle ? `
                                <p style="
                                    margin: 8px 0 24px;
                                    color:#718096;
                                    font-size: 14px;
                                    line-height: 1.6;
                                ">
                                    ${subtitle}
                                </p>
                            ` : ''}
                            ${content}
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="
                                padding: 20px 32px;
                                border-top:1px solid #E1E5E8;
                                color:#98A2AC;
                                font-size:11px;
                                text-align:center;
                            "
                        >
                            sTealORs · ระบบค้นหาและจัดการ TOR
                        </td>
                    </tr>
                </tr>
            </table>
            </td>
            </tr>
            </table>
        </body>
    </html>
    `;
}

module.exports = { emailLayout} ;
