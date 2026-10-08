const { XMLParser } = require("fast-xml-parser");

const RSS_BASE_URL =
  process.env.EGP_RSS_BASE_URL ||
  "http://process3.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml";

/**
 * Extracts a projectId from an e-GP attachment or project link.
 * Example link: http://.../FPROP9955AttachServ?projectId=61057000335&filename=...
 */
function extractProjectIdFromLink(link = "") {
  if (!link) return null;
  const match = link.match(/[?&]projectId=([0-9a-zA-Z_-]+)/i);
  return match ? match[1] : null;
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
x
  const xmlText = await response.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });

  const parsed = parser.parse(xmlText);
  const channel = parsed?.rss?.channel || {};
  let items = channel.item || [];

  // fast-xml-parser returns an object instead of array if there's only 1 item
  if (!Array.isArray(items)) {
    items = [items];
  }

  const results = [];
  for (const item of items) {
    const link = item.link || "";
    const title = item.title || "";
    const pubDate = item.pubDate || item.pubdate || null;
    const projectId = extractProjectIdFromLink(link);

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