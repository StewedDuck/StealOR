const { appUrl } = require("./Shared");

// p = {name}
const accountApproved = (p) => ({
    subject: "บัญชีของคุณได้รับการอนุมัติแล้ว",
    text: [
      `สวัสดีคุณ ${p.name},`,
      "",
      "ผู้ดูแลระบบอนุมัติบัญชีเจ้าของโครงการของคุณแล้ว ตอนนี้คุณสามารถเข้าใช้งานได้เต็มรูปแบบ",
      "",
      `เข้าสู่ระบบ: ${appUrl()}/login`,
    ].join("\n"),
});

// p = { name, reason }
const accountRejected = (p) => ({
    subject: "ผลการตรวจสอบบัญชีของคุณ",
    text: [
      `สวัสดีคุณ ${p.name},`,
      "",
      "ขออภัย ผู้ดูแลระบบยังไม่สามารถอนุมัติบัญชีเจ้าของโครงการของคุณได้",
      "",
      `เหตุผล: ${p.reason}`,
      "",
    ].join("\n"),
});

module.exports = { accountApproved, accountRejected };
