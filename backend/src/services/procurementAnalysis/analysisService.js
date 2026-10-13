/**
 * แกนกลางของ procurement analysis ที่ไม่ผูกกับ local filesystem หรือ MongoDB
 *
 * Input คือ projectId, documents และ coverage metadata ที่เตรียมไว้ใน memory
 * Service จะตรวจ input และประมวลผลแต่ละ document ทั้งฉบับผ่าน vertexAnalyzer,
 * ตรวจ candidate ผ่าน evidenceValidator และรวมผลเป็น analysis JSON schema v3
 * ครอบคลุมราคา 2 ช่อง, TOR summary, deadlines, lifecycle, coverage และ diagnostics
 *
 * analyzeProcurementInput คือ public API หลักสำหรับ adapter ปัจจุบันและ MongoDB ในอนาคต
 * computeAnalysisFingerprint ใช้ควบคุม cache จึงต้องคง behavior ให้ตรงกับ prompt/schema/model
 */
const { createHash } = require("node:crypto");
const { getVertexConfig } = require("../../config/vertex");
const { createVertexAIClient } = require("../vertexAIService");
const {
  PRICE_FIELDS,
  TOR_SECTIONS,
  normalizeText,
  supported,
  verifyDeadlineCandidate,
  verifyLifecycleCandidate,
  verifyPriceCandidate,
  verifyTorItem,
} = require("./evidenceValidator");
const {
  CANDIDATE_SCHEMA,
  PROMPT_VERSION,
  requestVertexCandidates,
} = require("./vertexAnalyzer");

// schema v3 removes the unsupported draft public-comment deadline before any
// MongoDB analysis integration exists. The analysis version also changes so
// schema-v2 cache files are never reused.
const ANALYSIS_VERSION = "3.3";

function documentDisplayName(document) {
  const originalName = document.metadata && document.metadata.originalFileName;
  if (String(originalName || "").trim()) return String(originalName).trim();
  const textRef = document.source && document.source.textRef;
  if (String(textRef || "").trim()) return String(textRef).split(/[\\/]/).pop();
  return document.documentId;
}

function aggregateTokenUsage(documentRuns) {
  const usages = documentRuns.map((run) => run.tokenUsage).filter(Boolean);
  if (!usages.length) return null;
  const sum = (name) => {
    const values = usages.map((usage) => usage[name]).filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  return {
    requestsWithUsage: usages.length,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    thoughtsTokens: sum("thoughtsTokens"),
  };
}

function validateProcurementInput(input) {
  if (!input || typeof input !== "object") throw new Error("input is required.");
  if (!String(input.projectId || "").trim()) throw new Error("input.projectId is required.");
  if (!Array.isArray(input.documents)) throw new Error("input.documents must be an array.");
  const seen = new Set();
  for (const [index, document] of input.documents.entries()) {
    if (!document || typeof document !== "object") throw new Error(`documents[${index}] is invalid.`);
    if (!String(document.documentId || "").trim()) throw new Error(`documents[${index}].documentId is required.`);
    if (seen.has(document.documentId)) throw new Error(`Duplicate documentId: ${document.documentId}`);
    seen.add(document.documentId);
    if (!String(document.text || "").trim()) throw new Error(`documents[${index}].text is empty.`);
    if (!String(document.archiveCategory || document.category || "").trim()) {
      throw new Error(`documents[${index}].archiveCategory is required.`);
    }
    if (!String(document.label || "").trim()) throw new Error(`documents[${index}].label is required.`);
  }
}

function candidateDiagnostic(group, candidate, document) {
  return {
    group,
    value: candidate.amount ?? candidate.dateText ?? candidate.textThai ?? candidate.lifecycleCandidate ?? null,
    evidenceStatus: candidate.evidenceStatus,
    interpretationStatus: candidate.interpretationStatus,
    reason: candidate.evidenceStatus === "VERIFIED"
      ? candidate.interpretationReason || null
      : candidate.rejectionReason || candidate.interpretationReason || null,
    documentId: candidate.evidence && candidate.evidence.documentId || document.documentId,
    quote: candidate.quote || null,
  };
}

function candidateTrace(group, rawCandidate, candidate, document) {
  return {
    group,
    documentId: document.documentId,
    accepted: supported(candidate),
    rawCandidate,
    validatedCandidate: candidate,
  };
}

function resolvePriceField(fieldName, candidates, processingComplete, priceCoverageComplete) {
  const accepted = candidates.filter(supported);
  if (!priceCoverageComplete) {
    return { status: "error", amount: null, currency: null, originalAmountText: null, evidence: [], conflicts: [], limitation: "priceEstimate input coverage is unavailable or incomplete" };
  }
  if (!processingComplete) {
    return { status: "error", amount: null, currency: null, originalAmountText: null, evidence: [], conflicts: [], limitation: "priceEstimate Vertex processing did not complete" };
  }
  const byValue = new Map();
  for (const candidate of accepted) {
    const key = `${candidate.amount}|${candidate.currency || ""}`;
    if (!byValue.has(key)) byValue.set(key, []);
    byValue.get(key).push(candidate);
  }
  if (!byValue.size) return { status: "not_found", amount: null, currency: null, originalAmountText: null, evidence: [], conflicts: [] };
  if (byValue.size > 1) {
    return {
      status: "ambiguous",
      amount: null,
      currency: null,
      originalAmountText: null,
      evidence: [],
      conflicts: [...byValue.values()].map((items) => ({
        amount: items[0].amount,
        currency: items[0].currency,
        evidence: items.map((item) => item.evidence),
      })),
    };
  }
  const items = [...byValue.values()][0];
  return {
    status: "found",
    amount: items[0].amount,
    currency: items[0].currency,
    originalAmountText: items[0].originalThaiText || items[0].amountText,
    evidence: items.map((item) => item.evidence),
    conflicts: [],
  };
}

function resolveDeadline(groupName, candidates, processingComplete) {
  const accepted = candidates.filter(supported);
  const byValue = new Map();
  for (const candidate of accepted) {
    const key = `${candidate.normalizedDate}|${candidate.submissionWindow.end || ""}`;
    if (!byValue.has(key)) byValue.set(key, []);
    byValue.get(key).push(candidate);
  }
  if (!byValue.size) {
    const empty = {
      originalDateText: null,
      originalTimeText: null,
      normalizedDate: null,
      submissionWindow: { start: null, end: null },
      closingDateTime: null,
      timezone: null,
      evidence: [],
      conflicts: [],
      event: groupName,
    };
    return processingComplete
      ? { status: "not_found", coverageStatus: "complete", ...empty }
      : { status: "error", coverageStatus: "incomplete", ...empty, limitation: "input coverage or Vertex processing is incomplete" };
  }
  if (byValue.size > 1) {
    return {
      status: "ambiguous",
      originalDateText: null,
      originalTimeText: null,
      normalizedDate: null,
      submissionWindow: { start: null, end: null },
      closingDateTime: null,
      timezone: null,
      coverageStatus: processingComplete ? "complete" : "incomplete",
      evidence: [],
      conflicts: [...byValue.values()].map((items) => ({
        normalizedDate: items[0].normalizedDate,
        submissionWindow: items[0].submissionWindow,
        evidence: items.map((item) => item.evidence),
      })),
      event: groupName,
    };
  }
  const items = [...byValue.values()][0];
  return {
    status: "found",
    coverageStatus: processingComplete ? "complete" : "incomplete",
    originalDateText: items[0].dateText,
    originalTimeText: items[0].timeText,
    normalizedDate: items[0].normalizedDate,
    submissionWindow: items[0].submissionWindow,
    closingDateTime: items[0].closingDateTime,
    timezone: items[0].timezone,
    evidence: items.map((item) => item.evidence),
    conflicts: [],
    event: groupName,
  };
}

function normalizeSummaryKey(value) {
  const thai = "๐๑๒๓๔๕๖๗๘๙";
  return String(value || "")
    .replace(/[๐-๙]/g, (digit) => String(thai.indexOf(digit)))
    .toLowerCase()
    .replace(/[\s.,;:()\-–—"'“”]+/g, "");
}

function summaryDedupKey(value, section) {
  const normalized = normalizeSummaryKey(value);
  const rules = [
    [/ลงทะเบียน.*(?:egp|จัดซื้อจัดจ้างภาครัฐ)/, "egp-registration"],
    [/หนังสือรับรอง.*ตัวแทน.*บำรุงรักษา/, "maintenance-authorization"],
    [/ผู้จัดการโครงการ/, "project-manager"],
    [/มูลค่าสุทธิ.*เป็นบวก/, "positive-net-worth"],
    [/ทุนจดทะเบียน.*(?:2|๒)ล้าน/, "registered-capital"],
    [/ผลประโยชน์ร่วมกัน/, "conflict-of-interest"],
    [/correctivemaintenance.*preventivemaintenance|preventivemaintenance.*correctivemaintenance/, "maintenance-scope"],
    [/oracleoda.*nutanix.*juniper/, "hardware-inventory"],
    [/รายงาน.*ตรวจเช็คระบบ/, "maintenance-report"],
  ];
  for (const [pattern, key] of rules) if (pattern.test(normalized)) return `${section}:${key}`;
  return `${section}:${normalized}`;
}

function conflictSkeleton(value) {
  return normalizeSummaryKey(value).replace(/\d+(?:\.\d+)?/g, "#");
}

function makeSummaryItems(candidates, section) {
  const accepted = candidates.filter((candidate) => supported(candidate) && candidate.section === section);
  const deduplicated = new Map();
  for (const candidate of accepted) {
    const key = summaryDedupKey(candidate.textThai, section);
    if (!deduplicated.has(key)) {
      deduplicated.set(key, { text: candidate.textThai.trim(), evidence: [], conflictStatus: "none" });
    }
    deduplicated.get(key).evidence.push(candidate.evidence);
  }
  const items = [...deduplicated.values()];
  const skeletons = new Map();
  for (const item of items) {
    const key = conflictSkeleton(item.text);
    if (!skeletons.has(key)) skeletons.set(key, []);
    skeletons.get(key).push(item);
  }
  for (const group of skeletons.values()) {
    if (group.length > 1) for (const item of group) item.conflictStatus = "review_required";
  }
  return items;
}

function sectionResult(items) {
  return { status: items.length ? "found" : "unavailable", items };
}

function buildTorSummary(candidates, processingComplete) {
  const projectItems = makeSummaryItems(candidates, "project_details");
  const objectives = makeSummaryItems(candidates, "objective");
  const scope = makeSummaryItems(candidates, "scope_of_work");
  const general = makeSummaryItems(candidates, "qualification_general");
  const projectSpecific = makeSummaryItems(candidates, "qualification_project_specific");
  const technical = makeSummaryItems(candidates, "technical_requirement");
  const deliverables = makeSummaryItems(candidates, "deliverable");
  const all = [projectItems, objectives, scope, general, projectSpecific, technical, deliverables].flat();
  const unavailableSections = [];
  if (!projectItems.length) unavailableSections.push("projectDetails");
  if (!objectives.length) unavailableSections.push("objectives");
  if (!scope.length) unavailableSections.push("scopeOfWork");
  if (!general.length && !projectSpecific.length) unavailableSections.push("contractorQualifications");
  if (!technical.length) unavailableSections.push("technicalRequirements");
  if (!deliverables.length) unavailableSections.push("deliverables");
  return {
    status: all.length ? "found" : processingComplete ? "not_found" : "error",
    coverageStatus: processingComplete ? "complete" : "incomplete",
    sections: {
      projectDetails: {
        status: projectItems.length ? "found" : "unavailable",
        text: projectItems.length ? projectItems.map((item) => item.text).join(" ") : null,
        evidence: projectItems.flatMap((item) => item.evidence),
      },
      objectives: sectionResult(objectives),
      scopeOfWork: sectionResult(scope),
      contractorQualifications: {
        status: general.length || projectSpecific.length ? "found" : "unavailable",
        generalLegal: general,
        projectSpecific,
      },
      technicalRequirements: sectionResult(technical),
      deliverables: sectionResult(deliverables),
    },
    conflicts: all.filter((item) => item.conflictStatus === "review_required"),
    unavailableSections,
  };
}

function resolveDocumentAssessment(candidates, processingComplete) {
  const accepted = candidates.filter(supported);
  if (!accepted.length && !processingComplete) {
    return { status: "error", coverageStatus: "incomplete", lifecycleAssessment: "unknown", draft: "unknown", invitation: "unknown", latestOfficialRevision: null, evidence: [] };
  }
  const hasDraft = accepted.some((candidate) => candidate.lifecycleCandidate === "draft");
  const hasInvitation = accepted.some((candidate) => candidate.lifecycleCandidate === "invitation");
  return {
    status: accepted.length ? "found" : "not_found",
    coverageStatus: processingComplete ? "complete" : "incomplete",
    lifecycleAssessment: hasDraft && hasInvitation ? "conflict" : hasDraft ? "draft" : hasInvitation ? "invitation" : "unknown",
    draft: hasDraft ? "available" : "not_verified",
    invitation: hasInvitation ? "available" : "not_verified",
    latestOfficialRevision: null,
    evidence: accepted.map((candidate) => ({ lifecycle: candidate.lifecycleCandidate, evidence: candidate.evidence })),
  };
}

function coverageFingerprint(coverage) {
  if (!coverage) return null;
  const categories = Object.fromEntries(
    Object.entries(coverage.categories || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, value]) => [category, {
        manifestAvailable: Boolean(value && value.manifestAvailable),
        eligible: Number(value && value.eligible || 0),
        unavailable: Number(value && value.unavailable || 0),
      }])
  );
  const warnings = (coverage.warnings || [])
    .map((warning) => ({
      code: warning.code || null,
      category: warning.category || null,
      manifestIndex: warning.manifestIndex == null ? null : warning.manifestIndex,
      label: warning.label || null,
      textRef: warning.textRef || null,
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    status: coverage.status || null,
    manifestCount: Number(coverage.manifestCount || 0),
    pdfEntryCount: Number(coverage.pdfEntryCount || 0),
    eligibleDocumentCount: Number(coverage.eligibleDocumentCount || 0),
    junkExcludedCount: Number(coverage.junkExcludedCount || 0),
    unavailableTxtCount: Number(coverage.unavailableTxtCount || 0),
    categories,
    warnings,
  };
}

function computeAnalysisFingerprint(input, config) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ analysisVersion: ANALYSIS_VERSION, promptVersion: PROMPT_VERSION, schema: CANDIDATE_SCHEMA, model: config.model, location: config.location }));
  // coverage ต้องอยู่ใน fingerprint เพื่อให้ cache incomplete ถูกยกเลิกทันที
  // เมื่อ manifest/TXT ที่เคยหายถูกเพิ่มหรือแก้ไข โดยไม่ hash absolute path หรือ OS error text
  hash.update(JSON.stringify(coverageFingerprint(input.coverage)));
  for (const document of [...input.documents].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
    hash.update(JSON.stringify({ documentId: document.documentId, archiveCategory: document.archiveCategory || document.category, label: document.label, source: document.source, metadata: document.metadata }));
    hash.update(normalizeText(document.text));
  }
  return hash.digest("hex");
}

async function analyzeProcurementInput(input, options = {}) {
  validateProcurementInput(input);
  const now = options.now || Date.now;
  const projectStartedAtMs = now();
  const config = options.config || getVertexConfig();
  const client = options.client || createVertexAIClient(config);
  const notify = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const collections = {
    referencePriceEstimate: [], allocatedBudget: [], torSummaryItems: [],
    biddingClosingDate: [], documentAssessment: [],
  };
  const rejectedCandidates = [];
  // เก็บทั้ง raw และ validated candidate เพื่อ debug ได้จาก analysis.json
  // โดยไม่ต้องเรียก Gemini ซ้ำ และยังคง rejectedCandidates สำหรับ consumer เดิม
  const candidateDiagnostics = [];
  const modelWarnings = [];
  const errors = [];
  const documentRuns = [];
  const totalRequests = input.documents.length;
  let attemptedRequests = 0;
  let processedRequests = 0;

  for (const [documentIndex, document] of input.documents.entries()) {
    const run = {
      documentId: document.documentId,
      documentName: documentDisplayName(document),
      archiveCategory: document.archiveCategory || document.category,
      label: document.label,
      source: document.source,
      characterCount: normalizeText(document.text).length,
      requestCount: 0,
      requestStartedAt: null,
      requestCompletedAt: null,
      geminiApiLatencyMs: null,
      tokenUsage: null,
      processed: false,
      errors: [],
    };
    documentRuns.push(run);
    notify({ phase: "queued", documentId: document.documentId, documentName: run.documentName, archiveCategory: run.archiveCategory, request: documentIndex + 1, totalRequests, processedRequests });
    try {
      const response = await requestVertexCandidates(client, config, document, {
        beforeRequest: options.beforeVertexRequest,
        now,
        onRequestComplete: (diagnostics) => {
          run.requestCount = 1;
          run.requestStartedAt = diagnostics.requestStartedAt;
          run.requestCompletedAt = diagnostics.requestCompletedAt;
          run.geminiApiLatencyMs = diagnostics.geminiApiLatencyMs;
          run.tokenUsage = diagnostics.tokenUsage;
          attemptedRequests += 1;
          notify({
            phase: "completed",
            documentId: document.documentId,
            documentName: run.documentName,
            archiveCategory: run.archiveCategory,
            request: documentIndex + 1,
            totalRequests,
            requestStartedAt: diagnostics.requestStartedAt,
            requestCompletedAt: diagnostics.requestCompletedAt,
            geminiApiLatencyMs: diagnostics.geminiApiLatencyMs,
            tokenUsage: diagnostics.tokenUsage,
            outcome: diagnostics.outcome,
          });
        },
      });
      for (const fieldName of PRICE_FIELDS) {
        for (const raw of response[fieldName]) {
          const candidate = verifyPriceCandidate(document, fieldName, raw);
          collections[fieldName].push(candidate);
          candidateDiagnostics.push(candidateTrace(fieldName, raw, candidate, document));
          if (!supported(candidate)) rejectedCandidates.push(candidateDiagnostic(fieldName, candidate, document));
        }
      }
      for (const raw of response.torSummaryItems) {
        const candidate = verifyTorItem(document, raw);
        collections.torSummaryItems.push(candidate);
        candidateDiagnostics.push(candidateTrace("torSummary", raw, candidate, document));
        if (!supported(candidate)) rejectedCandidates.push(candidateDiagnostic("torSummary", candidate, document));
      }
      for (const raw of response.biddingClosingDate) {
        const candidate = verifyDeadlineCandidate(document, "biddingClosingDate", raw);
        collections.biddingClosingDate.push(candidate);
        candidateDiagnostics.push(candidateTrace("biddingClosingDate", raw, candidate, document));
        if (!supported(candidate)) rejectedCandidates.push(candidateDiagnostic("biddingClosingDate", candidate, document));
      }
      for (const raw of response.documentAssessment) {
        const candidate = verifyLifecycleCandidate(document, raw);
        collections.documentAssessment.push(candidate);
        candidateDiagnostics.push(candidateTrace("documentAssessment", raw, candidate, document));
        if (!supported(candidate)) rejectedCandidates.push(candidateDiagnostic("documentAssessment", candidate, document));
      }
      modelWarnings.push(...response.warnings.map((message) => ({ documentId: document.documentId, message })));
      run.processed = true;
      processedRequests += 1;
    } catch (error) {
      const detail = {
        documentId: document.documentId,
        code: String(error.code || error.status || "VERTEX_DOCUMENT_PROCESSING_ERROR"),
        message: error.message,
      };
      run.errors.push(detail);
      errors.push(detail);
    }
  }

  const coverageComplete = !input.coverage || input.coverage.status === "complete";
  const vertexProcessingComplete = errors.length === 0 && processedRequests === totalRequests;
  const processingComplete = coverageComplete && vertexProcessingComplete;
  const priceDocuments = input.documents.filter((document) => (document.archiveCategory || document.category) === "priceEstimate" && document.label !== "JUNK");
  const priceRuns = documentRuns.filter((run) => run.archiveCategory === "priceEstimate");
  const categoryCoverage = input.coverage && input.coverage.categories && input.coverage.categories.priceEstimate;
  const priceCoverageComplete = Boolean(priceDocuments.length) && (!categoryCoverage || (categoryCoverage.manifestAvailable && categoryCoverage.unavailable === 0));
  const priceProcessingComplete = priceCoverageComplete && priceRuns.every((run) => run.errors.length === 0 && run.processed);
  const prices = {
    referencePriceEstimate: resolvePriceField("referencePriceEstimate", collections.referencePriceEstimate, priceProcessingComplete, priceCoverageComplete),
    allocatedBudget: resolvePriceField("allocatedBudget", collections.allocatedBudget, priceProcessingComplete, priceCoverageComplete),
  };
  const deadlines = {
    biddingClosingDate: resolveDeadline("biddingClosingDate", collections.biddingClosingDate, processingComplete),
  };
  const torSummary = buildTorSummary(collections.torSummaryItems, processingComplete);
  const documentAssessment = resolveDocumentAssessment(collections.documentAssessment, processingComplete);
  const unresolvedCandidates = [];
  for (const [name, result] of [...Object.entries(prices), ...Object.entries(deadlines)]) {
    if (result.status === "ambiguous") unresolvedCandidates.push({ group: name, conflicts: result.conflicts });
  }
  const fingerprint = computeAnalysisFingerprint(input, config);
  const projectCompletedAtMs = now();

  return {
    schemaVersion: 3,
    analysisVersion: ANALYSIS_VERSION,
    promptVersion: PROMPT_VERSION,
    projectId: input.projectId,
    generatedAt: new Date(projectCompletedAtMs).toISOString(),
    fingerprint,
    model: { provider: "vertex-ai", name: config.model, location: config.location },
    status: errors.length ? "error" : processingComplete ? "complete" : "incomplete",
    coverage: input.coverage || { status: "complete", warnings: [] },
    processing: {
      documentCount: input.documents.length,
      totalRequests,
      attemptedRequests,
      processedRequests,
      startedAt: new Date(projectStartedAtMs).toISOString(),
      completedAt: new Date(projectCompletedAtMs).toISOString(),
      elapsedMs: Math.max(0, projectCompletedAtMs - projectStartedAtMs),
      tokenUsage: aggregateTokenUsage(documentRuns),
      complete: processingComplete,
      documents: documentRuns,
    },
    prices,
    torSummary,
    deadlines,
    documentAssessment,
    diagnostics: { candidateDiagnostics, rejectedCandidates, unresolvedCandidates, modelWarnings, warnings: input.coverage && input.coverage.warnings || [], errors },
    limitations: [
      "Prices are intentionally limited to valid non-JUNK TXT documents from the priceEstimate archive.",
      "A verified quotation and RULE_SUPPORTED interpretation still require human review before production use.",
      "Dates available only in e-GP metadata or unavailable upstream documents cannot be discovered here.",
      "The available manifests do not establish an authoritative latest procurement revision.",
    ],
  };
}

module.exports = {
  ANALYSIS_VERSION,
  analyzeProcurementInput,
  buildTorSummary,
  computeAnalysisFingerprint,
  coverageFingerprint,
  resolveDeadline,
  resolveDocumentAssessment,
  resolvePriceField,
  validateProcurementInput,
};
