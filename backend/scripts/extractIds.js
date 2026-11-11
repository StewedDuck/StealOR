/**
 * Utility: read projects.json relative to the current working directory and
 * print unique truthy projectId values whose string length is 11, one per line.
 * Length is checked, but numeric-only content is not validated here.
 * This script does not call e-GP or modify MongoDB.
 */
const fs = require("fs");

const rawData = fs.readFileSync("projects.json", "utf-8");
const parsed = JSON.parse(rawData);

// Extract the 11-digit IDs directly from the "data" array
const ids = parsed.data
  .map(item => item.projectId)
  .filter(id => id && String(id).length === 11);

console.log([...new Set(ids)].join("\n"));