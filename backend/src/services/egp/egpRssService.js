const { XMLParser } = require("fast-xml-parser");

const RSS_BASE_URL =
  process.env.EGP_RSS_BASE_URL ||
  "http://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml";

/**
 * Extracts a projectId from an e-GP attachment or project link.
 * Example link: http://.../FPROP9955AttachServ?projectId=61057000335&filename=...
 */
function extractProjectIdFromLink(link = "", description = "") {
  const match = String(link).match(/[?&](?:projectId|pid)=([0-9]{11})/i);
  if (match) return match[1];

  const descMatch = String(description).match(/\b(\d{11})\b/);
  if (descMatch) return descMatch[1];

  return null;
}

/**
 * Fetches and parses procurement announcements from the official e-GP RSS feed.
 *
 * @param {Object} options
 * @param {string} [options.deptId] - 4-digit department code (e.g. '0307')
 * @param {string} [options.deptsubId] - 10-digit sub-dept code
 * @param {string} [options.anounceType] - 'Bo' (Draft TOR), 'Do' (Invitation), 'Wo' (Winner)
 * @param {string} [options.methodId] - Procurement method code (e.g. '16' for e-bidding)
 * @param {string} [options.announceDate] - YYYYMMDD
 * @returns {Promise<Array<{projectId: string, title: string, link: string, pubDate: string, raw: Object}>>}
 */
async function fetchEgpRssAnnouncements(options = {}) {
  const params = new URLSearchParams();

  if (options.deptId) params.append("deptId", options.deptId);
  if (options.deptsubId) params.append("deptsubId", options.deptsubId);
  if (options.anounceType) params.append("anounceType", options.anounceType);
  if (options.methodId) params.append("methodId", options.methodId);
  if (options.announceDate) params.append("announceDate", options.announceDate);

  const queryString = params.toString();
  const url = queryString ? `${RSS_BASE_URL}?${queryString}` : RSS_BASE_URL;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Accept: "application/xml, text/xml, */*",
      "Connection": "close" // This stops the UND_ERR_SOCKET crash
    },
  });

  if (!response.ok) {
    throw new Error(
      `e-GP RSS Request Failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const iconv = require("iconv-lite");

  // 1. Get the raw binary buffer instead of letting fetch guess the text encoding
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // 2. Decode the buffer from Windows-874 to standard UTF-8
  const xmlText = iconv.decode(buffer, "win874");
  
  // 🔴 +++ พ่น Log ออกมาดูให้เห็นกับตา +++ 🔴
  console.log(`\n[DEBUG] URL ที่ยิงไป: ${url}`);
  console.log(`[DEBUG] HTTP Status: ${response.status}`);
  console.log(`[DEBUG] ขนาดข้อมูลดิบที่ได้: ${xmlText.length} ตัวอักษร`);
  console.log(`[DEBUG] ตัวอย่างข้อมูลดิบ 300 ตัวอักษรแรก:\n${xmlText.substring(0, 300)}\n`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });

  const parsed = parser.parse(xmlText);
  const channel = parsed?.rss?.channel || {};
  let items = channel.item || [];

  if (!Array.isArray(items)) {
    items = [items];
  }
  
  console.log(`[DEBUG] จำนวน Item ที่อ่านเจอใน XML: ${items.length} รายการ`);

  const results = [];
  for (const item of items) {
    const link = item.link || "";
    const title = item.title || "";
    const pubDate = item.pubDate || item.pubdate || null;
    const description = item.description || "";
    
    // 🟢 แก้ให้ดึงข้อมูล description ไปด้วยตามโครงสร้างที่ถูกต้อง
    const projectId = extractProjectIdFromLink(link, description);

    if (!projectId && title) {
        console.log(`[DEBUG] ⚠️ ข้ามโครงการ (หาเลข ID 11 หลักไม่เจอ): ${title.substring(0, 50)}...`);
    }

    if (projectId) {
      results.push({
        projectId,
        title,
        link,
        pubDate,
        raw: item,
      });
    }
  }

  return results;
}

module.exports = {
  fetchEgpRssAnnouncements,
  extractProjectIdFromLink,
};