const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  analyzeProcurementInput,
  computeAnalysisFingerprint,
  coverageFingerprint,
  resolveDeadline,
  resolvePriceField,
} = require("../src/services/procurementAnalysis/analysisService");
const {
  parseMoney,
  parseThaiDate,
  verifyDeadlineCandidate,
  verifyPriceCandidate,
  verifyTorItem,
  verifyWithRecovery,
} = require("../src/services/procurementAnalysis/evidenceValidator");
const {
  discoverLocalProjectIds,
  isReusableSourceIncompleteResult,
  loadReusableResult,
  readLocalProjectInput,
  saveProjectOutputs,
} = require("../src/services/procurementAnalysis/localInputAdapter");
const { formatReadableSummary } = require("../src/services/procurementAnalysis/reportWriter");
const { validateAnalysisForImport } = require("../src/services/procurementAnalysis/analysisValidation");
const {
  CANDIDATE_SCHEMA,
  MAX_OUTPUT_TOKENS,
  THINKING_BUDGET_TOKENS,
  buildPrompt,
  createVertexRequestScheduler,
  extractTokenUsage,
  requestVertexCandidates,
} = require("../src/services/procurementAnalysis/vertexAnalyzer");
const {
  formatAnalysisProgress,
  helpText,
  main,
  parseCliArgs,
  runProject,
} = require("../scripts/analyzeProcurementTexts");

const PROJECT_ID = "67049068372";
const CONFIG = { project: "test", location: "global", model: "test-model" };

function response(overrides = {}) {
  return {
    referencePriceEstimate: [],
    allocatedBudget: [],
    torSummaryItems: [],
    biddingClosingDate: [],
    documentAssessment: [],
    warnings: [],
    ...overrides,
  };
}

function fakeClient(responder) {
  return { models: { generateContent: async (request) => ({ text: JSON.stringify(await responder(request)) }) } };
}

function document(overrides = {}) {
  return {
    documentId: "price:one",
    projectId: PROJECT_ID,
    archiveCategory: "priceEstimate",
    category: "priceEstimate",
    label: "PRICE_ESTIMATE",
    text: "๓. วงเงินงบประมาณที่ได้รับจัดสรร ๕,๒๐๑,๔๐๐ บาท\n๔. ราคากลาง (ราคาอ้างอิง)\nเป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท",
    source: { textRef: "price/pB0.txt", pdfRef: "price/pB0.pdf", manifestRef: "price/manifest.json" },
    metadata: {},
    ...overrides,
  };
}

async function writeLocalProject(inputRoot, projectId, options = {}) {
  const documentCategory = options.category || null;
  for (const category of ["priceEstimate", "invitation", "draftEbidding"]) {
    const directory = path.join(inputRoot, projectId, category);
    await fs.mkdir(path.join(directory, "files"), { recursive: true });
    const pdfs = category === documentCategory
      ? [{
        label: options.label || "TOR",
        extractedTextPath: `pdfs/${projectId}/${category}/files/source.txt`,
        localArtifactPath: `pdfs/${projectId}/${category}/files/source.pdf`,
      }]
      : [];
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ category, pdfs }));
    if (pdfs.length) await fs.writeFile(path.join(directory, "files", "source.txt"), options.text || "ข้อความทดสอบ");
  }
}

test("local adapter retains archive category and reports category-specific coverage", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-v2-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  for (const category of ["priceEstimate", "invitation", "draftEbidding"]) {
    await fs.mkdir(path.join(inputRoot, PROJECT_ID, category, "files"), { recursive: true });
    const pdfs = category === "priceEstimate"
      ? [{ label: "PRICE_ESTIMATE", extractedTextPath: `pdfs/${PROJECT_ID}/${category}/files/pB0.txt`, localArtifactPath: `pdfs/${PROJECT_ID}/${category}/files/pB0.pdf` }]
      : [];
    await fs.writeFile(path.join(inputRoot, PROJECT_ID, category, "manifest.json"), JSON.stringify({ category, pdfs }));
  }
  await fs.writeFile(path.join(inputRoot, PROJECT_ID, "priceEstimate", "files", "pB0.txt"), "ราคากลาง ๑๐๐ บาท");
  const input = await readLocalProjectInput({ projectId: PROJECT_ID, inputRoot });
  assert.equal(input.documents.length, 1);
  assert.equal(input.documents[0].archiveCategory, "priceEstimate");
  assert.equal(input.coverage.categories.priceEstimate.eligible, 1);
  assert.equal(input.coverage.status, "complete");
});

test("manifest selection keeps supported TXT labels and excludes JUNK and unsupported labels", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-selection-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  const labels = ["PRICE_ESTIMATE", "TOR", "BIDDING_NOTICE", "DRAFT_NOTICE", "JUNK", "OTHER"];
  for (const category of ["priceEstimate", "invitation", "draftEbidding"]) {
    const directory = path.join(inputRoot, PROJECT_ID, category);
    await fs.mkdir(path.join(directory, "files"), { recursive: true });
    const pdfs = category === "invitation"
      ? labels.map((label, index) => ({
        label,
        extractedTextPath: `pdfs/${PROJECT_ID}/${category}/files/${index}.txt`,
      }))
      : [];
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify({ category, pdfs }));
    for (let index = 0; index < 4 && category === "invitation"; index += 1) {
      await fs.writeFile(path.join(directory, "files", `${index}.txt`), `เอกสาร ${labels[index]}`);
    }
  }
  const input = await readLocalProjectInput({ projectId: PROJECT_ID, inputRoot });
  assert.deepEqual(input.documents.map((item) => item.label), labels.slice(0, 4));
  assert.equal(input.coverage.junkExcludedCount, 1);
  assert.equal(input.coverage.unavailableTxtCount, 1);
  assert.ok(input.coverage.warnings.some((warning) => warning.code === "UNSUPPORTED_OR_MISSING_LABEL"));
});

test("whole-document prompt contains the complete TXT without chunk metadata", () => {
  const text = `${"ก".repeat(160_000)}จุดสิ้นสุดเอกสาร`;
  const prompt = buildPrompt(document({ text }));
  assert.match(prompt, /DOCUMENT_CHARACTER_COUNT: 160016/);
  assert.ok(prompt.endsWith(text));
  assert.doesNotMatch(prompt, /CHUNK:|DOCUMENT_OFFSETS:/);
});

test("Thai monetary values and Buddhist Era dates normalize deterministically", () => {
  assert.equal(parseMoney("๓,๕๗๕,๐๘๑.๘๖ บาท"), 3575081.86);
  assert.equal(parseMoney("5,201,400 THB"), 5201400);
  assert.equal(parseMoney("๙.๙๙๒,๕๕๐.00 บาท"), 9992550);
  assert.equal(parseMoney("๙.๙๙๒,๖๐๐.๐๐ บาท"), 9992600);
  assert.equal(parseThaiDate("๒๓ พฤษภาคม ๒๕๖๗"), "2024-05-23");
  assert.equal(parseThaiDate("31 กุมภาพันธ์ 2567"), null);
});

test("mixed-separator prices require the complete amount to occur in evidence", () => {
  const source = document({
    text: "ราคากลาง (ราคาอ้างอิง) เป็นเงิน ๙.๙๙๒,๕๕๐.00 บาท",
  });
  const complete = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "๙.๙๙๒,๕๕๐.00",
    currencyText: "บาท",
    originalThaiText: "๙.๙๙๒,๕๕๐.00 บาท",
    quote: source.text,
  });
  assert.equal(complete.amount, 9992550);
  assert.equal(complete.interpretationStatus, "RULE_SUPPORTED");

  const truncated = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "9.99",
    currencyText: "บาท",
    originalThaiText: "9.99 บาท",
    quote: source.text,
  });
  assert.equal(truncated.amount, 9.99);
  assert.equal(truncated.interpretationStatus, "REJECTED");
});

test("price fields require their own wording and the priceEstimate archive", () => {
  const source = document();
  const reference = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "๓,๕๗๕,๐๘๑.๘๖",
    currencyText: "บาท",
    originalThaiText: "๓,๕๗๕,๐๘๑.๘๖ บาท",
    quote: "๔. ราคากลาง (ราคาอ้างอิง)\nเป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท",
  });
  const budget = verifyPriceCandidate(source, "allocatedBudget", {
    amountText: "๕,๒๐๑,๔๐๐",
    currencyText: "บาท",
    originalThaiText: "๕,๒๐๑,๔๐๐ บาท",
    quote: "๓. วงเงินงบประมาณที่ได้รับจัดสรร ๕,๒๐๑,๔๐๐ บาท",
  });
  assert.equal(reference.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(reference.amount, 3575081.86);
  assert.equal(budget.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(budget.amount, 5201400);

  const invitation = verifyPriceCandidate(
    document({ archiveCategory: "invitation", category: "invitation" }),
    "referencePriceEstimate",
    { amountText: "๓,๕๗๕,๐๘๑.๘๖", currencyText: "บาท", originalThaiText: "", quote: source.text }
  );
  assert.equal(invitation.interpretationStatus, "REJECTED");
  assert.equal(invitation.rejectionReason, "outside_price_estimate_archive");
});

test("allocated budget accepts the official wording with ได้รับการจัดสรร", () => {
  const source = document({
    archiveCategory: "priceEstimate",
    category: "priceEstimate",
    label: "PRICE_ESTIMATE",
    text: "๓. วงเงินงบประมาณที่ได้รับการจัดสรร จำนวน ๒,๐๓๖,๐๐๐ บาท",
  });
  const result = verifyPriceCandidate(source, "allocatedBudget", {
    amountText: "๒,๐๓๖,๐๐๐",
    currencyText: "บาท",
    originalThaiText: "๒,๐๓๖,๐๐๐ บาท",
    quote: source.text,
  });
  assert.equal(result.evidenceStatus, "VERIFIED");
  assert.equal(result.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(result.amount, 2036000);
});

test("reference price evidence expands to the immediately preceding heading", () => {
  const source = document({
    text: [
      "๓. วงเงินงบประมาณที่ได้รับจัดสรร ๕,๒๐๑,๔๐๐ บาท",
      "๔. วันที่กำหนดราคากลาง (ราคาอ้างอิง) ณ วันที่ ๑๙ ม.ค. ๒๕๖๗",
      "เป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท (สามล้านห้าแสนเจ็ดหมื่นห้าพันแปดสิบเอ็ดบาทแปดสิบหก",
      "สตางค์)",
    ].join("\n"),
  });
  const verified = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "๓,๕๗๕,๐๘๑.๘๖",
    currencyText: "บาท",
    originalThaiText: "เป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท",
    quote: "เป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท (สามล้านห้าแสนเจ็ดหมื่นห้าพันแปดสิบเอ็ดบาทแปดสิบหก\nสตางค์)",
  });
  assert.equal(verified.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(verified.amount, 3575081.86);
  assert.match(verified.quote, /วันที่กำหนดราคากลาง \(ราคาอ้างอิง\)/);
  assert.match(verified.quote, /๓,๕๗๕,๐๘๑\.๘๖/);
  assert.equal(verified.evidence.derivedFromContextExpansion, true);
});

test("price context expansion distinguishes equal budget and reference amounts", () => {
  const source = document({
    text: [
      "๒. วงเงินงบประมาณที่ได้รับจัดสรร 300,000.00 บาท",
      "๓. วันที่กำหนดราคากลาง (ราคาอ้างอิง) วันที่ 7 พฤศจิกายน 2566",
      "เป็นเงิน 300,000.00 บาท",
    ].join("\n"),
  });
  const reference = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "300,000.00",
    currencyText: "บาท",
    originalThaiText: "300,000.00 บาท",
    quote: "เป็นเงิน 300,000.00 บาท",
  });
  assert.equal(reference.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(reference.amount, 300000);
  assert.match(reference.quote, /วันที่กำหนดราคากลาง/);
  assert.doesNotMatch(reference.quote, /วงเงินงบประมาณ/);

  const budget = verifyPriceCandidate(source, "allocatedBudget", {
    amountText: "300,000.00",
    currencyText: "บาท",
    originalThaiText: "300,000.00 บาท",
    quote: "เป็นเงิน 300,000.00 บาท",
  });
  assert.equal(budget.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(budget.amount, 300000);
  assert.match(budget.quote, /วงเงินงบประมาณ/);
  assert.doesNotMatch(budget.quote, /วันที่กำหนดราคากลาง/);
  assert.equal(budget.evidence.derivedFromPriceContext, true);
});

test("duplicate price statements with the same field and amount are deterministic evidence", () => {
  const line = "๓. วงเงินงบประมาณที่ได้รับจัดสรร ๒๓,๔๙๖,๒๐๐ บาท (ยี่สิบสามล้านสี่แสนเก้าหมื่นหกพันสองร้อยบาทถ้วน)";
  const source = document({ text: `${line}\nรายละเอียดอื่น\n${line}` });
  const result = verifyPriceCandidate(source, "allocatedBudget", {
    amountText: "23,496,200",
    currencyText: "บาท",
    originalThaiText: "ยี่สิบสามล้านสี่แสนเก้าหมื่นหกพันสองร้อยบาทถ้วน",
    quote: line,
  });
  assert.equal(result.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(result.amount, 23496200);
  assert.equal(result.evidence.lineStart, 1);
  assert.equal(result.evidence.duplicateSupportingOccurrences, 2);
});

test("mixed Thai and Bengali extracted digits retain exact price evidence", () => {
  const source = document({
    text: [
      "๔. วันที่กำหนดราคากลาง (ราคาอ้างอิง) ณ วันที่",
      "เป็นเงิน",
      "๒,๖০০,০০০ บาท",
    ].join("\n"),
  });
  const result = verifyPriceCandidate(source, "referencePriceEstimate", {
    amountText: "๒,๖๐๐,๐๐๐",
    currencyText: "บาท",
    originalThaiText: "๒,๖๐๐,๐๐๐ บาท",
    quote: "เป็นเงิน ๒,๖๐๐,๐๐๐ บาท",
  });
  assert.equal(result.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(result.amount, 2600000);
  assert.match(result.quote, /๒,๖০০,০০০/);
  assert.equal(result.evidence.evidenceStatus, "VERIFIED");
});

test("whitespace-only model quote changes recover an exact source quotation", () => {
  const source = document({ text: "ผู้ยื่นข้อเสนอจะต้องมีคุณสมบัติ\nตามที่กำหนดไว้" });
  const recovered = verifyWithRecovery(source, {
    quote: "ผู้ยื่นข้อเสนอจะต้องมีคุณสมบัติ ตามที่กำหนดไว้",
  });
  assert.equal(recovered.evidenceStatus, "VERIFIED");
  assert.equal(recovered.evidence.derivedFromWhitespaceMatch, true);
  assert.equal(recovered.quote, source.text);
  assert.equal(recovered.rejectionReason, undefined);
});

test("Thai PDF line wrapping inside a word recovers exact evidence", () => {
  const source = document({
    text: "2.1 เพื่อออกแบบแพลตฟอร์มของ\nประเทศไทย ตามมาตรฐานสากล",
    archiveCategory: "invitation",
    category: "invitation",
    label: "TOR",
  });
  const result = verifyTorItem(source, {
    section: "objective",
    textThai: "ออกแบบแพลตฟอร์มของประเทศไทยตามมาตรฐานสากล",
    quote: "เพื่อออกแบบแพลตฟอร์มของประเทศไทย ตามมาตรฐานสากล",
  });
  assert.equal(result.evidenceStatus, "VERIFIED");
  assert.equal(result.evidence.quote, "เพื่อออกแบบแพลตฟอร์มของ\nประเทศไทย ตามมาตรฐานสากล");
  assert.equal(result.evidence.lineStart, 1);
  assert.equal(result.evidence.lineEnd, 2);
  assert.equal(result.evidence.derivedFromWhitespaceMatch, true);
});

test("English source quotations remain verbatim while the TOR summary is Thai", () => {
  const source = document({
    archiveCategory: "draftEbidding",
    category: "draftEbidding",
    label: "TOR",
    text: "2. Objectives\nImprove the asset management system to support web and mobile applications.",
  });
  const quote = "Improve the asset management system to support web and mobile applications.";
  const candidate = verifyTorItem(source, {
    section: "objective",
    textThai: "ปรับปรุงระบบบริหารจัดการสินทรัพย์ให้รองรับเว็บและแอปพลิเคชันมือถือ",
    quote,
  });
  assert.equal(candidate.evidenceStatus, "VERIFIED");
  assert.equal(candidate.interpretationStatus, "RULE_SUPPORTED");
  assert.equal(candidate.evidence.quote, quote);

  const prompt = buildPrompt(source);
  assert.match(prompt, /Write textThai as concise Thai/);
  assert.match(prompt, /Never translate, paraphrase, or rewrite an English quote into Thai/);
});

test("invalid Vertex JSON fails after exactly one request", async () => {
  let calls = 0;
  const client = {
    models: {
      generateContent: async () => {
        calls += 1;
        return { text: '{"referencePriceEstimate":[' };
      },
    },
  };
  await assert.rejects(requestVertexCandidates(client, CONFIG, document()), /Vertex returned invalid JSON/);
  assert.equal(calls, 1);
});

test("Vertex request diagnostics capture API timing and available token usage", async () => {
  const diagnostics = [];
  const ticks = [1_000, 4_250];
  const client = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify(response()),
        usageMetadata: {
          promptTokenCount: 123,
          candidatesTokenCount: 45,
          totalTokenCount: 168,
          cachedContentTokenCount: 12,
          thoughtsTokenCount: 7,
        },
      }),
    },
  };
  await requestVertexCandidates(client, CONFIG, document(), {
    now: () => ticks.shift(),
    onRequestComplete: (value) => diagnostics.push(value),
  });
  assert.deepEqual(diagnostics, [{
    requestStartedAt: "1970-01-01T00:00:01.000Z",
    requestCompletedAt: "1970-01-01T00:00:04.250Z",
    geminiApiLatencyMs: 3_250,
    tokenUsage: {
      inputTokens: 123,
      outputTokens: 45,
      totalTokens: 168,
      cachedInputTokens: 12,
      thoughtsTokens: 7,
    },
    outcome: "api_success",
  }]);
  assert.equal(extractTokenUsage({}), null);
});

test("analysis records document identity, project elapsed time, request totals, and token totals", async () => {
  const ticks = [10_000, 11_000, 14_000, 15_500];
  const client = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify(response()),
        usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 20, totalTokenCount: 220 },
      }),
    },
  };
  const result = await analyzeProcurementInput({
    projectId: PROJECT_ID,
    documents: [document({ metadata: { originalFileName: "ราคาอ้างอิง.txt" } })],
    coverage: { status: "complete", warnings: [], categories: { priceEstimate: { manifestAvailable: true, unavailable: 0 } } },
  }, { client, config: CONFIG, now: () => ticks.shift() });
  assert.equal(result.processing.startedAt, "1970-01-01T00:00:10.000Z");
  assert.equal(result.processing.completedAt, "1970-01-01T00:00:15.500Z");
  assert.equal(result.processing.elapsedMs, 5_500);
  assert.equal(result.processing.totalRequests, 1);
  assert.equal(result.processing.attemptedRequests, 1);
  assert.equal(result.processing.documents[0].documentName, "ราคาอ้างอิง.txt");
  assert.equal(result.processing.documents[0].archiveCategory, "priceEstimate");
  assert.equal(result.processing.documents[0].geminiApiLatencyMs, 3_000);
  assert.deepEqual(result.processing.tokenUsage, {
    requestsWithUsage: 1,
    inputTokens: 200,
    outputTokens: 20,
    totalTokens: 220,
    cachedInputTokens: null,
    thoughtsTokens: null,
  });
  assert.match(formatAnalysisProgress({
    phase: "completed",
    documentName: "ราคาอ้างอิง.txt",
    archiveCategory: "priceEstimate",
    request: 1,
    totalRequests: 1,
    outcome: "api_success",
    geminiApiLatencyMs: 3_000,
    requestStartedAt: "start",
    requestCompletedAt: "end",
    tokenUsage: result.processing.documents[0].tokenUsage,
  }), /ราคาอ้างอิง\.txt \(priceEstimate\).*latency=3000ms.*input=200 output=20 total=220/);
});

test("whole-document request has no fixed TOR candidate cap and has a larger output budget", async () => {
  let captured;
  const source = document({
    archiveCategory: "draftEbidding",
    category: "draftEbidding",
    label: "TOR",
    text: `${"ข้อกำหนด ".repeat(20_000)}จบเอกสาร`,
  });
  await requestVertexCandidates(fakeClient(async (request) => {
    captured = request;
    return response();
  }), CONFIG, source);
  assert.equal(CANDIDATE_SCHEMA.properties.torSummaryItems.maxItems, undefined);
  assert.match(captured.contents, /Return every distinct material fact supported by the document/);
  assert.equal(captured.config.maxOutputTokens, MAX_OUTPUT_TOKENS);
  assert.deepEqual(captured.config.thinkingConfig, { thinkingBudget: THINKING_BUDGET_TOKENS });
  assert.ok(captured.contents.endsWith(source.text));
});

test("Vertex schema exposes only the final bid deadline and validation rejects other procurement dates", () => {
  assert.deepEqual(Object.keys(CANDIDATE_SCHEMA.properties), [
    "referencePriceEstimate",
    "allocatedBudget",
    "torSummaryItems",
    "biddingClosingDate",
    "documentAssessment",
    "warnings",
  ]);
  assert.deepEqual(CANDIDATE_SCHEMA.properties.torSummaryItems.items.properties.section.enum, [
    "project_details",
    "objective",
    "scope_of_work",
    "qualification_general",
    "qualification_project_specific",
    "technical_requirement",
    "deliverable",
  ]);
  const source = document({
    archiveCategory: "draftEbidding",
    category: "draftEbidding",
    label: "DRAFT_NOTICE",
    text: "รับฟังความคิดเห็นถึงวันที่ ๒๓ พฤษภาคม ๒๕๖๗",
  });
  const candidate = verifyDeadlineCandidate(source, "biddingClosingDate", {
    dateText: "๒๓ พฤษภาคม ๒๕๖๗",
    timeText: "",
    reason: "public comment",
    quote: source.text,
  });
  assert.equal(candidate.evidenceStatus, "VERIFIED");
  assert.equal(candidate.interpretationStatus, "REJECTED");
});

test("TOR semantic rules reclassify financial qualifications and reject payment timing as a deliverable", () => {
  const source = document({
    archiveCategory: "invitation",
    category: "invitation",
    label: "TOR",
    text: "ผู้ยื่นข้อเสนอต้องมีมูลค่าสุทธิของกิจการเป็นบวก\nการชำระเงินแบ่งเป็น ๔ งวด",
  });
  const financial = verifyTorItem(source, {
    section: "technical_requirement",
    textThai: "ผู้ยื่นข้อเสนอต้องมีมูลค่าสุทธิของกิจการเป็นบวก",
    quote: "ผู้ยื่นข้อเสนอต้องมีมูลค่าสุทธิของกิจการเป็นบวก",
  });
  assert.equal(financial.section, "qualification_general");
  assert.equal(financial.interpretationStatus, "RULE_SUPPORTED");

  const payment = verifyTorItem(source, {
    section: "deliverable",
    textThai: "การชำระเงินแบ่งเป็น ๔ งวด",
    quote: "การชำระเงินแบ่งเป็น ๔ งวด",
  });
  assert.equal(payment.interpretationStatus, "REJECTED");
  assert.equal(payment.interpretationReason, "deliverable_context_not_supported");
});

test("price resolution distinguishes absence, incomplete coverage, and same-field conflicts", () => {
  assert.equal(resolvePriceField("referencePriceEstimate", [], true, true).status, "not_found");
  assert.equal(resolvePriceField("referencePriceEstimate", [], false, false).status, "error");
  const base = { evidenceStatus: "VERIFIED", interpretationStatus: "RULE_SUPPORTED", currency: "THB", evidence: {} };
  const ambiguous = resolvePriceField("referencePriceEstimate", [
    { ...base, amount: 100 },
    { ...base, amount: 200 },
  ], true, true);
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.conflicts.length, 2);
});

function verifiedDeadlineCandidate({
  date,
  end = "12:00",
  textRef,
}) {
  return {
    evidenceStatus: "VERIFIED",
    interpretationStatus: "RULE_SUPPORTED",
    dateText: date,
    timeText: `09:00-${end}`,
    normalizedDate: date,
    submissionWindow: { start: "09:00", end },
    closingDateTime: `${date}T${end}:00+07:00`,
    timezone: "Asia/Bangkok",
    evidence: {
      archiveCategory: "invitation",
      textRef,
    },
  };
}

test("deadline resolution prefers one public annoudoc deadline over a conflicting detailed doc deadline", () => {
  const announcement = verifiedDeadlineCandidate({
    date: "2024-01-04",
    textRef: "pdfs/66129206858/invitation/files/annoudoc_2101000000_66129206858.txt",
  });
  const detailed = verifiedDeadlineCandidate({
    date: "2024-01-09",
    textRef: "pdfs/66129206858/invitation/files/doc_2101000000_66129206858.txt",
  });

  const resolved = resolveDeadline(
    "biddingClosingDate",
    [announcement, detailed],
    true
  );

  assert.equal(resolved.status, "found");
  assert.equal(resolved.normalizedDate, "2024-01-04");
  assert.equal(resolved.closingDateTime, "2024-01-04T12:00:00+07:00");
  assert.equal(resolved.evidence.length, 1);
  assert.equal(resolved.evidence[0].textRef, announcement.evidence.textRef);
});

test("deadline resolution remains ambiguous for conflicting public announcements", () => {
  const firstAnnouncement = verifiedDeadlineCandidate({
    date: "2024-01-04",
    textRef: "pdfs/project/invitation/files/annoudoc_first.txt",
  });
  const secondAnnouncement = verifiedDeadlineCandidate({
    date: "2024-01-05",
    textRef: "pdfs/project/invitation/files/annoudoc_second.txt",
  });
  const detailed = verifiedDeadlineCandidate({
    date: "2024-01-09",
    textRef: "pdfs/project/invitation/files/doc_project.txt",
  });

  const resolved = resolveDeadline(
    "biddingClosingDate",
    [firstAnnouncement, secondAnnouncement, detailed],
    true
  );

  assert.equal(resolved.status, "ambiguous");
  assert.equal(resolved.normalizedDate, null);
  assert.equal(resolved.conflicts.length, 3);
});

test("deadline resolution remains ambiguous when a conflicting source is not doc or annoudoc", () => {
  const detailed = verifiedDeadlineCandidate({
    date: "2024-01-09",
    textRef: "pdfs/project/invitation/files/doc_project.txt",
  });
  const other = verifiedDeadlineCandidate({
    date: "2024-01-10",
    textRef: "pdfs/project/invitation/files/Attach_TOR_1.txt",
  });

  const resolved = resolveDeadline(
    "biddingClosingDate",
    [detailed, other],
    true
  );

  assert.equal(resolved.status, "ambiguous");
  assert.equal(resolved.normalizedDate, null);
});

test("in-memory analysis produces two prices, Thai TOR sections, and the bidding deadline", async () => {
  const price = document();
  const invitation = document({
    documentId: "invitation:notice",
    archiveCategory: "invitation",
    category: "invitation",
    label: "BIDDING_NOTICE",
    text: "ประกาศประกวดราคา\nผู้ยื่นข้อเสนอต้องยื่นข้อเสนอในวันที่ ๒๓ พฤษภาคม ๒๕๖๗ เวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น.\nผู้ยื่นข้อเสนอต้องมีความสามารถตามกฎหมาย",
    source: { textRef: "invitation/notice.txt", pdfRef: "invitation/notice.pdf" },
  });
  const draft = document({
    documentId: "draft:tor",
    archiveCategory: "draftEbidding",
    category: "draftEbidding",
    label: "DRAFT_NOTICE",
    text: "ร่างรายละเอียดขอบเขตของงาน\nโครงการบำรุงรักษาระบบคอมพิวเตอร์แม่ข่าย\nผู้รับจ้างต้องบำรุงรักษาระบบทุก ๓ เดือน",
    source: { textRef: "draft/tor.txt", pdfRef: "draft/tor.pdf" },
  });
  const client = fakeClient(async ({ contents }) => {
    if (contents.includes("DOCUMENT_ID: price:one")) {
      return response({
        referencePriceEstimate: [{ amountText: "๓,๕๗๕,๐๘๑.๘๖", currencyText: "บาท", originalThaiText: "๓,๕๗๕,๐๘๑.๘๖ บาท", quote: "๔. ราคากลาง (ราคาอ้างอิง)\nเป็นเงิน ๓,๕๗๕,๐๘๑.๘๖ บาท" }],
        allocatedBudget: [{ amountText: "๕,๒๐๑,๔๐๐", currencyText: "บาท", originalThaiText: "๕,๒๐๑,๔๐๐ บาท", quote: "๓. วงเงินงบประมาณที่ได้รับจัดสรร ๕,๒๐๑,๔๐๐ บาท" }],
      });
    }
    if (contents.includes("DOCUMENT_ID: invitation:notice")) {
      return response({
        biddingClosingDate: [{ dateText: "๒๓ พฤษภาคม ๒๕๖๗", timeText: "๐๙.๐๐ น. ถึง ๑๒.๐๐ น.", reason: "bid submission", quote: "ผู้ยื่นข้อเสนอต้องยื่นข้อเสนอในวันที่ ๒๓ พฤษภาคม ๒๕๖๗ เวลา ๐๙.๐๐ น. ถึง ๑๒.๐๐ น." }],
        torSummaryItems: [{ section: "qualification_general", textThai: "ผู้ยื่นข้อเสนอต้องมีความสามารถตามกฎหมาย", quote: "ผู้ยื่นข้อเสนอต้องมีความสามารถตามกฎหมาย" }],
        documentAssessment: [{ lifecycleCandidate: "invitation", reason: "announcement", quote: "ประกาศประกวดราคา" }],
      });
    }
    return response({
      torSummaryItems: [
        { section: "project_details", textThai: "โครงการบำรุงรักษาระบบคอมพิวเตอร์แม่ข่าย", quote: "โครงการบำรุงรักษาระบบคอมพิวเตอร์แม่ข่าย" },
        { section: "technical_requirement", textThai: "ผู้รับจ้างต้องบำรุงรักษาระบบทุก ๓ เดือน", quote: "ผู้รับจ้างต้องบำรุงรักษาระบบทุก ๓ เดือน" },
      ],
      documentAssessment: [{ lifecycleCandidate: "draft", reason: "draft wording", quote: "ร่างรายละเอียดขอบเขตของงาน" }],
    });
  });
  const input = {
    projectId: PROJECT_ID,
    documents: [price, invitation, draft],
    coverage: {
      status: "complete",
      warnings: [],
      categories: { priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 0 } },
    },
  };
  const result = await analyzeProcurementInput(input, { client, config: CONFIG });
  assert.equal(result.schemaVersion, 3);
  assert.equal(result.prices.referencePriceEstimate.amount, 3575081.86);
  assert.equal(result.prices.allocatedBudget.amount, 5201400);
  assert.equal(result.deadlines.biddingClosingDate.closingDateTime, "2024-05-23T12:00:00+07:00");
  assert.deepEqual(Object.keys(result.deadlines), ["biddingClosingDate"]);
  assert.match(result.torSummary.sections.projectDetails.text, /บำรุงรักษา/);
  assert.equal(result.documentAssessment.draft, "available");
  assert.equal(result.documentAssessment.invitation, "available");
  assert.equal(result.processing.processedRequests, 3);
  assert.equal(result.processing.totalRequests, 3);
});

test("incomplete processing cannot return not_found", async () => {
  const input = {
    projectId: PROJECT_ID,
    documents: [document()],
    coverage: { status: "incomplete", warnings: [{ code: "MISSING_TXT" }], categories: { priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 1 } } },
  };
  const result = await analyzeProcurementInput(input, { client: fakeClient(async () => response()), config: CONFIG });
  assert.equal(result.status, "incomplete");
  assert.equal(result.prices.referencePriceEstimate.status, "error");
  assert.equal(result.deadlines.biddingClosingDate.status, "error");
  assert.equal(result.deadlines.biddingClosingDate.normalizedDate, null);
  assert.deepEqual(result.deadlines.biddingClosingDate.submissionWindow, { start: null, end: null });
});

test("a failed whole-document request is recorded and later documents still run", async () => {
  const documents = [
    document({ documentId: "draft:first", archiveCategory: "draftEbidding", category: "draftEbidding", label: "TOR" }),
    document({ documentId: "draft:second", archiveCategory: "draftEbidding", category: "draftEbidding", label: "TOR" }),
  ];
  let calls = 0;
  const client = fakeClient(async () => {
    calls += 1;
    if (calls === 1) throw new Error("document exceeds model input limit");
    return response();
  });
  const result = await analyzeProcurementInput({
    projectId: PROJECT_ID,
    documents,
    coverage: { status: "complete", warnings: [] },
  }, { client, config: CONFIG });
  assert.equal(calls, 2);
  assert.equal(result.status, "error");
  assert.equal(result.processing.totalRequests, 2);
  assert.equal(result.processing.processedRequests, 1);
  assert.equal(result.processing.documents[0].processed, false);
  assert.equal(result.processing.documents[0].errors[0].code, "VERTEX_DOCUMENT_PROCESSING_ERROR");
  assert.match(result.processing.documents[0].errors[0].message, /model input limit/);
  assert.equal(result.processing.documents[1].processed, true);
});

test("missing invitation coverage preserves verified TOR facts from available draft documents", async () => {
  const draft = document({
    documentId: "draft:english-tor",
    archiveCategory: "draftEbidding",
    category: "draftEbidding",
    label: "TOR",
    text: "2. Objectives\nImprove the asset management system.",
  });
  const input = {
    projectId: PROJECT_ID,
    documents: [draft],
    coverage: {
      status: "incomplete",
      warnings: [{ code: "MISSING_MANIFEST", category: "invitation" }],
      categories: {
        invitation: { manifestAvailable: false, eligible: 0, unavailable: 0 },
        draftEbidding: { manifestAvailable: true, eligible: 1, unavailable: 0 },
      },
    },
  };
  const client = fakeClient(async () => response({
    torSummaryItems: [{
      section: "objective",
      textThai: "ปรับปรุงระบบบริหารจัดการสินทรัพย์",
      quote: "Improve the asset management system.",
    }],
  }));
  const result = await analyzeProcurementInput(input, { client, config: CONFIG });
  assert.equal(result.status, "incomplete");
  assert.equal(result.torSummary.status, "found");
  assert.equal(result.torSummary.coverageStatus, "incomplete");
  assert.equal(result.torSummary.sections.objectives.items.length, 1);
  assert.equal(result.deadlines.biddingClosingDate.status, "error");
  assert.equal(result.deadlines.biddingClosingDate.coverageStatus, "incomplete");
  assert.equal(result.diagnostics.candidateDiagnostics.length, 1);
  assert.equal(result.diagnostics.candidateDiagnostics[0].rawCandidate.quote, "Improve the asset management system.");
});

test("readable summary includes evidence and unavailable sections without another model call", () => {
  const result = {
    projectId: PROJECT_ID,
    processing: { documentCount: 1, processedRequests: 1, totalRequests: 1 },
    coverage: { status: "complete" },
    prices: {
      referencePriceEstimate: { status: "found", amount: 100, currency: "THB", evidence: [{ textRef: "p.txt", pdfRef: "p.pdf", lineStart: 1, lineEnd: 2, quote: "ราคากลาง\n100 บาท", evidenceStatus: "VERIFIED" }] },
      allocatedBudget: { status: "not_found", evidence: [] },
    },
    torSummary: { sections: { projectDetails: { text: "โครงการทดสอบ" }, objectives: { items: [] }, scopeOfWork: { items: [] }, contractorQualifications: { generalLegal: [], projectSpecific: [] }, technicalRequirements: { items: [] }, deliverables: { items: [] } } },
    deadlines: { biddingClosingDate: { status: "not_found" } },
    documentAssessment: { draft: "available", invitation: "not_verified", latestOfficialRevision: "unknown" },
    diagnostics: { rejectedCandidates: [], unresolvedCandidates: [], warnings: [], errors: [] },
  };
  const markdown = formatReadableSummary(result);
  assert.match(markdown, /Reference Price/);
  assert.match(markdown, /Lines: 1-2/);
  assert.match(markdown, /รายละเอียดโครงการ/);
  assert.match(markdown, /ไม่พบข้อมูลที่ยืนยันได้/);
  assert.match(markdown, /Value: ไม่พบข้อมูล/);
  assert.match(markdown, /Date: ไม่พบข้อมูล/);
  assert.equal((markdown.match(/Closing Date:/g) || []).length, 1);
});

test("missing values remain structured nulls and empty arrays without failing complete analysis", async () => {
  const input = {
    projectId: PROJECT_ID,
    documents: [document()],
    coverage: {
      status: "complete",
      warnings: [],
      categories: { priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 0 } },
    },
  };
  const result = await analyzeProcurementInput(input, {
    client: fakeClient(async () => response()),
    config: CONFIG,
  });
  assert.equal(result.status, "complete");
  assert.equal(result.prices.referencePriceEstimate.amount, null);
  assert.equal(result.prices.allocatedBudget.originalAmountText, null);
  assert.equal(result.deadlines.biddingClosingDate.normalizedDate, null);
  assert.deepEqual(result.deadlines.biddingClosingDate.evidence, []);
  assert.equal(result.torSummary.sections.projectDetails.text, null);
  assert.deepEqual(result.torSummary.sections.objectives.items, []);
  assert.equal(result.documentAssessment.latestOfficialRevision, null);
});

test("cache accepts complete results with an exact fingerprint and rejects errors", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-cache-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const jsonPath = path.join(tempRoot, "analysis.json");
  await fs.writeFile(jsonPath, JSON.stringify({ status: "complete", fingerprint: "abc" }));
  assert.equal((await loadReusableResult(jsonPath, "abc")).fingerprint, "abc");
  assert.equal(await loadReusableResult(jsonPath, "different"), null);
  await fs.writeFile(jsonPath, JSON.stringify({ status: "error", fingerprint: "abc" }));
  assert.equal(await loadReusableResult(jsonPath, "abc"), null);
});

test("cache safely reuses source-incomplete results but retries processing failures", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-source-cache-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const jsonPath = path.join(tempRoot, "analysis.json");
  const warning = { code: "MISSING_MANIFEST", category: "draftEbidding" };
  const sourceIncomplete = {
    status: "incomplete",
    fingerprint: "source-fingerprint",
    coverage: { status: "incomplete", warnings: [warning] },
    processing: {
      totalRequests: 1,
      processedRequests: 1,
      documents: [{ requestCount: 1, processed: true, errors: [] }],
    },
    diagnostics: { errors: [], warnings: [warning] },
  };
  assert.equal(isReusableSourceIncompleteResult(sourceIncomplete), true);
  await fs.writeFile(jsonPath, JSON.stringify(sourceIncomplete));
  assert.equal((await loadReusableResult(jsonPath, "source-fingerprint")).status, "incomplete");

  const vertexFailure = {
    ...sourceIncomplete,
    diagnostics: { errors: [{ message: "Vertex unavailable" }], warnings: [warning] },
  };
  assert.equal(isReusableSourceIncompleteResult(vertexFailure), false);
  await fs.writeFile(jsonPath, JSON.stringify(vertexFailure));
  assert.equal(await loadReusableResult(jsonPath, "source-fingerprint"), null);

  const unfinishedRequest = {
    ...sourceIncomplete,
    processing: { totalRequests: 1, processedRequests: 0, documents: [{ requestCount: 1, processed: false, errors: [] }] },
  };
  assert.equal(isReusableSourceIncompleteResult(unfinishedRequest), false);
});

test("fingerprint changes with text or model and CLI bounds explicit projects", () => {
  const input = { projectId: PROJECT_ID, documents: [document()] };
  const first = computeAnalysisFingerprint(input, CONFIG);
  const changedText = computeAnalysisFingerprint({ ...input, documents: [document({ text: "changed" })] }, CONFIG);
  const changedModel = computeAnalysisFingerprint(input, { ...CONFIG, model: "other" });
  assert.notEqual(first, changedText);
  assert.notEqual(first, changedModel);
  const args = parseCliArgs(["--project-id", PROJECT_ID, "--project-id", "69049472497", "--limit", "1", "--force"]);
  assert.deepEqual(args.projectIds, [PROJECT_ID]);
  assert.equal(args.force, true);
});

test("fingerprint changes when local source coverage changes", () => {
  const missingCoverage = {
    status: "incomplete",
    manifestCount: 1,
    categories: {
      priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 0 },
      draftEbidding: { manifestAvailable: false, eligible: 0, unavailable: 0 },
    },
    warnings: [{ code: "MISSING_MANIFEST", category: "draftEbidding", manifestPath: "machine-specific-path" }],
  };
  const availableCoverage = {
    status: "complete",
    manifestCount: 2,
    categories: {
      priceEstimate: { manifestAvailable: true, eligible: 1, unavailable: 0 },
      draftEbidding: { manifestAvailable: true, eligible: 0, unavailable: 0 },
    },
    warnings: [],
  };
  const base = { projectId: PROJECT_ID, documents: [document()], coverage: missingCoverage };
  const changed = { ...base, coverage: availableCoverage };
  assert.notDeepEqual(coverageFingerprint(missingCoverage), coverageFingerprint(availableCoverage));
  assert.notEqual(computeAnalysisFingerprint(base, CONFIG), computeAnalysisFingerprint(changed, CONFIG));
});

test("readable report labels missing local TOR input as source unavailable", () => {
  const result = {
    projectId: PROJECT_ID,
    processing: {
      documentCount: 1,
      processedRequests: 1,
      totalRequests: 1,
      documents: [{ label: "PRICE_ESTIMATE" }],
    },
    coverage: { status: "incomplete" },
    prices: {
      referencePriceEstimate: { status: "found", amount: 100, currency: "THB", evidence: [{}] },
      allocatedBudget: { status: "found", amount: 100, currency: "THB", evidence: [{}] },
    },
    torSummary: { status: "error", coverageStatus: "incomplete", sections: {} },
    deadlines: {
      biddingClosingDate: { status: "error", coverageStatus: "incomplete" },
    },
    documentAssessment: { draft: "unknown", invitation: "unknown", latestOfficialRevision: "unknown" },
    diagnostics: { candidateDiagnostics: [], rejectedCandidates: [], unresolvedCandidates: [], warnings: [], errors: [] },
  };
  const report = formatReadableSummary(result);
  assert.match(report, /Status: SOURCE_UNAVAILABLE/);
  assert.match(report, /ไม่พบ TOR TXT จาก invitation หรือ draftEbidding ในเครื่อง/);
});

test("local project discovery returns only numeric project folders in deterministic order", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-discovery-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  for (const name of ["69000000002", "notes", "67000000001", "123"]) {
    await fs.mkdir(path.join(tempRoot, name));
  }
  await fs.mkdir(path.join(tempRoot, "67000000001", "invitation"));
  await fs.mkdir(path.join(tempRoot, "69000000002", "priceEstimate"));
  await fs.writeFile(path.join(tempRoot, "67000000001", "invitation", "manifest.json"), "{}");
  await fs.writeFile(path.join(tempRoot, "69000000002", "priceEstimate", "manifest.json"), "{}");
  await fs.writeFile(path.join(tempRoot, "68000000003"), "not a directory");
  assert.deepEqual(await discoverLocalProjectIds(tempRoot), ["67000000001", "69000000002"]);
});

test("--all-local applies limit after deterministic discovery without making Vertex requests for empty projects", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-all-local-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  const outputRoot = path.join(tempRoot, "analysis");
  for (const projectId of ["69000000003", "67000000001", "68000000002"]) {
    await writeLocalProject(inputRoot, projectId);
  }
  const scheduler = createVertexRequestScheduler({ delayMs: 100, sleep: async () => assert.fail("empty projects must not delay") });
  const runs = await main([
    "--all-local", "--limit", "2", "--delay-ms", "100",
    "--input-root", inputRoot, "--output-root", outputRoot,
  ], {
    config: CONFIG,
    client: { models: { generateContent: async () => assert.fail("empty projects must not call Vertex") } },
    requestScheduler: scheduler,
    logger: () => {},
    errorLogger: () => {},
    now: () => 1_000,
  });
  assert.deepEqual(runs.map((run) => run.projectId), ["67000000001", "68000000002"]);
  assert.equal(scheduler.getRequestCount(), 0);
});

test("shared Vertex scheduler skips the first delay and delays the next document request", async () => {
  const events = [];
  const scheduler = createVertexRequestScheduler({
    delayMs: 75,
    sleep: async (milliseconds) => events.push(`sleep:${milliseconds}`),
  });
  let calls = 0;
  const client = {
    models: {
      generateContent: async () => {
        calls += 1;
        events.push(`request:${calls}`);
        return { text: JSON.stringify(response()) };
      },
    },
  };
  await requestVertexCandidates(client, CONFIG, document(), {
    beforeRequest: () => scheduler.beforeRequest(),
  });
  await requestVertexCandidates(client, CONFIG, document({ documentId: "price:two" }), {
    beforeRequest: () => scheduler.beforeRequest(),
  });
  assert.deepEqual(events, ["request:1", "sleep:75", "request:2"]);
  assert.equal(scheduler.getRequestCount(), 2);
});

test("cache hits make no Vertex request and apply no delay", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-cache-hit-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  const outputRoot = path.join(tempRoot, "analysis");
  await writeLocalProject(inputRoot, PROJECT_ID, {
    category: "draftEbidding",
    label: "TOR",
    text: "รายละเอียดโครงการทดสอบ",
  });
  const input = await readLocalProjectInput({ projectId: PROJECT_ID, inputRoot });
  const result = await analyzeProcurementInput(input, {
    config: CONFIG,
    client: fakeClient(async () => response()),
  });
  assert.equal(result.status, "complete");
  await saveProjectOutputs(result, path.join(outputRoot, PROJECT_ID));

  const sleeps = [];
  const scheduler = createVertexRequestScheduler({ delayMs: 100, sleep: async (milliseconds) => sleeps.push(milliseconds) });
  const run = await runProject(PROJECT_ID, { inputRoot, outputRoot, force: false }, {
    config: CONFIG,
    client: { models: { generateContent: async () => assert.fail("cache hit must not call Vertex") } },
    requestScheduler: scheduler,
  });
  assert.equal(run.cached, true);
  assert.equal(scheduler.getRequestCount(), 0);
  assert.deepEqual(sleeps, []);
});

test("all-local batch stays sequential, shares delay across projects, and continues after a Vertex error", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-sequential-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  const outputRoot = path.join(tempRoot, "analysis");
  const projectIds = ["67000000001", "68000000002"];
  for (const projectId of projectIds) {
    await writeLocalProject(inputRoot, projectId, {
      category: "draftEbidding",
      label: "TOR",
      text: `โครงการทดสอบ ${projectId}`,
    });
  }

  const requestOrder = [];
  const sleeps = [];
  let active = 0;
  let maxActive = 0;
  const client = fakeClient(async ({ contents }) => {
    const projectId = contents.match(/PROJECT_ID: (\d{11})/)[1];
    requestOrder.push(projectId);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await Promise.resolve();
    active -= 1;
    if (projectId === projectIds[0]) throw new Error("simulated Vertex failure");
    return response();
  });
  const logs = [];
  const runs = await main([
    "--all-local", "--delay-ms", "25", "--input-root", inputRoot, "--output-root", outputRoot,
  ], {
    config: CONFIG,
    client,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    logger: (message) => logs.push(message),
    errorLogger: (message) => logs.push(message),
    onProgress: () => {},
    now: () => 2_000,
  });
  assert.deepEqual(requestOrder, projectIds);
  assert.equal(maxActive, 1);
  assert.deepEqual(sleeps, [25]);
  assert.equal(runs[0].result.status, "error");
  assert.equal(runs[1].result.status, "complete");
  assert.ok(logs.includes("Total projects: 2"));
  assert.ok(logs.includes("Completed: 1"));
  assert.ok(logs.includes("Failed: 1"));
  assert.ok(logs.includes("Actual Vertex API requests: 2"));
});

test("CLI validates all-local exclusivity and delay bounds", () => {
  assert.throws(
    () => parseCliArgs(["--all-local", "--project-id", PROJECT_ID]),
    /cannot be combined/
  );
  assert.throws(() => parseCliArgs(["--delay-ms", "-1"]), /between 0 and 5000/);
  assert.throws(() => parseCliArgs(["--delay-ms", "5001"]), /between 0 and 5000/);
  assert.throws(() => parseCliArgs(["--delay-ms", "1.5"]), /between 0 and 5000/);
  const allLocal = parseCliArgs(["--all-local", "--limit", "3"]);
  assert.equal(allLocal.allLocal, true);
  assert.deepEqual(allLocal.projectIds, []);
  assert.equal(allLocal.limit, 3);
  assert.equal(parseCliArgs([]).delayMs, 1500);
});

test("--help returns before Vertex configuration or local discovery", async () => {
  const logs = [];
  const output = await main(["--help"], {
    logger: (message) => logs.push(message),
    fs: { readdir: async () => assert.fail("help must not inspect local inputs") },
  });
  assert.equal(output.mode, "help");
  assert.match(logs.join("\n"), /--all/);
  assert.match(helpText(), /--validate-only/);
});

test("--all is an alias and discovery-only reports the actual limited selection", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-discover-only-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  for (const projectId of ["67000000001", "68000000002", "69000000003"]) await writeLocalProject(tempRoot, projectId);
  const logs = [];
  const result = await main(["--all", "--limit", "2", "--discover-only", "--input-root", tempRoot], { logger: (message) => logs.push(message) });
  assert.equal(result.mode, "discovery");
  assert.equal(result.discovered, 3);
  assert.equal(result.selected, 2);
  assert.ok(logs.includes("Discovered local projects: 3"));
  assert.deepEqual(result.projectIds, ["67000000001", "68000000002"]);
});

test("MongoDB validation rejects incomplete schema-v3 results", () => {
  const validation = validateAnalysisForImport({
    schemaVersion: 3,
    projectId: PROJECT_ID,
    status: "incomplete",
    coverage: { status: "incomplete" },
    processing: { complete: false, processedRequests: 0, totalRequests: 1 },
  }, PROJECT_ID);
  assert.equal(validation.suitable, false);
  assert.ok(validation.errors.some((error) => error.includes("status must be complete")));
});

test("MongoDB validation blocks a verified price candidate lost to context rejection", () => {
  const result = {
    schemaVersion: 3,
    projectId: PROJECT_ID,
    fingerprint: "old-fingerprint",
    status: "complete",
    coverage: { status: "complete" },
    processing: { complete: true, documentCount: 1, processedRequests: 1, totalRequests: 1 },
    prices: {
      referencePriceEstimate: { status: "not_found", evidence: [] },
      allocatedBudget: { status: "not_found", evidence: [] },
    },
    torSummary: { sections: {
      projectDetails: { evidence: [] }, objectives: { items: [] }, scopeOfWork: { items: [] },
      contractorQualifications: { generalLegal: [], projectSpecific: [] },
      technicalRequirements: { items: [] }, deliverables: { items: [] },
    } },
    deadlines: { biddingClosingDate: { status: "not_found", coverageStatus: "complete", evidence: [] } },
    documentAssessment: { coverageStatus: "complete" },
    diagnostics: { candidateDiagnostics: [{
      group: "referencePriceEstimate",
      accepted: false,
      validatedCandidate: { evidenceStatus: "VERIFIED", interpretationReason: "price_context_or_amount_not_supported" },
    }] },
  };
  const validation = validateAnalysisForImport(result, PROJECT_ID);
  assert.equal(validation.suitable, false);
  assert.ok(validation.errors.some((error) => error.includes("reanalysis is required")));
});

test("stale project output is not overwritten without --force", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-no-overwrite-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const outputDirectory = path.join(tempRoot, PROJECT_ID);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, "analysis.json"), "existing");
  await assert.rejects(
    saveProjectOutputs({ projectId: PROJECT_ID }, outputDirectory),
    /pass --force/
  );
  assert.equal(await fs.readFile(path.join(outputDirectory, "analysis.json"), "utf8"), "existing");
});

test("stale analysis is rejected before any Vertex request", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "procurement-stale-before-vertex-"));
  t.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const inputRoot = path.join(tempRoot, "pdfs");
  const outputRoot = path.join(tempRoot, "analysis");
  await writeLocalProject(inputRoot, PROJECT_ID, { category: "draftEbidding", label: "TOR", text: "changed source" });
  await fs.mkdir(path.join(outputRoot, PROJECT_ID), { recursive: true });
  await fs.writeFile(path.join(outputRoot, PROJECT_ID, "analysis.json"), JSON.stringify({ fingerprint: "stale", status: "complete" }));
  let calls = 0;
  await assert.rejects(
    runProject(PROJECT_ID, { inputRoot, outputRoot, force: false, timings: false }, {
      config: CONFIG,
      client: { models: { generateContent: async () => { calls += 1; } } },
    }),
    /pass --force/
  );
  assert.equal(calls, 0);
});
