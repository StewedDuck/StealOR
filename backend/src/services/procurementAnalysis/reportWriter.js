/**
 * แปลงผล analysis JSON schema v3 เป็น summary.md สำหรับคนอ่านและ debug
 *
 * analysis.json ยังคงเป็น structured output และ integration contract หลัก;
 * summary.md เป็นเพียงมุมมองแบบข้อความที่แสดงราคา, TOR summary, deadlines,
 * evidence location, document assessment และจำนวน diagnostics
 *
 * ไฟล์นี้ไม่มี file I/O และไม่วิเคราะห์ข้อมูลใหม่ เพื่อให้ report ถูกสร้างซ้ำ
 * จาก analysis result เดิมได้โดยไม่ต้องเรียก Gemini อีกครั้ง
 */
function formatEvidence(evidence) {
  if (!evidence) return [];
  return [
    `  Source TXT: ${evidence.textRef || "UNKNOWN"}`,
    `  Source PDF: ${evidence.pdfRef || "UNKNOWN"}`,
    `  Lines: ${evidence.lineStart}-${evidence.lineEnd}`,
    `  Evidence: ${evidence.evidenceStatus} / RULE_SUPPORTED`,
    `  Quote: ${String(evidence.quote || "").replace(/\n/g, " / ")}`,
  ];
}

function formatSummaryItems(items, unavailableMessage = "ไม่พบข้อมูลที่ยืนยันได้ใน TXT ที่มีอยู่") {
  if (!items || !items.length) return [`- ${unavailableMessage}`];
  return items.flatMap((item) => {
    const first = item.evidence && item.evidence[0];
    const source = first ? `${first.textRef} (lines ${first.lineStart}-${first.lineEnd})` : "source unavailable";
    return [`- ${item.text}`, `  Source: ${source}${item.conflictStatus === "review_required" ? " [REVIEW CONFLICT]" : ""}`];
  });
}

function formatPrice(title, result) {
  const lines = [title];
  if (result.status !== "found") {
    lines.push("Value: ไม่พบข้อมูล", `Status: ${result.status.toUpperCase()}`);
    if (result.limitation) lines.push(`Limitation: ${result.limitation}`);
    return [...lines, ""];
  }
  lines.push(`${result.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${result.currency}`);
  lines.push("Status: FOUND");
  lines.push(...formatEvidence(result.evidence[0]), "");
  return lines;
}

function formatDeadline(title, result, options = {}) {
  const lines = [title];
  if (result.status !== "found") {
    const displayStatus = options.sourceUnavailable && result.status === "error" ? "SOURCE_UNAVAILABLE" : result.status.toUpperCase();
    lines.push("Date: ไม่พบข้อมูล");
    lines.push(`Status: ${displayStatus}${result.status === "not_found" ? " in available TXT" : ""}`);
    if (result.coverageStatus) lines.push(`Coverage: ${result.coverageStatus.toUpperCase()}`);
    if (result.limitation) lines.push(`Limitation: ${result.limitation}`);
    return [...lines, ""];
  }
  lines.push(`Date: ${result.normalizedDate}`);
  if (result.submissionWindow.start) lines.push(`Window: ${result.submissionWindow.start}-${result.submissionWindow.end}`);
  else if (result.submissionWindow.end) lines.push(`Time: ${result.submissionWindow.end}`);
  if (result.timezone) lines.push(`Timezone: ${result.timezone}`);
  if (result.coverageStatus) lines.push(`Coverage: ${result.coverageStatus.toUpperCase()}`);
  lines.push(...formatEvidence(result.evidence[0]), "");
  return lines;
}

function formatAssessmentValue(value) {
  if (value == null || value === "unknown" || value === "not_verified") {
    const status = value == null ? null : String(value).toUpperCase();
    return status ? `ไม่พบข้อมูล (${status})` : "ไม่พบข้อมูล";
  }
  return String(value).toUpperCase();
}

function formatReadableSummary(result) {
  const sections = result.torSummary.sections || {};
  const qualifications = sections.contractorQualifications || {};
  const torDocuments = (result.processing.documents || []).filter((document) =>
    ["TOR", "BIDDING_NOTICE", "DRAFT_NOTICE"].includes(document.label)
  );
  // ถ้าไม่มี TOR-eligible TXT เลยและ coverage ไม่ครบ ให้บอกว่า source ไม่มีในเครื่อง
  // แทนการใช้ ERROR ที่อาจทำให้เข้าใจผิดว่า Gemini วิเคราะห์ล้มเหลว
  const torSourceUnavailable = torDocuments.length === 0 && result.torSummary.coverageStatus === "incomplete";
  const torCoverageIncomplete = result.torSummary.coverageStatus === "incomplete";
  const unavailableMessage = torSourceUnavailable
    ? "SOURCE UNAVAILABLE: ไม่พบ TOR TXT จาก invitation หรือ draftEbidding ในเครื่อง"
    : torCoverageIncomplete
    ? "ยังยืนยันข้อมูลไม่ได้ เนื่องจาก coverage หรือการประมวลผลไม่ครบ"
    : "ไม่พบข้อมูลที่ยืนยันได้ใน TXT ที่มีอยู่";
  const torDisplayStatus = torSourceUnavailable ? "SOURCE_UNAVAILABLE" : String(result.torSummary.status || "unknown").toUpperCase();
  const lines = [
    "========================================",
    `PROJECT: ${result.projectId}`,
    "========================================",
    "",
    "DOCUMENTS",
    `TXT analyzed: ${result.processing.documentCount}`,
    `Requests processed: ${result.processing.processedRequests}/${result.processing.totalRequests}`,
    `Coverage: ${String(result.coverage.status).toUpperCase()}`,
    "",
    "PRICES",
    "",
    ...formatPrice("Reference Price (ราคากลาง):", result.prices.referencePriceEstimate),
    ...formatPrice("Allocated Budget (วงเงินงบประมาณ):", result.prices.allocatedBudget),
    "CONTRACTOR SUMMARY",
    `Status: ${torDisplayStatus}`,
    `Coverage: ${String(result.torSummary.coverageStatus || result.coverage.status).toUpperCase()}`,
    "",
    "รายละเอียดโครงการ:",
    sections.projectDetails && sections.projectDetails.text || unavailableMessage,
    "",
    "วัตถุประสงค์:",
    ...formatSummaryItems(sections.objectives && sections.objectives.items, unavailableMessage),
    "",
    "ขอบเขตงาน:",
    ...formatSummaryItems(sections.scopeOfWork && sections.scopeOfWork.items, unavailableMessage),
    "",
    "คุณสมบัติผู้รับจ้าง — ทั่วไป:",
    ...formatSummaryItems(qualifications.generalLegal, unavailableMessage),
    "",
    "คุณสมบัติผู้รับจ้าง — เฉพาะโครงการ:",
    ...formatSummaryItems(qualifications.projectSpecific, unavailableMessage),
    "",
    "ข้อกำหนดทางเทคนิค:",
    ...formatSummaryItems(sections.technicalRequirements && sections.technicalRequirements.items, unavailableMessage),
    "",
    "สิ่งที่ต้องส่งมอบ:",
    ...formatSummaryItems(sections.deliverables && sections.deliverables.items, unavailableMessage),
    "",
    "DEADLINES",
    "",
    ...formatDeadline("Bidding Closing Date:", result.deadlines.biddingClosingDate, { sourceUnavailable: torSourceUnavailable }),
    "DOCUMENT ASSESSMENT",
    `Draft: ${formatAssessmentValue(result.documentAssessment.draft)}`,
    `Invitation: ${formatAssessmentValue(result.documentAssessment.invitation)}`,
    `Latest official revision: ${formatAssessmentValue(result.documentAssessment.latestOfficialRevision)}`,
    "",
    "DIAGNOSTICS",
    `Candidate diagnostics: ${(result.diagnostics.candidateDiagnostics || []).length}`,
    `Rejected candidates: ${result.diagnostics.rejectedCandidates.length}`,
    `Unresolved candidates: ${result.diagnostics.unresolvedCandidates.length}`,
    `Coverage warnings: ${result.diagnostics.warnings.length}`,
    `Vertex errors: ${result.diagnostics.errors.length}`,
    "========================================",
    "",
  ];
  return lines.join("\n");
}

module.exports = { formatReadableSummary };
