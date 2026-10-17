const { isUsableDocumentReference, canonicalLocatorIdentity } =
  require("./egp/documentReferencePolicy");

function asPlainObject(value) {
  if (!value || typeof value !== "object") return {};
  return typeof value.toObject === "function"
    ? value.toObject({ depopulate: true })
    : value;
}

function sameSelectedDraft(projectId, stored, observed) {
  if (!isUsableDocumentReference("draftEbidding", stored, projectId) ||
      !isUsableDocumentReference("draftEbidding", observed, projectId)) return false;
  if (canonicalLocatorIdentity(projectId, "draftEbidding", stored) !==
      canonicalLocatorIdentity(projectId, "draftEbidding", observed)) return false;
  return [
    "lookupMethod", "downloadMethod", "fileId", "fileName", "downloadUrl",
    "revision", "version", "legacyItemNo", "legacyTypeId", "legacyDocType",
    "legacyMethodId", "legacyStepId",
  ].every((field) => (stored[field] ?? null) === (observed[field] ?? null));
}

function normalizedDeadline(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function planDraftDeadlineBackfill(projectInput, observedInput) {
  const project = asPlainObject(projectInput);
  const projectId = String(project.project_id || "").trim();
  const stored = asPlainObject(project.documents?.draftEbidding);
  const observed = asPlainObject(observedInput);
  const previous = normalizedDeadline(stored.commentDeadlineAt);
  const hasStoredDeadline = stored.commentDeadlineAt != null;

  if (observed.status === "error" || observed.status === "ambiguous") {
    return { projectId, outcome: "unverified", operation: null };
  }

  const matched = sameSelectedDraft(projectId, stored, observed);
  const next = matched ? normalizedDeadline(observed.commentDeadlineAt) : null;
  if (!matched && !hasStoredDeadline) {
    return { projectId, outcome: "zip_mismatch_or_unavailable", operation: null };
  }
  if (previous === next && (next !== null || !hasStoredDeadline)) {
    return { projectId, outcome: "unchanged", operation: null };
  }

  return {
    projectId,
    outcome: matched ? (next ? "set_deadline" : "clear_unverified_deadline")
      : "clear_stale_deadline",
    previous,
    next,
    operation: {
      updateOne: {
        // Match the complete stored reference so a concurrent ZIP refresh or
        // deadline write cannot be overwritten by this date-only backfill.
        filter: {
          _id: project._id,
          project_id: projectId,
          "documents.draftEbidding": stored,
        },
        update: { $set: { "documents.draftEbidding.commentDeadlineAt": next ? new Date(next) : null } },
        upsert: false,
      },
    },
  };
}

module.exports = { planDraftDeadlineBackfill, sameSelectedDraft };
