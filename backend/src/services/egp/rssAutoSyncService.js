const path = require("path");
const cron = require("node-cron");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { VertexAI, SchemaType } = require("@google-cloud/vertexai");

const { fetchEgpRssAnnouncements } = require("./egpRssService");
const GovProject = require("../../models/GovProject");
const RssDepartment = require("../../models/RssDepartment");
const { logActivity } = require("../../utils/logger");

const execFileAsync = promisify(execFile);

let isSyncRunning = false;
let lastRunAt = null;
let cronTask = null;

function getAiModel() {
  const vertex_ai = new VertexAI({
    project: process.env.VERTEX_AI_PROJECT_ID,
    location: process.env.VERTEX_AI_LOCATION,
  });

  return vertex_ai.getGenerativeModel({
    model: process.env.VERTEX_AI_MODEL || "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          isIT: {
            type: SchemaType.BOOLEAN,
            description: "true ถือเป็นงานไอที/ซอฟต์แวร์ false ถ้าไม่ใช่",
          },
        },
        required: ["isIT"],
      },
      temperature: 0,
    },
  });
}

async function isTargetITProjectByAI(aiModel, projectName) {
  try {
    const prompt = `
      คุณคือผู้เชี่ยวชาญด้าน IT Procurement ของภาครัฐ
      จงพิจารณาชื่อโครงการต่อไปนี้ ว่าเป็นงานที่เกี่ยวข้องกับ ซอฟต์แวร์, ไอที, ระบบเครือข่าย, แอปพลิเคชัน, แพลตฟอร์มดิจิทัล, หรือ API หรือไม่?
      (ระวัง: งานก่อสร้างอาคาร, ซื้อรถยนต์, ทำความสะอาด, รักษาความปลอดภัย, เครื่องปรับอากาศ "ไม่ใช่" งานไอที)
      
      ชื่อโครงการ: "${projectName}"
    `;
    const result = await aiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let responseText = result.response.candidates[0].content.parts[0].text;
    responseText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    return Boolean(JSON.parse(responseText).isIT);
  } catch (error) {
    console.error(`[RSS] AI pre-filter error for "${projectName}":`, error.message);
    return false;
  }
}

async function seedDefaultDepartmentIfEmpty() {
  const count = await RssDepartment.countDocuments({});
  if (count === 0) {
    await RssDepartment.create({
      deptId: "0706",
      name: "กรมทางหลวง",
      isActive: true,
      addedBy: "system",
    });
    console.log("[RSS] Seeded default department: 0706 (กรมทางหลวง)");
  }
}

async function runRssSyncOnce(triggeredBy = "StealOR Bot") {
  if (isSyncRunning) {
    console.log("[RSS] Sync already in progress, skipping overlapping run.");
    return { skipped: true };
  }

  isSyncRunning = true;
  lastRunAt = new Date();

  try {
    await seedDefaultDepartmentIfEmpty();
    const departments = await RssDepartment.find({ isActive: true }).lean();

    if (departments.length === 0) {
      console.log("[RSS] No active departments configured.");
      return { skipped: false, totalItems: 0 };
    }

    const aiModel = getAiModel();
    let totalItems = 0;
    let newItProjects = 0;
    const pipelineScript = path.resolve(__dirname, "../../../scripts/runSafePipeline.js");

    for (const dept of departments) {
      console.log(`[RSS] Fetching department ${dept.deptId} (${dept.name})...`);

      const [draftTors, invitations] = await Promise.all([
        fetchEgpRssAnnouncements({ deptId: dept.deptId, anounceType: "B0" }).catch((err) => {
          console.error(`[RSS] Failed B0 for ${dept.deptId}:`, err.message);
          return [];
        }),
        fetchEgpRssAnnouncements({ deptId: dept.deptId, anounceType: "D0" }).catch((err) => {
          console.error(`[RSS] Failed D0 for ${dept.deptId}:`, err.message);
          return [];
        }),
      ]);

      const items = [...draftTors, ...invitations];
      totalItems += items.length;

      for (const item of items) {
        if (!item.projectId) continue;

        const isIT = await isTargetITProjectByAI(aiModel, item.title);
        if (!isIT) continue;

        const existing = await GovProject.findOne({ project_id: item.projectId });
        if (!existing) {
          await GovProject.create({
            project_id: item.projectId,
            project_name: item.title,
            dept_name: dept.name || "กำลังรอวิเคราะห์...",
            budget_amount: 0,
            sum_price_agree: 0,
            contract_status: "หนังสือเชิญชวน/ประกาศเชิญชวน",
          });
          newItProjects += 1;

          await logActivity(
            "system",
            triggeredBy,
            "พบโครงการไอทีใหม่",
            `[${dept.deptId}] ${item.title} (ID: ${item.projectId})`
          );
        }

        try {
          await execFileAsync("node", [pipelineScript, item.projectId], {
            cwd: path.resolve(__dirname, "../../.."),
          });
        } catch (pipeErr) {
          console.error(`[RSS] Pipeline failed for ${item.projectId}:`, pipeErr.message);
        }
      }
    }

    await logActivity(
      "system",
      triggeredBy,
      "อัปเดต e-GP RSS อัตโนมัติ",
      `สแกน ${departments.length} หน่วยงาน พบประกาศ ${totalItems} รายการ (โครงการ IT ใหม่ ${newItProjects} โครงการ)`
    );

    return { skipped: false, departments: departments.length, totalItems, newItProjects };
  } catch (error) {
    console.error("[RSS] Global sync error:", error.message);
    await logActivity("security", triggeredBy, "ข้อผิดพลาดระบบ RSS", error.message);
    return { error: error.message };
  } finally {
    isSyncRunning = false;
  }
}

function startRssAutoSync() {
  if (process.env.RSS_AUTO_SYNC_ENABLED === "false") {
    console.log("[RSS] Auto-sync disabled via RSS_AUTO_SYNC_ENABLED=false");
    return;
  }

  seedDefaultDepartmentIfEmpty().catch((err) =>
    console.error("[RSS] Default department seed error:", err.message)
  );

  // รันอัตโนมัติเวลา 08:00 และ 20:00 น. (เวลาไทย)
  cronTask = cron.schedule(
    "0 8,20 * * *",
    () => {
      runRssSyncOnce("StealOR Bot");
    },
    { timezone: "Asia/Bangkok" }
  );

  console.log("[RSS] Auto-sync scheduler started (08:00 & 20:00 Asia/Bangkok)");

  // ถ้าอยากให้รันทันที 1 รอบหลังเปิด server ให้ตั้ง RSS_SYNC_ON_BOOT=true ใน .env
  if (process.env.RSS_SYNC_ON_BOOT === "true") {
    setTimeout(() => runRssSyncOnce("StealOR Bot"), 5000);
  }
}

function getRssSyncStatus() {
  return { isRunning: isSyncRunning, lastRunAt };
}

module.exports = {
  startRssAutoSync,
  runRssSyncOnce,
  getRssSyncStatus,
};