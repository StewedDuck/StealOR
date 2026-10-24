const { emailLayout } = require('./emailLayout');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function notificationEmail({ title, message, url, name, projectName, agencyName, label = 'TOR NOTIFICATION', subtitle = 'ติดตามข่าวสารและการเปลี่ยนแปลงของ TOR ที่คุณสนใจ', buttonLabel = 'ดูรายละเอียด', facts = [] }) {
    return {
        subject: title,
        text: [`สวัสดีคุณ ${name || 'ผู้ใช้งาน'}`, title, message, projectName, agencyName,
            ...facts.map(item => `${item.label}: ${item.value}`), url].filter(Boolean).join('\n\n'),
        html: emailLayout({ title: escapeHtml(title), subtitle: escapeHtml(subtitle), content: `
            <p style="margin:0 0 20px;font-size:14px;line-height:1.7;">สวัสดีคุณ <strong>${escapeHtml(name || 'ผู้ใช้งาน')}</strong></p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 24px;background:#F5F5F2;border-radius:10px;">
                <tr><td style="padding:20px;">
                    <div style="color:#4B7DB8;font-size:12px;font-weight:600;margin-bottom:10px;">${escapeHtml(label)}</div>
                    ${projectName ? `<div style="font-size:17px;font-weight:700;line-height:1.5;color:#26323D;">${escapeHtml(projectName)}</div>` : ''}
                    ${agencyName ? `<p style="margin:8px 0;color:#718096;font-size:13px;">${escapeHtml(agencyName)}</p>` : ''}
                    <p style="margin:12px 0 0;color:#52606D;font-size:14px;line-height:1.7;">${escapeHtml(message)}</p>
                    ${facts.map(item => `<p style="margin:10px 0 0;font-size:13px;line-height:1.6;"><span style="color:#718096;">${escapeHtml(item.label)}:</span> <strong>${escapeHtml(item.value)}</strong></p>`).join('')}
                </td></tr>
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#4B7DB8" style="border-radius:8px;">
                <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 20px;color:#FCFCFA;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
            </td></tr></table>` }),
    };
}
module.exports = { notificationEmail, escapeHtml };
