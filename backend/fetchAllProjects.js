const fs = require("fs");

async function fetchAllPages() {
  let allData = [];
  let page = 1;
  let hasMore = true;

  console.log("🚀 Starting to fetch all projects from e-GP...");

  while (hasMore) {
    console.log(`⏳ Fetching page ${page}...`);
    // สังเกตตรง &page=${page} มันจะเปลี่ยนเลขไปเรื่อยๆ
    const url = `https://process5.gprocurement.go.th/egp-oann10-service/pb/a-egp-allt-project/announcement?moiId=100000&goodsId=4010&announceSDate=2023-01-01&announceEDate=2027-12-31&projectStatus=3&announcementTodayFlag=false&page=${page}`;
    
    try {
      const response = await fetch(url, {
        "headers": {
          "accept": "application/json, text/plain, */*",
          "accept-language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type": "application/json",
          // Token และ Cookie ดึงมาจากที่คุณ Copy มา (อาจมีวันหมดอายุ ถ้า Error ให้ดึงจากเว็บมาเปลี่ยนใหม่)
          "x-announcement-token": "RUdQLUFOTk9VTkNFTUVOVC1LRVk6MTc5MzI0NDkwNzk0MzpCOWhtU2tJMjJNeHBzZm9zZlNvYWdpdGI2aUtxcnpNYktNejlMaDVoX3pJPQ==",
          "x-xsrf-token": "CLgQ+1Pm0x8/ZWKKX3mCGGSTYckTgQY2uQiVUR6JlNKiWzvCbpZqPTX9kLvbwQlI7kx8xsBH0tdoAej1nxZGeQ==",
          "cookie": "_ga=GA1.3.413107968.1788865743; www_visit=true; _gid=GA1.3.1696796765.1793197995; _ga_EMER03ZW3V=GS2.3.s1793200917$o25$g0$t1793200917$j60$l0$h0; Xsrf-Token=49d4f0b5e87198751c389643b7bb3b3d678132fe; TS01697ec9=013763bc3b198939c1d0a1c36f14a3d1e208c3183dd1a53aa45bc3f634346d2bdd3cb97726b232619d5abc7bb6e028199cd23cd7c5182673a04ca32b2d6782ef3f2ffa7343; TS7b3d1204027=0848d303d2ab2000b622a83706ec8025a7e34e46c79a133a9f872b39fa3b1eae6487012743af27b1087e89edf8113000f8873c7ac71d38dd16e1f62b32094b7ed1c42204a4ff91734019581152d9f5e934ff7244fc906f1c0ad35a4a5cef29ed",
          "Referer": "https://process5.gprocurement.go.th/egp-agpc01-web/announcement"
        },
        "method": "GET"
      });

      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} - Token อาจจะหมดอายุ ลอง Copy มาใส่ใหม่`);
        break;
      }

      const json = await response.json();
      
      // ตรวจสอบว่าหน้าปัจจุบันยังมีข้อมูลอยู่ไหม
      if (json && json.data && json.data.length > 0) {
        allData = allData.concat(json.data); // เอาข้อมูลมาต่อกัน
        page++;
        // หน่วงเวลา 1 วินาทีกันเซิร์ฟเวอร์รัฐมองว่าเรายิงถล่ม (DDoS)
        await new Promise(r => setTimeout(r, 1000));
      } else {
        hasMore = false; // ไม่มีข้อมูลแล้ว แปลว่าดึงครบทุกหน้าแล้ว
      }
    } catch (err) {
      console.error("❌ Fetch error:", err.message);
      break;
    }
  }

  console.log(`\n✅ Finished fetching! Total records: ${allData.length}`);
  
  // จัด Format ให้เหมือนไฟล์ projects.json ที่โค้ด Pipeline เราต้องการ
  const finalJson = {
    data: allData,
    response: { responseCode: 0, responseDesc: "Auto Fetched" }
  };

  fs.writeFileSync("projects.json", JSON.stringify(finalJson, null, 2));
  console.log("💾 Saved all data to projects.json. You can now run the pipeline!");
}

fetchAllPages();