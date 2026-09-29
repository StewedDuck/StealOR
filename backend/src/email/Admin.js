const { formatDate } = require("./Shared");

// p = { ownerName, ownerEmail, submittedAt, reviewUrl }
const verificationRequest = (p) => ({
    subject: `มีคำขอยืนยันบัญชีเจ้าของโครงการ: ${p.ownerName}`,
    text: [
        "มีเจ้าของโครงการส่งคำขอยืนยันบัญชี รอการตรวจสอบและอนุมัติ",
        "",
        `ชื่อ: ${p.ownerName}`,
        `อีเมล: ${p.ownerEmail}`,
        `ส่งคำขอเมื่อ: ${formatDate(p.submittedAt)}`,
        "",
        `ตรวจสอบคำขอ: ${p.reviewUrl}`,
    ].join("\n"),
})

module.exports = { verificationRquest };