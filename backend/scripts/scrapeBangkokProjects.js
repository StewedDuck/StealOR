require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const readline = require("readline"); // เพิ่มตัวนี้สำหรับรอการกด Enter

puppeteer.use(StealthPlugin());

// ฟังก์ชันสร้างการรอให้คนกด Enter
function askToContinue(questionText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(questionText, ans => {
    rl.close();
    resolve(ans);
  }));
}

async function main() {
  console.log("1. กำลังเปิด Browser...");
  const browser = await puppeteer.launch({ headless: false }); 
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");

  const SEARCH_URL = "https://process5.gprocurement.go.th/egp-agpc01-web/announcement"; 

  try {
    console.log(`2. เข้าสู่หน้าเว็บ: ${SEARCH_URL}`);
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded" });

    // ==========================================
    // จุดเบรกบอท: รอให้คุณจัดการ Cloudflare ให้เสร็จ
    // ==========================================
    console.log("\n=======================================================");
    console.log("🛑 บอทหยุดรอชั่วคราว: ด่าน Cloudflare!");
    console.log("1. ไปที่หน้าจอ Chrome ที่เปิดอยู่");
    console.log("2. คลิกยืนยัน Cloudflare หรือรอจนกว่ามันจะขึ้นว่า 'สำเร็จ!'");
    console.log("3. เมื่อเว็บพร้อมแล้ว ให้กลับมาที่หน้านี้ แล้วกดปุ่ม Enter 1 ครั้ง เพื่อให้บอททำงานต่อ");
    console.log("=======================================================\n");

    await askToContinue("👉 กดปุ่ม Enter ที่นี่เพื่อเริ่มสเต็ปต่อไป: ");

    console.log("\n3. บอททำงานต่อ: กำลังกดปุ่ม 'ค้นหาขั้นสูง'...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const advancedBtn = buttons.find(b => b.innerText.includes('ค้นหาขั้นสูง'));
      if (advancedBtn) advancedBtn.click();
    });

    console.log("4. รอให้หน้าต่างค้นหาขั้นสูงเด้งขึ้นมา...");
    const provinceInputSelector = 'ng-select[name="provinceMoiId"] input[type="text"]';
    
    await page.waitForSelector(provinceInputSelector, { visible: true, timeout: 10000 });

    console.log("เจอช่องจังหวัดแล้ว! กำลังคลิกและพิมพ์...");
    await page.click(provinceInputSelector);
    await page.type(provinceInputSelector, 'กรุงเทพมหานคร');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.keyboard.press('Enter');

    console.log("🎉 เลือกจังหวัดสำเร็จ! บอทจะเปิดหน้าจอค้างไว้ 15 วินาทีให้คุณตรวจสอบ...");
    await new Promise(resolve => setTimeout(resolve, 15000));

  } catch (error) {
    console.error("เกิดข้อผิดพลาดระหว่างทดสอบ:", error);
  } finally {
    console.log("ปิด Browser...");
    await browser.close();
    process.exit(0);
  }
}

main();