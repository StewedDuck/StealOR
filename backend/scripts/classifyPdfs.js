require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { createVertexAIClient } = require('../src/services/vertexAIService');

const MODEL_NAME = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

// หั่น PDF เอาเฉพาะ 3 หน้าแรก
async function getPreviewPdf(pdfBuffer, maxPages = 3) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  if (totalPages <= maxPages) return pdfBuffer;

  const previewDoc = await PDFDocument.create();
  const pagesToCopy = await previewDoc.copyPages(
    pdfDoc,
    Array.from({ length: maxPages }, (_, i) => i)
  );
  pagesToCopy.forEach((page) => previewDoc.addPage(page));

  const previewBytes = await previewDoc.save();
  return Buffer.from(previewBytes);
}

// วิเคราะห์ 3 หน้าแรกเพื่อจัดประเภท
async function classifyWithAI(previewBuffer, category) {
  const client = createVertexAIClient();
  const prompt = `
  คุณคือ AI ผู้เชี่ยวชาญการวิเคราะห์เอกสารจัดซื้อจัดจ้างภาครัฐ (e-GP) ของไทย
  เอกสารตัวอย่างนี้ (ดึงมาเฉพาะส่วนต้น) มาจากหมวดหมู่: "${category}"

  ให้อ่านเนื้อหาและจัดประเภท (Label) ว่ามันน่าจะเป็นเอกสารประเภทใด โดยเลือกจาก 5 ตัวเลือกนี้เท่านั้น:
  - PRICE_ESTIMATE : หากเป็น "ตารางแสดงวงเงินงบประมาณที่ได้รับจัดสรรและราคากลาง", "แบบ บก.01-บก.06" ที่มีตัวเลขราคากลางจริงของโครงการ (ไม่ใช่แบบฟอร์มเปล่า)
  - TOR : หากมีเนื้อหาเกี่ยวกับ "ขอบเขตของงาน", "Terms of Reference" หรือ "รายละเอียดคุณลักษณะเฉพาะ"
  - BIDDING_NOTICE : หากมีเนื้อหาเกี่ยวกับ "ประกาศประกวดราคา" หรือ "กำหนดยื่นข้อเสนอ"
  - DRAFT_NOTICE : หากมีเนื้อหาเกี่ยวกับ "ร่างประกาศประกวดราคา" หรือ "รับฟังคำวิจารณ์"
  - JUNK : หากไม่ใช่เอกสารเป้าหมาย เช่น หนังสือค้ำประกัน, ใบเสนอราคาเปล่า, สัญญาจ้าง, บทนิยาม, แบบฟอร์มแผนการใช้พัสดุในประเทศ/แผนการใช้เหล็ก, หรือแบบฟอร์มตารางเปล่าที่ไม่มีข้อมูลโครงการจริง

  ตอบกลับมาเป็น JSON Format เท่านั้น:
  { "label": "ป้ายที่เลือก" }
  `;

  try {
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: [
        { inlineData: { data: previewBuffer.toString('base64'), mimeType: 'application/pdf' } },
        prompt,
      ],
      config: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });
    const result = JSON.parse(response.text.trim());
    return result.label || 'ERROR';
  } catch (error) {
    console.error(`  [Classification Error]: ${error.message}`);
    return 'ERROR';
  }
}

// สกัดข้อความแบบ Chunking ละ 4 หน้า + ปิด Thinking Mode กัน Timeout
async function extractFullTextWithAI(fullPdfBuffer, chunkSize = 4) {
  const client = createVertexAIClient();
  const pdfDoc = await PDFDocument.load(fullPdfBuffer, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const prompt = `
  จงสกัดข้อความภาษาไทย ตัวเลข และตารางทั้งหมดจากเอกสาร PDF นี้ให้ออกมาเป็นข้อความล้วน (Plain text)
  - ห้ามสรุปความ
  - ห้ามตัดทอนเนื้อหา
  - พิมพ์ข้อความออกมาให้ตรงตามต้นฉบับที่สุด
  `;

  let combinedText = '';

  for (let i = 0; i < totalPages; i += chunkSize) {
    const endPage = Math.min(i + chunkSize, totalPages);
    if (totalPages > chunkSize) {
      console.log(`    📄 กำลังสกัดหน้า ${i + 1} - ${endPage} (ทั้งหมด ${totalPages} หน้า)...`);
    }

    const chunkDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: endPage - i }, (_, idx) => i + idx);
    const pages = await chunkDoc.copyPages(pdfDoc, pageIndices);
    pages.forEach((p) => chunkDoc.addPage(p));
    const chunkBuffer = Buffer.from(await chunkDoc.save());

    let retries = 3;
    let chunkText = '';
    while (retries > 0) {
      try {
        const response = await client.models.generateContent({
          model: MODEL_NAME,
          contents: [
            { inlineData: { data: chunkBuffer.toString('base64'), mimeType: 'application/pdf' } },
            prompt,
          ],
          config: { 
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 } // ปิด คิดวิเคราะห์ เพื่อให้สตรีม Text ทันที ไม่ติด Timeout
          },
        });
        chunkText = String(response.text || '').trim();
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        console.log(`    ⚠️ ข้อผิดพลาด (${err.message}), กำลังลองใหม่ใน 5 วินาที... (เหลือโควต้าลองอีก ${retries} ครั้ง)`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    combinedText += chunkText + '\n\n';

    if (endPage < totalPages) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return combinedText.trim();
}

// ประมวลผลทีละโฟลเดอร์หมวดหมู่
async function processCategory(manifestPath, projectId, category) {
  try {
    const manifestData = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestData);

    // เช็คว่ามีไฟล์ที่ยังค้างอยู่หรือไม่
    const pendingPdfs = manifest.pdfs.filter(
      (p) => !(p.label === 'JUNK' || (p.label && p.extractedTextPath))
    );

    if (pendingPdfs.length === 0) {
      console.log(`📁 โฟลเดอร์: ${projectId} -> [${category}] ทำเสร็จครบทุกไฟล์แล้ว (ข้าม)`);
      return;
    }

    console.log(`\n📁 ตรวจสอบโฟลเดอร์: ${projectId} -> [${category}] (พบ ${manifest.pdfs.length} ไฟล์, ค้างอยู่ ${pendingPdfs.length} ไฟล์)`);

    for (let i = 0; i < manifest.pdfs.length; i++) {
      const pdfItem = manifest.pdfs[i];
      const fileName = pdfItem.originalFileName;

      // ข้ามไฟล์ที่เสร็จแล้วแน่นอน
      if (pdfItem.label === 'JUNK' || (pdfItem.label && pdfItem.extractedTextPath)) {
        continue;
      }

      const pdfFilePath = path.join(__dirname, '..', 'temp', pdfItem.localArtifactPath);
      const txtRelativePath = pdfItem.localArtifactPath.replace(/\.pdf$/i, '.txt');
      const txtFilePath = path.join(__dirname, '..', 'temp', txtRelativePath);

      try {
        const fullPdfBuffer = await fs.readFile(pdfFilePath);

        console.log(`  👀 [${i + 1}/${manifest.pdfs.length}] วิเคราะห์ 3 หน้าแรก: ${fileName}...`);
        const previewBuffer = await getPreviewPdf(fullPdfBuffer, 3);

        const detectedLabel = await classifyWithAI(previewBuffer, category);
        manifest.pdfs[i].label = detectedLabel;

        if (detectedLabel === 'JUNK' || detectedLabel === 'ERROR') {
          console.log(`  🗑️  [${detectedLabel}] -> ข้ามการสกัดข้อความ`);
        } else {
          console.log(`  🎯 [${detectedLabel}] -> กำลังสกัดข้อความทั้งเล่ม...`);
          const extractedText = await extractFullTextWithAI(fullPdfBuffer);

          await fs.writeFile(txtFilePath, extractedText, 'utf8');
          manifest.pdfs[i].extractedTextPath = txtRelativePath;
          console.log(`  ✅ บันทึกข้อความสำเร็จ: ${txtRelativePath}`);
        }

        // 💾 บันทึก manifest ทันทีทุกครั้งที่จบแต่ละไฟล์ (ป้องกัน progress หายหากกดหยุด)
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

        // หน่วงเวลา 2.5 วินาทีต่อไฟล์ ป้องกัน Rate Limit (429)
        await new Promise((res) => setTimeout(res, 2500));
      } catch (err) {
        console.error(`  ❌ ข้อผิดพลาดในไฟล์ ${fileName}: ${err.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ อ่านไฟล์ manifest ไม่สำเร็จ (${manifestPath}): ${error.message}`);
  }
}

// สแกนทุกโครงการโดยเรียงลำดับแน่นอน
async function runAll() {
  const basePdfsDir = path.join(__dirname, '..', 'temp', 'pdfs');

  try {
    const projectDirs = await fs.readdir(basePdfsDir, { withFileTypes: true });
    // เรียงลำดับชื่อโฟลเดอร์แบบแน่นอนเสมอ
    const projectIds = projectDirs
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    console.log(`🚀 เริ่มต้นประมวลผลทั้งหมด: พบ ${projectIds.length} โครงการในโฟลเดอร์ temp/pdfs`);

    for (let p = 0; p < projectIds.length; p++) {
      const projectId = projectIds[p];
      const projectPath = path.join(basePdfsDir, projectId);

      console.log(`\n==================================================`);
      console.log(`🏗️  กำลังประมวลผลโครงการ [${p + 1}/${projectIds.length}]: ${projectId}`);
      console.log(`==================================================`);

      const categoryDirs = (await fs.readdir(projectPath, { withFileTypes: true }))
        .filter((c) => c.isDirectory())
        .map((c) => c.name)
        .sort();

      for (const category of categoryDirs) {
        const manifestPath = path.join(projectPath, category, 'manifest.json');

        try {
          await fs.access(manifestPath);
          await processCategory(manifestPath, projectId, category);
        } catch {
          // หากไม่มี manifest.json ให้ข้าม
        }
      }
    }

    console.log(`\n🎉 เสร็จสิ้นการประมวลผลทั้งหมดครบทุกโฟลเดอร์แล้ว!`);
  } catch (err) {
    console.error('❌ เกิดข้อผิดพลาดในการเข้าถึงโฟลเดอร์ temp/pdfs:', err.message);
  }
}

runAll();