const { notificationEmail } = require('./notificationEmail');
function draftUpdatedEmail({ userName, projectName, torUrl }) {
    return notificationEmail({ title: 'TOR ร่างที่คุณบันทึกไว้มีการอัปเดต', subtitle: 'มีการเปลี่ยนแปลงข้อมูลใน TOR ที่คุณกำลังติดตาม',
        message: 'TOR ที่คุณบันทึกไว้ยังอยู่ในสถานะร่าง และเจ้าของโครงการได้อัปเดตข้อมูล',
        name: userName, projectName, url: torUrl, label: 'TOR UPDATED', buttonLabel: 'ดูรายละเอียด TOR',
    }).html;
}
module.exports = { draftUpdatedEmail };
