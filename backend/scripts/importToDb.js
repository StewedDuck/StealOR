require("dotenv").config();
const fs = require('fs');
const mongoose = require("mongoose");
const { enrichAndSaveProjects } = require("../src/services/govProjectBatchImportService");

async function importToDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("Missing MONGODB_URI in .env");

  try {
    console.log("1. กำลังอ่านไฟล์ projects_dump.json...");
    // อ่านไฟล์ JSON ที่คุณเซฟไว้
    const rawData = fs.readFileSync('projects_dump.json', 'utf8');
    const projects = JSON.parse(rawData);
    
    console.log(`อ่านข้อมูลสำเร็จ: พบทั้งหมด ${projects.length} รายการ`);

    console.log("2. กำลังเคลียร์ฟิลด์ URL ทิ้ง...");
    // วนลูปเพื่อตัด field 'url' ออกจากข้อมูลทุกตัว
    const cleanProjects = projects.map(item => {
      // ใช้ Destructuring เพื่อแยก url ออก แล้วเก็บที่เหลือไว้ใน rest
      const { url, ...rest } = item;
      return rest;
    });

    console.log("3. กำลังเชื่อมต่อ MongoDB Atlas...");
    await mongoose.connect(mongoUri);
    console.log("เชื่อมต่อ DB สำเร็จ!");

    console.log("4. กำลังบันทึกข้อมูลเข้า Database (StealOR)...");
    // โยนข้อมูลที่คลีนแล้วเข้า Service
    const stats = await enrichAndSaveProjects(cleanProjects);
    
    console.log("\n✅ นำเข้าข้อมูลสำเร็จเรียบร้อย! ผลลัพธ์:");
    console.log(stats);

  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการนำเข้าข้อมูล:", error.message);
  } finally {
    console.log("ปิดการเชื่อมต่อ Database...");
    await mongoose.disconnect();
    process.exit(0);
  }
}

importToDatabase();