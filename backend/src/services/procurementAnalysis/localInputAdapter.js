/**
 * Adapter สำหรับ pipeline ที่เก็บเอกสารอยู่ใน local filesystem
 *
 * อ่าน manifest ของ priceEstimate, invitation และ draftEbidding แล้วแปลง TXT
 * ให้เป็น in-memory input contract ที่ analysisService ใช้ โดยตรวจ path traversal,
 * UTF-8, label และ coverage ระหว่างทาง
 *
 * ไฟล์นี้ยังดูแล cache จาก analysis.json และบันทึกผลลัพธ์ analysis.json/summary.md
 * แต่ไม่มีกฎวิเคราะห์เอกสาร จึงสามารถเพิ่ม MongoDB adapter แยกต่างหากได้ภายหลัง
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const { normalizeText } = require("./evidenceValidator");
const { formatReadableSummary } = require("./reportWriter");

const MANIFEST_CATEGORIES = ["priceEstimate", "invitation", "draftEbidding"];
const ELIGIBLE_LABELS = new Set([
  "PRICE_ESTIMATE",
  "TOR",
  "BIDDING_NOTICE",
  "DRAFT_NOTICE",
]);
const SOURCE_COVERAGE_WARNING_CODES = new Set([
  "MISSING_MANIFEST",
  "INVALID_MANIFEST",
  "INVALID_MANIFEST_PDFS",
  "UNSUPPORTED_OR_MISSING_LABEL",
  "UNPROCESSED_TXT",
  "UNSAFE_TXT_PATH",
  "MISSING_TXT",
  "UNREADABLE_TXT",
  "EMPTY_TXT",
]);

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * ค้นหา project folder สำหรับ --all-local เฉพาะ directory ที่เป็น project ID 11 หลัก
 * และเรียงแบบ lexicographic ซึ่งให้ผล deterministic เพราะทุก ID ยาวเท่ากัน
 */
async function discoverLocalProjectIds(inputRoot, dependencies = {}) {
  const io = dependencies.fs || fs;
  const root = path.resolve(inputRoot);
  const entries = await io.readdir(root, { withFileTypes: true });
  const projectIds = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d{11}$/.test(entry.name)) continue;
    let hasManifest = false;
    for (const category of MANIFEST_CATEGORIES) {
      try {
        await io.access(path.join(root, entry.name, category, "manifest.json"));
        hasManifest = true;
        break;
      } catch {}
    }
    if (hasManifest) projectIds.push(entry.name);
  }
  return projectIds.sort();
}

async function readLocalProjectInput(options, dependencies = {}) {
  const projectId = String(options && options.projectId ? options.projectId : "").trim();
  if (!/^\d{11}$/.test(projectId)) throw new Error("projectId must contain exactly 11 digits.");
  const io = dependencies.fs || fs;
  const inputRoot = path.resolve(options.inputRoot);
  const documents = [];
  const warnings = [];
  let manifestCount = 0;
  let pdfEntryCount = 0;
  let junkExcludedCount = 0;
  let unavailableTxtCount = 0;
  const categoryCoverage = Object.fromEntries(
    MANIFEST_CATEGORIES.map((category) => [category, { manifestAvailable: false, eligible: 0, unavailable: 0 }])
  );

  for (const category of MANIFEST_CATEGORIES) {
    const manifestPath = path.join(inputRoot, projectId, category, "manifest.json");
    let manifest;
    try {
      manifest = JSON.parse(await io.readFile(manifestPath, "utf8"));
      manifestCount += 1;
      categoryCoverage[category].manifestAvailable = true;
    } catch (error) {
      warnings.push({
        code: error && error.code === "ENOENT" ? "MISSING_MANIFEST" : "INVALID_MANIFEST",
        category,
        manifestPath,
        message: error.message,
      });
      continue;
    }
    if (!Array.isArray(manifest.pdfs)) {
      categoryCoverage[category].unavailable += 1;
      warnings.push({ code: "INVALID_MANIFEST_PDFS", category, manifestPath });
      continue;
    }

    for (const [manifestIndex, entry] of manifest.pdfs.entries()) {
      pdfEntryCount += 1;
      const label = String(entry.label || "").trim().toUpperCase();
      if (label === "JUNK") {
        junkExcludedCount += 1;
        continue;
      }
      if (!ELIGIBLE_LABELS.has(label)) {
        unavailableTxtCount += 1;
        categoryCoverage[category].unavailable += 1;
        warnings.push({ code: "UNSUPPORTED_OR_MISSING_LABEL", category, manifestIndex, label: label || null });
        continue;
      }
      const textRef = String(entry.extractedTextPath || "").trim();
      if (!textRef) {
        unavailableTxtCount += 1;
        categoryCoverage[category].unavailable += 1;
        warnings.push({ code: "UNPROCESSED_TXT", category, manifestIndex, label });
        continue;
      }
      const textPath = path.resolve(inputRoot, textRef.replace(/^pdfs[\\/]/i, ""));
      if (!isWithinRoot(inputRoot, textPath)) {
        unavailableTxtCount += 1;
        categoryCoverage[category].unavailable += 1;
        warnings.push({ code: "UNSAFE_TXT_PATH", category, manifestIndex, textRef });
        continue;
      }
      let text;
      try {
        const bytes = await io.readFile(textPath);
        text = normalizeText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch (error) {
        unavailableTxtCount += 1;
        categoryCoverage[category].unavailable += 1;
        warnings.push({
          code: error && error.code === "ENOENT" ? "MISSING_TXT" : "UNREADABLE_TXT",
          category,
          manifestIndex,
          textRef,
          message: error.message,
        });
        continue;
      }
      if (!text.trim()) {
        unavailableTxtCount += 1;
        categoryCoverage[category].unavailable += 1;
        warnings.push({ code: "EMPTY_TXT", category, manifestIndex, textRef });
        continue;
      }

      categoryCoverage[category].eligible += 1;
      const pdfRef = String(entry.localArtifactPath || entry.artifactRelativePath || "").trim();
      documents.push({
        documentId: `${category}:${textRef}`,
        projectId,
        archiveCategory: category,
        category,
        label,
        text,
        source: {
          textRef,
          pdfRef,
          manifestRef: path.relative(inputRoot, manifestPath).replace(/\\/g, "/"),
        },
        metadata: {
          originalFileName: entry.originalFileName || null,
          pdfSha256: entry.sha256 || null,
          manifestIndex,
          archiveProcessedAt: manifest.processedAt || null,
          sourceZipFileName: manifest.source && manifest.source.zipFileName,
          sourceLocatorIdentity: manifest.source && manifest.source.locatorIdentity,
        },
      });
    }
  }

  return {
    schemaVersion: 1,
    projectId,
    documents,
    coverage: {
      status: warnings.length === 0 ? "complete" : "incomplete",
      manifestCount,
      pdfEntryCount,
      eligibleDocumentCount: documents.length,
      junkExcludedCount,
      unavailableTxtCount,
      categories: categoryCoverage,
      warnings,
    },
  };
}

function isReusableSourceIncompleteResult(result) {
  if (!result || result.status !== "incomplete" || result.coverage && result.coverage.status !== "incomplete") return false;
  const diagnostics = result.diagnostics || {};
  if ((diagnostics.errors || []).length) return false;
  const warnings = diagnostics.warnings || result.coverage && result.coverage.warnings || [];
  if (!warnings.length || warnings.some((warning) => !SOURCE_COVERAGE_WARNING_CODES.has(warning.code))) return false;
  const processing = result.processing || {};
  if (processing.processedRequests !== processing.totalRequests) return false;
  return (processing.documents || []).every((document) =>
    document.processed === true && !(document.errors || []).length
  );
}

async function loadReusableResult(jsonPath, fingerprint, dependencies = {}) {
  const io = dependencies.fs || fs;
  try {
    const result = JSON.parse(await io.readFile(jsonPath, "utf8"));
    if (result.fingerprint !== fingerprint) return null;
    // incomplete ใช้ cache ได้เฉพาะกรณี source ในเครื่องไม่ครบแต่ทุกไฟล์ที่มีอยู่
    // ประมวลผลสำเร็จแล้ว; ผลที่มี Vertex/document errors ต้องประมวลผลใหม่ใน run ถัดไป
    return (result.status === "complete" || isReusableSourceIncompleteResult(result)) ? result : null;
  } catch {
    return null;
  }
}

async function saveProjectOutputs(result, outputDirectory, dependencies = {}) {
  const io = dependencies.fs || fs;
  const overwrite = dependencies.overwrite === true;
  await io.mkdir(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, "analysis.json");
  const summaryPath = path.join(outputDirectory, "summary.md");
  if (!overwrite) {
    for (const outputPath of [jsonPath, summaryPath]) {
      try {
        await io.access(outputPath);
        throw new Error(`Output already exists in ${outputDirectory}; pass --force to overwrite it.`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const flag = overwrite ? "w" : "wx";
  try {
    await io.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag });
    await io.writeFile(summaryPath, formatReadableSummary(result), { encoding: "utf8", flag });
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw new Error(`Output already exists in ${outputDirectory}; pass --force to overwrite it.`);
    }
    throw error;
  }
  return { jsonPath, summaryPath };
}

module.exports = {
  discoverLocalProjectIds,
  isReusableSourceIncompleteResult,
  loadReusableResult,
  readLocalProjectInput,
  saveProjectOutputs,
};
