const { notificationEmail } = require('./notificationEmail');
function closingSoonEmail({ userName, projectName, agencyName, deadline, daysLeft, torUrl }) {
    return notificationEmail({ title: 'TOR ที่คุณบันทึกไว้ใกล้ปิดรับ', subtitle: 'อย่าลืมตรวจสอบรายละเอียดก่อนหมดเขตรับสมัคร',
        message: `TOR ที่คุณบันทึกไว้จะปิดรับในอีก ${daysLeft} วัน`, name: userName, projectName, agencyName: agencyName || 'ไม่ระบุหน่วยงาน',
        url: torUrl, label: 'TOR ใกล้ปิดรับ', buttonLabel: 'ดู TOR ที่บันทึกไว้',
        facts: [{ label: 'ปิดรับ', value: deadline }, { label: 'เหลืออีก', value: `${daysLeft} วัน` }],
    }).html;
}
module.exports = { closingSoonEmail };
