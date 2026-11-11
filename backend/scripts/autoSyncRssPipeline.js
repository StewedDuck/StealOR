require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const cron = require("node-cron");
const { execSync } = require("child_process");

const { fetchEgpRssAnnouncements } = require("../src/services/egp/egpRssService");
const GovProject = require("../src/models/GovProject");
const { VertexAI, SchemaType } = require("@google-cloud/vertexai");

const vertex_ai = new VertexAI({ 
  project: process.env.VERTEX_AI_PROJECT_ID, 
  location: process.env.VERTEX_AI_LOCATION 
});

const aiModel = vertex_ai.getGenerativeModel({
  model: process.env.VERTEX_AI_MODEL || "gemini-2.5-flash",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: SchemaType.OBJECT,
      properties: {
        isIT: { type: SchemaType.BOOLEAN, description: "true ถือเป็นงานไอที/ซอฟต์แวร์ false ถ้าไม่ใช่" }
      },
      required: ["isIT"],
    },
    temperature: 0, // บังคับให้ AI ตอบแม่นยำไม่แกว่ง
  },
});

function getTodayCE() {
  const d = new Date();
  const yyyy = d.getFullYear(); // ปี ค.ศ.
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function isTargetITProjectByAI(projectName) {
  try {
    const prompt = `
      คุณคือผู้เชี่ยวชาญด้าน IT Procurement ของภาครัฐ
      จงพิจารณาชื่อโครงการต่อไปนี้ ว่าเป็นงานที่เกี่ยวข้องกับ ซอฟต์แวร์, ไอที, ระบบเครือข่าย, แอปพลิเคชัน, แพลตฟอร์มดิจิทัล, หรือ API หรือไม่?
      (ระวัง: งานก่อสร้างอาคาร, ซื้อรถยนต์, ทำความสะอาด, รักษาความปลอดภัย, เครื่องปรับอากาศ "ไม่ใช่" งานไอที)
      
      ชื่อโครงการ: "${projectName}"
    `;
    
    const request = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
    const result = await aiModel.generateContent(request);
    
    // 🟢 เปลี่ยนจาก const เป็น let เพื่อให้แก้ไขค่าได้
    let responseText = result.response.candidates[0].content.parts[0].text;
    
    // 🟢 เพิ่มบรรทัดนี้: ลบสัญลักษณ์ ```json หรือ ``` ที่ AI ชอบแถมมาทิ้งไปก่อน
    responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(responseText);
    return parsed.isIT;
    
  } catch (error) {
    console.error(`⚠️ AI Pre-filter error สำหรับ "${projectName}":`, error.message);
    return false; 
  }
}

async function pollOnce() {
  const dateStr = getTodayCE();
  console.log(`\n📡 [RSS Poller] เริ่มดึงข้อมูลประกาศ...`);

  try {
    console.log(`  🔍 1/2 กำลังค้นหา 'ร่างประกาศ' (ประเภท Bo)...`);
    
    // 🔴 ของเดิม: await fetchEgpRssAnnouncements({ anounceType: "Bo", announceDate: dateStr })
    // 🟢 ของใหม่: เพิ่ม deptId: "0304" และลบ announceDate ออกเพื่อกวาดข้อมูลย้อนหลังมาเทส
    const draftTors = await fetchEgpRssAnnouncements({ deptId: "0706", anounceType: "B0" }).catch((err) => {
        console.error(`  ⚠️ ดึงร่างประกาศ (B0) ไม่สำเร็จ:`, err.message);
        return [];
    });
    console.log(`  👉 พบร่างประกาศ (B0): ${draftTors.length} โครงการ`);

    console.log(`  🔍 2/2 กำลังค้นหา 'ประกาศเชิญชวน' (ประเภท D0)...`);
    
    // 🟢 เปลี่ยนจาก Do เป็น D0 (เลขศูนย์) และลองดึงของกรมทางหลวง (0706)
    const invitations = await fetchEgpRssAnnouncements({ deptId: "0706", anounceType: "D0" }).catch((err) => {
        console.error(`  ⚠️ ดึงประกาศเชิญชวน (D0) ไม่สำเร็จ:`, err.message);
        return [];
    });
    console.log(`  👉 พบประกาศเชิญชวน (Do): ${invitations.length} โครงการ`);

    // รวมข้อมูล
    const items = [...draftTors, ...invitations];
    console.log(`\n✅ รวมประกาศที่พบทั้งหมด: ${items.length} รายการ`);

    if (items.length === 0) {
        console.log(`🤷‍♂️ ไม่มีประกาศในวันนี้ (อาจเป็นวันหยุด หรือระบบ e-GP ยังไม่อัปเดต)`);
        return; // ไม่ต้องทำต่อให้เปลือง AI
    }

    console.log(`\n🧠 กำลังส่งให้ AI (Gemini 2.5 Flash) คัดกรองเฉพาะงาน IT...`);
    for (const item of items) {
      if (!item.projectId) continue;

      // 1. เช็คด่านหน้าด้วย AI
      const isIT = await isTargetITProjectByAI(item.title);
      
      if (isIT) {
        console.log(`🎯 [AI PASS] ${item.projectId} - ${item.title}`);
        
        const existing = await GovProject.findOne({ project_id: item.projectId });
        if (!existing) {
          await GovProject.create({
            project_id: item.projectId,
            project_name: item.title,
            dept_name: "กำลังรอวิเคราะห์...",
            budget_amount: 0,
            sum_price_agree: 0,
            contract_status: "หนังสือเชิญชวน/ประกาศเชิญชวน"
          });
          console.log(`  📝 สร้าง Placeholder ใน DB เรียบร้อย`);
        }

        console.log(`  🚀 กำลังเตะเข้า Safe Pipeline...`);
        try {
          execSync(`node scripts/runSafePipeline.js ${item.projectId}`, { stdio: "inherit" });
        } catch (pipeErr) {
          console.error(`  ❌ Pipeline แครชสำหรับ ${item.projectId}`);
        }
      } else {
        console.log(`🗑️ [AI REJECT] (ไม่ใช่ IT) - ${item.title}`);
      }
    }
  } catch (error) {
    console.error("❌ การดึงข้อมูล RSS ล้มเหลวแบบภาพรวม:", error.message);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ เชื่อมต่อ MongoDB สำเร็จ");
  
  // รันทันที 1 ครั้งตอนเปิดสคริปต์
  await pollOnce();

  // เพิ่ม Log บอกการเข้าสู่โหมด Standby
  console.log(`\n⏳ [Standby] จบรอบการทำงาน เข้าสู่โหมดสแตนด์บาย...`);
  console.log(`⏰ ระบบจะตื่นขึ้นมาดึงข้อมูลอัตโนมัติรอบถัดไปเวลา 08:00 น. และ 20:00 น. ของทุกวัน`);

  // ตั้งเวลาดึงข้อมูลตอน 08:00 และ 20:00
  cron.schedule('0 8,20 * * *', () => {
    console.log(`\n=============================================`);
    console.log(`⏰ [${new Date().toLocaleTimeString('th-TH')}] ถึงรอบเวลาดึงข้อมูลแล้ว! เริ่มทำงาน...`);
    console.log(`=============================================`);
    pollOnce();
  });
}

main();