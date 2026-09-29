const appUrl = () => process.env.APP_URL || "http://localhost:3000";

const formatDate = (date) => 
    new Intl.DateTimeFormat("th-TH", { dateStyle: "long" }).format(new Date(date));

const contractorFooter = () => [
    "",
    "---",
    "นี่คืออีเมลอัตโนมัติจากระบบ sTealORs",
];

module.exports = { appUrl, formatDate, contractorFooter };