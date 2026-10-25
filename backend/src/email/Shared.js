const appUrl = () => process.env.APP_URL || "http://localhost:3000";

const formatDate = date => {
    const value = date ? new Date(date) : null;
    return value && Number.isFinite(value.getTime())
        ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }).format(value)
        : 'ไม่ระบุ';
};

const contractorFooter = () => [
    "",
    "---",
    "นี่คืออีเมลอัตโนมัติจากระบบ sTealORs",
];

module.exports = { appUrl, formatDate, contractorFooter };