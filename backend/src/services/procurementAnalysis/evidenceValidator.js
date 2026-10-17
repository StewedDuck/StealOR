/**
 * ตรวจสอบและตีความ candidate ที่ Gemini สกัดจากเอกสารต้นฉบับ
 *
 * หลักสำคัญคือ evidence quote ต้องตรวจย้อนกลับไปยัง source TXT ได้จริง
 * รองรับการกู้คืนกรณีต่างกันเฉพาะ whitespace และบางกรณีที่หา quote จาก anchor ได้
 * นอกจากนี้ยังรับผิดชอบการแปลงเลขไทย, จำนวนเงิน, วันที่/เวลา และกฎ semantic
 * สำหรับราคา, TOR summary, deadline และ document lifecycle
 *
 * ฟังก์ชันในไฟล์นี้ทำงานกับ document object ใน memory และไม่อ่านไฟล์,
 * ไม่เรียก Vertex AI, ไม่เขียนฐานข้อมูล และไม่สร้างรายงาน
 */
const PRICE_FIELDS = ["referencePriceEstimate", "allocatedBudget"];
const TOR_SECTIONS = [
  "project_details",
  "objective",
  "scope_of_work",
  "qualification_general",
  "qualification_project_specific",
  "technical_requirement",
  "deliverable",
];

function normalizeText(value) {
  return String(value || "").replace(/\r\n?/g, "\n");
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (text.charCodeAt(index) === 10) line += 1;
  return line;
}

function evidenceFor(document, quote, charStart, charEnd, extra = {}) {
  return {
    documentId: document.documentId,
    archiveCategory: document.archiveCategory || document.category,
    label: document.label,
    textRef: document.source && document.source.textRef,
    pdfRef: document.source && document.source.pdfRef,
    manifestRef: document.source && document.source.manifestRef,
    quote,
    charStart,
    charEnd,
    lineStart: lineNumberAt(document.text, charStart),
    lineEnd: lineNumberAt(document.text, Math.max(charStart, charEnd - 1)),
    evidenceStatus: "VERIFIED",
    ...extra,
  };
}

function verifyExactQuote(document, candidate) {
  const text = normalizeText(document.text);
  const quote = normalizeText(candidate && candidate.quote);
  const base = { ...candidate, interpretationStatus: "UNREVIEWED" };
  if (!quote) return { ...base, evidenceStatus: "REJECTED", rejectionReason: "empty_quote" };
  const offsets = [];
  let cursor = 0;
  while (cursor <= text.length - quote.length) {
    const offset = text.indexOf(quote, cursor);
    if (offset === -1) break;
    offsets.push(offset);
    cursor = offset + Math.max(quote.length, 1);
  }
  if (offsets.length === 0) return { ...base, evidenceStatus: "REJECTED", rejectionReason: "quote_not_found" };
  if (offsets.length > 1) {
    return { ...base, evidenceStatus: "AMBIGUOUS", rejectionReason: "quote_not_unique", occurrenceCount: offsets.length };
  }
  const charStart = offsets[0];
  const charEnd = charStart + quote.length;
  return { ...base, quote, evidenceStatus: "VERIFIED", evidence: evidenceFor(document, quote, charStart, charEnd) };
}

function recoverWhitespaceEvidence(document, candidate) {
  const requestedQuote = normalizeText(candidate && candidate.quote).trim();
  if (!requestedQuote || requestedQuote.length > 2_000 || requestedQuote.includes("...")) return candidate;
  const text = normalizeText(document.text);
  const compactQuote = requestedQuote.replace(/\s+/gu, "");
  if (!compactQuote) return candidate;

  // PDF-to-TXT layout can insert a newline in the middle of a Thai word, for
  // example ของ\nประเทศไทย, while Gemini naturally returns ของประเทศไทย.
  // Match without layout whitespace, require one occurrence, then map the
  // match back to the exact source span so evidence remains verbatim.
  let compactText = "";
  const sourceOffsets = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/u.test(text[index])) continue;
    compactText += text[index];
    sourceOffsets.push(index);
  }
  const compactOffsets = [];
  let cursor = 0;
  while (cursor <= compactText.length - compactQuote.length) {
    const offset = compactText.indexOf(compactQuote, cursor);
    if (offset === -1) break;
    compactOffsets.push(offset);
    cursor = offset + Math.max(compactQuote.length, 1);
  }
  if (compactOffsets.length !== 1) return candidate;
  const compactStart = compactOffsets[0];
  const charStart = sourceOffsets[compactStart];
  const charEnd = sourceOffsets[compactStart + compactQuote.length - 1] + 1;
  const exactQuote = text.slice(charStart, charEnd);
  const recovered = verifyExactQuote(document, {
    ...candidate,
    modelQuote: candidate.modelQuote || candidate.quote,
    quote: exactQuote,
  });
  if (recovered.evidenceStatus === "VERIFIED") {
    // เมื่อตรวจ quote ที่กู้คืนได้แล้ว ต้องล้างเหตุผลปฏิเสธจากรอบแรก
    // ไม่เช่นนั้น diagnostics จะรายงาน quote_not_found ทั้งที่ evidence ผ่านแล้ว
    delete recovered.rejectionReason;
    delete recovered.occurrenceCount;
    recovered.evidence.derivedFromWhitespaceMatch = true;
  }
  return recovered;
}

function verifyWithRecovery(document, candidate) {
  const verified = verifyExactQuote(document, candidate);
  return verified.evidenceStatus === "VERIFIED" ? verified : recoverWhitespaceEvidence(document, verified);
}

function thaiDigitsToArabic(value) {
  const thai = "๐๑๒๓๔๕๖๗๘๙";
  const bengali = "০১২৩৪৫৬৭৮৯";
  return String(value || "").replace(/[๐-๙০-৯]/g, (digit) => {
    const thaiIndex = thai.indexOf(digit);
    return String(thaiIndex >= 0 ? thaiIndex : bengali.indexOf(digit));
  });
}

function extractMoneyTokens(value) {
  return thaiDigitsToArabic(value).match(/\d(?:[\d.,]*\d)?/g) || [];
}

function normalizeMoneyToken(value) {
  const token = thaiDigitsToArabic(value).replace(/\s/g, "");
  if (!/^\d(?:[\d.,]*\d)?$/.test(token)) return null;

  const separators = [...token.matchAll(/[.,]/g)];
  if (!separators.length) return token;

  const lastSeparator = separators[separators.length - 1];
  const decimalLength = token.length - lastSeparator.index - 1;
  const hasDecimal = decimalLength === 2 || (
    separators.length === 1 && lastSeparator[0] === "." && decimalLength !== 3
  );
  if (!hasDecimal) return token.replace(/[.,]/g, "");

  const integerPart = token.slice(0, lastSeparator.index).replace(/[.,]/g, "");
  const decimalPart = token.slice(lastSeparator.index + 1);
  return `${integerPart}.${decimalPart}`;
}

function parseMoney(value) {
  const token = extractMoneyTokens(value)[0];
  const normalized = token && normalizeMoneyToken(token);
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function amountOccursInQuote(amount, quote) {
  if (amount == null) return false;
  const values = extractMoneyTokens(quote)
    .map(normalizeMoneyToken)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  return values.some((value) => Math.abs(value - amount) < 0.005);
}

function candidateAnchors(groupName, candidate) {
  const fields = PRICE_FIELDS.includes(groupName)
    ? [candidate.amountText, candidate.originalThaiText]
    : [candidate.dateText];
  const anchors = [];
  for (const field of fields) {
    const value = String(field || "").trim();
    if (value) anchors.push(value);
    anchors.push(...(value.match(/[0-9๐-๙][0-9๐-๙,.]*/g) || []).filter((item) => item.replace(/[,.]/g, "").length >= 4));
  }
  return [...new Set(anchors)].sort((left, right) => right.length - left.length);
}

function recoverExactEvidence(document, groupName, candidate) {
  const text = normalizeText(document.text);
  for (const anchor of candidateAnchors(groupName, candidate)) {
    const first = text.indexOf(anchor);
    if (first === -1 || text.indexOf(anchor, first + anchor.length) !== -1) continue;
    const currentStart = text.lastIndexOf("\n", Math.max(0, first - 1)) + 1;
    const previousEnd = Math.max(0, currentStart - 1);
    const previousStart = previousEnd > 0 ? text.lastIndexOf("\n", previousEnd - 1) + 1 : 0;
    const lineEndIndex = text.indexOf("\n", first + anchor.length);
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
    const quote = text.slice(previousStart, lineEnd);
    const recovered = verifyExactQuote(document, { ...candidate, modelQuote: candidate.quote, quote });
    if (recovered.evidenceStatus === "VERIFIED") {
      // quote ใหม่ผ่านแล้ว จึงไม่ควรเก็บ rejectionReason จาก quote เดิมไว้
      delete recovered.rejectionReason;
      delete recovered.occurrenceCount;
      recovered.evidence.derivedFromCandidateAnchor = true;
      recovered.evidence.anchor = anchor;
      return recovered;
    }
  }
  return candidate;
}

function expandVerifiedEvidenceToContext(document, candidate, contextPattern, maxPreviousLines = 3, opposingPattern = null) {
  if (candidate?.evidenceStatus !== "VERIFIED" || !candidate.evidence || contextPattern.test(candidate.quote || "")) {
    return candidate;
  }
  const text = normalizeText(document.text);
  const evidenceStart = candidate.evidence.charStart;
  const evidenceEnd = candidate.evidence.charEnd;
  if (!Number.isInteger(evidenceStart) || !Number.isInteger(evidenceEnd)) return candidate;
  let lineStart = text.lastIndexOf("\n", Math.max(0, evidenceStart - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", evidenceEnd);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  for (let previousLines = 0; previousLines <= maxPreviousLines; previousLines += 1) {
    const quote = text.slice(lineStart, lineEnd);
    if (contextPattern.test(quote) && !(opposingPattern && opposingPattern.test(quote))) {
      const expanded = verifyExactQuote(document, { ...candidate, modelQuote: candidate.modelQuote || candidate.quote, quote });
      if (expanded.evidenceStatus === "VERIFIED") {
        delete expanded.rejectionReason;
        delete expanded.occurrenceCount;
        expanded.evidence.derivedFromContextExpansion = true;
        return expanded;
      }
    }
    if (lineStart === 0) break;
    const previousEnd = Math.max(0, lineStart - 1);
    lineStart = previousEnd > 0 ? text.lastIndexOf("\n", previousEnd - 1) + 1 : 0;
  }
  return candidate;
}

function recoverPriceEvidenceByContext(document, fieldName, candidate, contextPattern, opposingPattern) {
  const text = normalizeText(document.text);
  // Some PDF fonts extract a single amount with mixed Thai/Bengali digit
  // codepoints. Both scripts normalize one-for-one, so offsets still map to
  // the exact original source quotation.
  const searchableText = thaiDigitsToArabic(text);
  const numericAnchors = candidateAnchors(fieldName, candidate)
    .filter((anchor) => /[0-9๐-๙]/.test(anchor) || anchor.length >= 12);
  const matches = new Map();
  for (const anchor of numericAnchors) {
    const searchableAnchor = thaiDigitsToArabic(anchor);
    let cursor = 0;
    while (cursor <= searchableText.length - searchableAnchor.length) {
      const offset = searchableText.indexOf(searchableAnchor, cursor);
      if (offset === -1) break;
      cursor = offset + Math.max(searchableAnchor.length, 1);
      let lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      const lineEndIndex = text.indexOf("\n", offset + searchableAnchor.length);
      const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
      for (let previousLines = 0; previousLines <= 3; previousLines += 1) {
        const quote = text.slice(lineStart, lineEnd);
        if (contextPattern.test(quote) && !opposingPattern.test(quote)) {
          const key = `${lineStart}:${lineEnd}`;
          matches.set(key, { quote, anchor, charStart: lineStart, charEnd: lineEnd });
          break;
        }
        if (lineStart === 0) break;
        const previousEnd = Math.max(0, lineStart - 1);
        lineStart = previousEnd > 0 ? text.lastIndexOf("\n", previousEnd - 1) + 1 : 0;
      }
    }
  }
  const amount = parseMoney(candidate.amountText || candidate.originalThaiText);
  const supportedMatches = [...matches.values()]
    .filter((match) => amountOccursInQuote(amount, match.quote))
    .sort((left, right) => left.charStart - right.charStart);
  if (!supportedMatches.length) return candidate;
  const { quote, anchor, charStart, charEnd } = supportedMatches[0];
  let recovered = verifyExactQuote(document, { ...candidate, modelQuote: candidate.modelQuote || candidate.quote, quote });
  if (recovered.evidenceStatus !== "VERIFIED" && supportedMatches.length > 1) {
    recovered = {
      ...candidate,
      modelQuote: candidate.modelQuote || candidate.quote,
      quote,
      interpretationStatus: "UNREVIEWED",
      evidenceStatus: "VERIFIED",
      evidence: evidenceFor(document, quote, charStart, charEnd, {
        duplicateSupportingOccurrences: supportedMatches.length,
      }),
    };
  }
  if (recovered.evidenceStatus === "VERIFIED") {
    delete recovered.rejectionReason;
    delete recovered.occurrenceCount;
    recovered.evidence.derivedFromPriceContext = true;
    recovered.evidence.anchor = anchor;
  }
  return recovered;
}

function verifyPriceCandidate(document, fieldName, rawCandidate) {
  if ((document.archiveCategory || document.category) !== "priceEstimate" || document.label === "JUNK") {
    return { ...rawCandidate, fieldName, evidenceStatus: "REJECTED", interpretationStatus: "REJECTED", rejectionReason: "outside_price_estimate_archive" };
  }
  let candidate = verifyWithRecovery(document, rawCandidate);
  if (candidate.evidenceStatus !== "VERIFIED") candidate = recoverExactEvidence(document, fieldName, candidate);
  const contextPattern = fieldName === "referencePriceEstimate"
    ? /ราคากลาง|ราคาอ้างอิง/
    : /วงเงินงบประมาณ/;
  const opposingPattern = fieldName === "referencePriceEstimate"
    ? /วงเงินงบประมาณ/
    : /ราคากลาง|ราคาอ้างอิง/;
  // Gemini sometimes returns an exact amount quote without the immediately
  // preceding heading that establishes which price field it belongs to. When
  // that happens, rebuild an exact source quote from the previous line plus
  // the amount line. This remains deterministic and auditable: the expanded
  // quote must itself occur exactly once in the source document.
  if (
    candidate.evidenceStatus !== "VERIFIED" ||
    !contextPattern.test(candidate.quote || "") ||
    opposingPattern.test(candidate.quote || "")
  ) {
    let contextualCandidate = candidate.evidenceStatus === "VERIFIED"
      ? expandVerifiedEvidenceToContext(document, candidate, contextPattern, 3, opposingPattern)
      : candidate;
    if (
      contextualCandidate.evidenceStatus !== "VERIFIED" ||
      !contextPattern.test(contextualCandidate.quote || "") ||
      opposingPattern.test(contextualCandidate.quote || "")
    ) {
      contextualCandidate = recoverPriceEvidenceByContext(document, fieldName, candidate, contextPattern, opposingPattern);
    }
    if (
      contextualCandidate.evidenceStatus === "VERIFIED" &&
      contextPattern.test(contextualCandidate.quote || "") &&
      !opposingPattern.test(contextualCandidate.quote || "")
    ) {
      candidate = contextualCandidate;
    }
  }
  const amount = parseMoney(candidate.amountText || candidate.originalThaiText);
  const quote = candidate.quote || "";
  const contextSupported = contextPattern.test(quote) && !opposingPattern.test(quote);
  const isSupported = candidate.evidenceStatus === "VERIFIED" && contextSupported && amountOccursInQuote(amount, quote);
  return {
    ...candidate,
    fieldName,
    amount,
    currency: /บาท/.test(`${candidate.currencyText || ""} ${quote}`) ? "THB" : null,
    interpretationStatus: isSupported ? "RULE_SUPPORTED" : "REJECTED",
    interpretationReason: isSupported ? null : "price_context_or_amount_not_supported",
  };
}

const THAI_MONTHS = new Map([
  ["มกราคม", 1], ["ม.ค.", 1], ["กุมภาพันธ์", 2], ["ก.พ.", 2],
  ["มีนาคม", 3], ["มี.ค.", 3], ["เมษายน", 4], ["เม.ย.", 4],
  ["พฤษภาคม", 5], ["พ.ค.", 5], ["มิถุนายน", 6], ["มิ.ย.", 6],
  ["กรกฎาคม", 7], ["ก.ค.", 7], ["สิงหาคม", 8], ["ส.ค.", 8],
  ["กันยายน", 9], ["ก.ย.", 9], ["ตุลาคม", 10], ["ต.ค.", 10],
  ["พฤศจิกายน", 11], ["พ.ย.", 11], ["ธันวาคม", 12], ["ธ.ค.", 12],
]);

function parseThaiDate(value) {
  const normalized = thaiDigitsToArabic(value).replace(/พ\.ศ\.?/g, " ").replace(/\s+/g, " ").trim();
  const monthPattern = [...THAI_MONTHS.keys()].sort((a, b) => b.length - a.length).map((name) => name.replace(/\./g, "\\.")).join("|");
  const match = normalized.match(new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{4})`));
  if (!match) return null;
  const day = Number(match[1]);
  const month = THAI_MONTHS.get(match[2]);
  const statedYear = Number(match[3]);
  const year = statedYear >= 2400 && statedYear <= 2700 ? statedYear - 543 : statedYear;
  if (!month || year < 1900 || year > 2200) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseTimeWindow(value) {
  const matches = [...thaiDigitsToArabic(value).matchAll(/(\d{1,2})[.:](\d{2})/g)]
    .map((match) => ({ hour: Number(match[1]), minute: Number(match[2]) }))
    .filter(({ hour, minute }) => hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)
    .map(({ hour, minute }) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  if (!matches.length) return { start: null, end: null };
  return { start: matches.length > 1 ? matches[0] : null, end: matches[matches.length - 1] };
}

function verifyDeadlineCandidate(document, groupName, rawCandidate) {
  let candidate = verifyWithRecovery(document, rawCandidate);
  if (candidate.evidenceStatus !== "VERIFIED") candidate = recoverExactEvidence(document, groupName, candidate);
  const quote = candidate.quote || "";
  const normalizedDate = parseThaiDate(candidate.dateText);
  const time = parseTimeWindow(candidate.timeText);
  const eventSupported = groupName === "biddingClosingDate" &&
    /ยื่นข้อเสนอ|เสนอราคา/.test(quote) &&
    !/รับฟังความคิดเห็น|วิจารณ์|ข้อเสนอแนะ|เปิดซอง|ประกาศขึ้นเว็บ/.test(quote);
  const isSupported = candidate.evidenceStatus === "VERIFIED" && normalizedDate && eventSupported;
  return {
    ...candidate,
    normalizedDate,
    submissionWindow: time,
    closingDateTime: isSupported && time.end ? `${normalizedDate}T${time.end}:00+07:00` : null,
    timezone: isSupported && time.end ? "Asia/Bangkok" : null,
    interpretationStatus: isSupported ? "RULE_SUPPORTED" : "REJECTED",
    interpretationReason: isSupported ? null : "deadline_event_or_date_not_supported",
  };
}

function verifyTorItem(document, rawCandidate) {
  const candidate = verifyWithRecovery(document, rawCandidate);
  const labelEligible = ["TOR", "BIDDING_NOTICE", "DRAFT_NOTICE"].includes(document.label);
  const context = `${candidate.textThai || ""} ${candidate.quote || ""}`;
  let section = candidate.section;
  if (/หนังสือรับรอง.*ตัวแทน|ผู้จัดการโครงการ|บุคลากร.*ประสบการณ์|ประสบการณ์.*โครงการ/.test(context)) {
    section = "qualification_project_specific";
  } else if (/มีความสามารถตามกฎหมาย|บุคคลล้มละลาย|เลิกกิจการ|ผู้ทิ้งงาน|ผลประโยชน์ร่วมกัน|ลงทะเบียน.*(?:e-GP|จัดซื้อจัดจ้างภาครัฐ)|นิติบุคคลผู้มีอาชีพ|มูลค่าสุทธิของกิจการ|ทุนจดทะเบียน|วงเงินสินเชื่อ/.test(context)) {
    section = "qualification_general";
  }
  const deliverableSupported = section !== "deliverable" || /ส่งมอบ|รายงาน|เอกสาร|คู่มือ|ฝึกอบรม|อบรม/.test(context);
  const isSupported = candidate.evidenceStatus === "VERIFIED" && labelEligible && deliverableSupported &&
    TOR_SECTIONS.includes(section) && Boolean(String(candidate.textThai || "").trim());
  return {
    ...candidate,
    section,
    interpretationStatus: isSupported ? "RULE_SUPPORTED" : "REJECTED",
    interpretationReason: isSupported ? null : deliverableSupported ? "summary_item_not_supported" : "deliverable_context_not_supported",
  };
}

function verifyLifecycleCandidate(document, rawCandidate) {
  const candidate = verifyWithRecovery(document, rawCandidate);
  const quote = candidate.quote || "";
  const lifecycle = candidate.lifecycleCandidate;
  const isSupported = candidate.evidenceStatus === "VERIFIED" && (
    (lifecycle === "draft" && /ร่าง/.test(quote)) ||
    (lifecycle === "invitation" && /ประกาศ.*ประกวดราคา|เอกสารประกวดราคา|เชิญชวน/.test(quote))
  );
  return {
    ...candidate,
    interpretationStatus: isSupported ? "RULE_SUPPORTED" : "REJECTED",
    interpretationReason: isSupported ? null : "lifecycle_not_supported_by_quote",
  };
}

function supported(candidate) {
  return candidate.evidenceStatus === "VERIFIED" && candidate.interpretationStatus === "RULE_SUPPORTED";
}

module.exports = {
  PRICE_FIELDS,
  TOR_SECTIONS,
  normalizeText,
  normalizeMoneyToken,
  parseMoney,
  parseThaiDate,
  parseTimeWindow,
  recoverExactEvidence,
  expandVerifiedEvidenceToContext,
  recoverPriceEvidenceByContext,
  supported,
  verifyDeadlineCandidate,
  verifyExactQuote,
  verifyLifecycleCandidate,
  verifyPriceCandidate,
  verifyTorItem,
  verifyWithRecovery,
};
