// Defines the shared structured error used across extraction modules
// so failures retain a stable code, pipeline stage, and diagnostic details.
class GovProjectDocumentExtractionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GovProjectDocumentExtractionError";
    this.code = code;
    this.stage = details.stage || "extraction";
    this.details = details;
  }
}

function extractionError(code, message, details = {}) {
  return new GovProjectDocumentExtractionError(code, message, details);
}

module.exports = {
  GovProjectDocumentExtractionError,
  extractionError,
};
