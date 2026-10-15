const {
  EGP_BASE_URL,
  LEGACY_DRAFT_DISCOVERY_PATH,
  LEGACY_DRAFT_TYPES,
} = require("./constants");
const { request, readMetadataJson } = require("./transport");

// The public Draft list uses buildName for the same template ID that Process 5
// returns as buildName2. Match that ID, never a project-wide or older date.
async function lookupSelectedDraftCommentDeadline(projectId, templateId, revision, options = {}) {
  if (!templateId) return null;

  const matching = [];
  try {
    for (const { typeId } of LEGACY_DRAFT_TYPES) {
      const url = new URL(LEGACY_DRAFT_DISCOVERY_PATH, EGP_BASE_URL);
      for (const [key, value] of Object.entries({
        projectId,
        methodId: "16",
        projectVersion: "3",
        typeProject: "6",
        stepId: "C01",
        typeId,
      })) {
        url.searchParams.set(key, value);
      }
      const response = await request(url, {
        ...options,
        headers: { ...options.headers, Accept: "application/json" },
      });
      const payload = await readMetadataJson(response, "Draft comment deadline");
      if (String(payload?.response?.responseCode ?? "") !== "0" ||
          !Array.isArray(payload?.data)) {
        return null;
      }
      matching.push(...payload.data.filter((record) =>
        String(record?.projectId || "") === projectId &&
        String(record?.buildName || "") === templateId &&
        String(record?.stepId || "") === (revision === 0 ? "D03" : "U03")
      ));
    }
  } catch (_error) {
    // Date metadata is optional. A failed lookup must not make a valid ZIP
    // unavailable or change the Primary/Fallback/Legacy discovery result.
    return null;
  }

  if (matching.length === 0) return null;
  const dates = new Set();
  for (const record of matching) {
    if (typeof record.commentFDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(record.commentFDate)) {
      return null;
    }
    const date = new Date(record.commentFDate);
    if (!Number.isFinite(date.getTime())) return null;
    dates.add(date.toISOString());
  }
  return dates.size === 1 ? dates.values().next().value : null;
}

module.exports = { lookupSelectedDraftCommentDeadline };
