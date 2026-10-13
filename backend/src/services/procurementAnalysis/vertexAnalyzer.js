/**
 * ส่วนติดต่อ Vertex AI / Gemini ของ procurement analysis
 *
 * รับ document ที่อยู่ใน memory ทั้งฉบับ, สร้าง prompt หนึ่งชุดต่อ document,
 * เรียก Gemini ครั้งเดียว และแปลง JSON response ให้มี array ที่ระบบคาดหวังครบทุก field
 *
 * ไฟล์นี้ไม่ตัดสินว่าหลักฐานถูกต้องหรือไม่ และไม่รวมผลระดับโครงการ;
 * การตรวจหลักฐานอยู่ใน evidenceValidator และการรวมผลอยู่ใน analysisService
 * ห้ามแก้ prompt/schema โดยไม่พิจารณา PROMPT_VERSION และ cache fingerprint
 */
const { TOR_SECTIONS, normalizeText } = require("./evidenceValidator");

const PROMPT_VERSION = "2026-10-12.5";
const DEFAULT_REQUEST_DELAY_MS = 1_500;
// Large whole-document TOR responses have exceeded both 16,384 and 32,768
// tokens and ended mid-JSON. Use Gemini 2.5 Flash's documented maximum while
// preserving the one-document/one-request design.
const MAX_OUTPUT_TOKENS = 65_536;
// Gemini thinking tokens count against maxOutputTokens. Leaving the budget on
// automatic allowed a long TOR to consume 15,727 thinking tokens and truncate
// its visible JSON. Keep enough reasoning for classification while reserving
// most of the response budget for schema-compliant JSON.
const THINKING_BUDGET_TOKENS = 2_048;

const MONEY_CANDIDATE = {
  type: "OBJECT",
  properties: {
    amountText: { type: "STRING" },
    currencyText: { type: "STRING" },
    originalThaiText: { type: "STRING" },
    quote: { type: "STRING" },
  },
  required: ["amountText", "currencyText", "originalThaiText", "quote"],
};

const DEADLINE_CANDIDATE = {
  type: "OBJECT",
  properties: {
    dateText: { type: "STRING" },
    timeText: { type: "STRING" },
    quote: { type: "STRING" },
    reason: { type: "STRING" },
  },
  required: ["dateText", "timeText", "quote", "reason"],
};

const CANDIDATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    referencePriceEstimate: {
      type: "ARRAY",
      maxItems: 3,
      items: MONEY_CANDIDATE,
    },
    allocatedBudget: {
      type: "ARRAY",
      maxItems: 3,
      items: MONEY_CANDIDATE,
    },
    torSummaryItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          section: { type: "STRING", enum: TOR_SECTIONS },
          textThai: { type: "STRING" },
          quote: { type: "STRING" },
        },
        required: ["section", "textThai", "quote"],
      },
    },
    biddingClosingDate: {
      type: "ARRAY",
      maxItems: 3,
      items: DEADLINE_CANDIDATE,
    },
    documentAssessment: {
      type: "ARRAY",
      maxItems: 2,
      items: {
        type: "OBJECT",
        properties: {
          lifecycleCandidate: {
            type: "STRING",
            enum: ["draft", "invitation", "unknown", "conflict"],
          },
          reason: { type: "STRING" },
          quote: { type: "STRING" },
        },
        required: ["lifecycleCandidate", "reason", "quote"],
      },
    },
    warnings: { type: "ARRAY", maxItems: 5, items: { type: "STRING" } },
  },
  required: [
    "referencePriceEstimate",
    "allocatedBudget",
    "torSummaryItems",
    "biddingClosingDate",
    "documentAssessment",
    "warnings",
  ],
};

function buildPrompt(document) {
  const priceEligible = document.archiveCategory === "priceEstimate" && document.label !== "JUNK";
  const torEligible = ["TOR", "BIDDING_NOTICE", "DRAFT_NOTICE"].includes(document.label);
  return [
    "Analyze this Thai government procurement document and return only schema-compliant JSON. The source TEXT may be written in Thai, English, or both.",
    "Every quotation must be a short, continuous, verbatim excerpt from TEXT, preserving line breaks, spaces, digits, and punctuation.",
    "QUOTATION LANGUAGE: Copy every quote in its original source language. Never translate, paraphrase, or rewrite an English quote into Thai. English verbatim evidence is valid and expected when TEXT is English.",
    "Never invent missing values or complete blank placeholders.",
    priceEligible
      ? "PRICE SCOPE: This is an eligible priceEstimate archive document. Extract referencePriceEstimate only for ราคากลาง/ราคาอ้างอิง and allocatedBudget only for วงเงินงบประมาณที่ได้รับจัดสรร. Keep them separate."
      : "PRICE SCOPE: This is not in the priceEstimate archive. Return empty arrays for referencePriceEstimate and allocatedBudget even if prices appear.",
    torEligible
      ? "TOR SUMMARY: Write textThai as concise Thai contractor-facing facts, but keep quote verbatim in the original TEXT language. Use project_details, objective, scope_of_work, qualification_general, qualification_project_specific, technical_requirement, or deliverable. Return every distinct material fact supported by the document, cover every section supported by evidence, and avoid duplicates."
      : "TOR SUMMARY: This label is not eligible for TOR-summary facts. Return an empty torSummaryItems array.",
    "DEADLINE: biddingClosingDate is only the final bid/proposal submission deadline.",
    "Never classify a draft public-comment deadline, publication, bid-opening, download, signing, delivery, or completion date as biddingClosingDate.",
    "DOCUMENT LIFECYCLE: draft requires textual draft evidence; invitation requires invitation/final bidding-document evidence. Do not infer lifecycle from archive category or supplied label alone.",
    "Prefer quotations of at most 300 characters. Empty arrays are correct when evidence is absent.",
    "",
    `PROJECT_ID: ${document.projectId}`,
    `DOCUMENT_ID: ${document.documentId}`,
    `ARCHIVE_CATEGORY: ${document.archiveCategory}`,
    `LABEL: ${document.label}`,
    `DOCUMENT_CHARACTER_COUNT: ${normalizeText(document.text).length}`,
    "TEXT:",
    normalizeText(document.text),
  ].join("\n");
}

/**
 * สร้างตัวควบคุม request ที่ใช้ร่วมกันทั้ง batch
 * request แรกไม่รอ ส่วน request ของ document ถัดไปจะรอตาม delayMs
 * การนับเกิดก่อนเรียก Vertex จริง จึงใช้รายงานต้นทุนและ quota ได้ตรงกับจำนวน request
 */
function createVertexRequestScheduler(options = {}) {
  const delayMs = options.delayMs == null ? DEFAULT_REQUEST_DELAY_MS : options.delayMs;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let requestCount = 0;
  return {
    async beforeRequest() {
      if (requestCount > 0 && delayMs > 0) await sleep(delayMs);
      requestCount += 1;
    },
    getRequestCount() {
      return requestCount;
    },
  };
}

function extractTokenUsage(response) {
  const usage = response && response.usageMetadata;
  if (!usage || typeof usage !== "object") return null;
  const value = (...names) => {
    for (const name of names) {
      if (Number.isFinite(usage[name])) return usage[name];
    }
    return null;
  };
  return {
    inputTokens: value("promptTokenCount", "inputTokenCount"),
    outputTokens: value("candidatesTokenCount", "outputTokenCount"),
    totalTokens: value("totalTokenCount"),
    cachedInputTokens: value("cachedContentTokenCount"),
    thoughtsTokens: value("thoughtsTokenCount"),
  };
}

async function requestVertexCandidates(client, config, document, options = {}) {
  const basePrompt = buildPrompt(document);
  const now = options.now || Date.now;
  const generate = async (contents) => {
    if (typeof options.beforeRequest === "function") await options.beforeRequest();
    const startedAtMs = now();
    let response;
    let requestError;
    try {
      response = await client.models.generateContent({
        model: config.model,
        contents,
        config: {
          candidateCount: 1,
          temperature: 0,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingBudget: THINKING_BUDGET_TOKENS },
          responseMimeType: "application/json",
          responseSchema: CANDIDATE_SCHEMA,
        },
      });
      return response;
    } catch (error) {
      requestError = error;
      throw error;
    } finally {
      const completedAtMs = now();
      const diagnostics = {
        requestStartedAt: new Date(startedAtMs).toISOString(),
        requestCompletedAt: new Date(completedAtMs).toISOString(),
        geminiApiLatencyMs: Math.max(0, completedAtMs - startedAtMs),
        tokenUsage: extractTokenUsage(response),
        outcome: requestError ? "api_error" : "api_success",
      };
      if (requestError) requestError.vertexRequestDiagnostics = diagnostics;
      if (typeof options.onRequestComplete === "function") options.onRequestComplete(diagnostics);
    }
  };
  const response = await generate(basePrompt);
  const text = String(response && response.text ? response.text : "").trim();
  if (!text) {
    const error = new Error("Vertex AI returned an empty response.");
    error.code = "EMPTY_VERTEX_RESPONSE";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    error.message = `Vertex returned invalid JSON: ${error.message}`;
    error.code = "INVALID_VERTEX_JSON";
    throw error;
  }
  for (const key of [
    "referencePriceEstimate",
    "allocatedBudget",
    "torSummaryItems",
    "biddingClosingDate",
    "documentAssessment",
    "warnings",
  ]) {
    if (!Array.isArray(parsed[key])) parsed[key] = [];
  }
  return parsed;
}

module.exports = {
  CANDIDATE_SCHEMA,
  DEFAULT_REQUEST_DELAY_MS,
  MAX_OUTPUT_TOKENS,
  PROMPT_VERSION,
  THINKING_BUDGET_TOKENS,
  buildPrompt,
  createVertexRequestScheduler,
  extractTokenUsage,
  requestVertexCandidates,
};
