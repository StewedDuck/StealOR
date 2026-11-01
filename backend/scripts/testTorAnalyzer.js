const { analyzeTor } = require("../src/services/torAnalyzer");

async function main() {
    const sampleTor = {
        project_name: "ระบบบริหารจัดการข้อมูลมห่วิทยาลัย",
        dept_name: "มหาวิทยาลัยตัวอย่าง",

        procurementAnalysis: {
            contractorQualifications: {
                generalLegal: [
                    "ผู้เสนอราคาต้องเป็นผู้ประกอบการที่ลงทะเบียนในระบบ e-GP",
                ],
                projectSpecific: [
                    "ผู้เสนอราคาต้องมีผลงานพัฒนาระบบสารสนเทศมูลค่าไม่น้อยกว่า 3,000,000 บาท ภายใน 5 ปีที่ผ่านมา",
                    "ผู้เสนอราคาต้องมีบุคลากรสำหรับโครงการไม่น้อยกว่า 12 คน",
                ],
            },

            technicalRequirements: [
                "ระบบต้องพัฒนาโดยใช้ Laravel 12",
                "ต้องใช้ Git สำหรับจัดการ Source Code",
                "ต้องรองรับการใช้งานผ่าน Web Browser",
            ],

            scopeOfWork: [
                "พัฒนาระบบบริหารจัดการข้อมูล",
                "ทดสอบระบบก่อนส่งมอบ",
            ],
        },
    };

    const result = await analyzeTor(sampleTor, "government");
    console.log("\n--- AI TOR ANALYSIS ---");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n--- SUMMARY ---");
    console.log("Status:", result.status);
    console.log("Scoring Status:", result.scoringStatus);

    for (const item of result.requirements) {
        console.log(`\n[${item.category.toUpperCase()}] ${item.text}`);
        console.log("Profile Field:", item.profileField);
        console.log("Reason:", item.reason);
    }
}

main().catch((error) => {
    console.error("Analyxer failed:", error.message);
    process.exitCode = 1;
});