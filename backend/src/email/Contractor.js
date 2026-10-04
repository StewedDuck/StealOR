const { formatDate, contractorFooter } = require("./Shared");
const { closingSoonEmail, } = require("./closingSoonEmail");
const { draftUpdatedEmail, } = require("./draftUpdatedEmail");

// p ={ torTitle, scopre, matchPercent, closeDate, torUrl }
const torSummaryLines = (p) => [
    `ชื่อ TOR: ${p.torTitle}`,
    `ขอบเขตงาน: ${p.scope}`,
    `ตรงกับคุณ: ${p.matchPercent}%`,
    `ปิดรับ: ${formatDate(p.closeDate)}`,
    "",
    `ดูรายละเอียด: ${p.torUrl}`,
];

// p = {name, torTitle, scope, matchPercent, closeDate, torUrl}
const newMatch = (p) => ({
    subject: `พบ TOR ใหม่ที่ตรงกับคุณ ${p.matchPercent}% - ${p.torTitle}`,
    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        "มี TOR ใหม่ที่ตรงกับคุณสมบัติของคุณ",
        "",
        ...torSummaryLines(p),
        ...contractorFooter(),
    ].join("\n"),
});

// p = { name, torTitle, scope, matchPercent, closeDate, torUrl, daysLeft }
const deadlineReminder = (p) => ({
    subject: `TOR ที่คุณบันทึกไว้จะปิดรับในอีก ${p.daysLeft} วัน - ${p.torTitle}`,

    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        `TOR ที่คุณบันทึกไว้จะปิดรับในอีก ${p.daysLeft} วัน`,
        "",
        ...torSummaryLines(p),
        ...contractorFooter(),
    ].join("\n"),

    html: closingSoonEmail({
        userName: p.name,
        projectName: p.torTitle,
        agencyName: p.agencyName,
        deadline: formatDate(p.closeDate),
        daysLeft: p.daysLeft,
        torUrl: p.torUrl,
    }),
});

// p = { name, torTitle, scope, torUrl }
const draftPublished = (p) => ({
    subject: `TOR ที่คุณบันทึกไว้เผยแพร่แล้ว - ${p.torTitle}`,
    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        'TOR ที่คุณบันทึกไว้เปลี่ยนสถานะจาก "ร่าง" เป็น "เผยแพร่แล้ว"',
        "",
        `ชื่อ TOR: ${p.torTitle}`,
        `ขอบเขตงาน: ${p.scope}`,
        "",
        `ดูรายละเอียด: ${p.torUrl}`,
        ...contractorFooter(),
    ].join("\n"),
});

// p = { name, torTitle, torUrl }
const draftUpdated = (p) => ({
    subject:
        `TOR ร่างที่คุณบันทึกไว้มีการอัปเดต - ${p.torTitle}`,

    // Plain text fallback
    text: [
        `สวัสดีคุณ ${p.name},`,
        "",
        `TOR "${p.torTitle}" ที่คุณบันทึกไว้ (ยังอยู่ในสถานะร่าง) มีการอัปเดตข้อมูล`,
        "",
        `ดูรายละเอียด: ${p.torUrl}`,
        ...contractorFooter(),
    ].join("\n"),

    html: draftUpdatedEmail({
        userName: p.name,
        projectName: p.torTitle,
        torUrl: p.torUrl,
    }),
});

module.exports = { newMatch, deadlineReminder, draftPublished, draftUpdated };
