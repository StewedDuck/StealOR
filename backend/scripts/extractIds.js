const fs = require("fs");

const rawData = fs.readFileSync("projects.json", "utf-8");
const parsed = JSON.parse(rawData);

// Extract the 11-digit IDs directly from the "data" array
const ids = parsed.data
  .map(item => item.projectId)
  .filter(id => id && String(id).length === 11);

console.log([...new Set(ids)].join("\n"));