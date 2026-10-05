const { GoogleGenAI } = require("@google/genai");
const { getVertexConfig } = require("../config/vertex");

const SMOKE_TEST_PROMPT = "Return exactly: Vertex connection successful";

function createVertexAIClient(config = getVertexConfig(), dependencies = {}) {
  const Client = dependencies.GoogleGenAI || GoogleGenAI;
  return new Client({
    vertexai: true,
    project: config.project,
    location: config.location,
    apiVersion: "v1",
  });
}

async function runVertexSmokeTest(options = {}) {
  const config = options.config || getVertexConfig();
  const client = options.client || createVertexAIClient(config);
  const response = await client.models.generateContent({
    model: config.model,
    contents: SMOKE_TEST_PROMPT,
    config: {
      candidateCount: 1,
      maxOutputTokens: 16,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const text = String(response.text || "").trim();

  if (!text) {
    const error = new Error("Vertex AI returned an empty response.");
    error.code = "VERTEX_EMPTY_RESPONSE";
    throw error;
  }

  return text;
}

function formatVertexError(error, config = {}) {
  const message = String(error && error.message ? error.message : error);
  const normalized = message.toLowerCase();
  const status = Number(error && (error.status || error.statusCode || error.code));
  const project = config.project || "<project-id>";

  if (
    status === 401 ||
    normalized.includes("could not load the default credentials") ||
    normalized.includes("application default credentials") ||
    normalized.includes("invalid_grant") ||
    normalized.includes("unauthenticated")
  ) {
    return [
      "Vertex AI authentication failed.",
      "Run: gcloud auth application-default login",
      "Do not set GOOGLE_APPLICATION_CREDENTIALS when using local user ADC.",
      `Original error: ${message}`,
    ].join("\n");
  }

  if (
    normalized.includes("aiplatform.googleapis.com") &&
    (normalized.includes("disabled") || normalized.includes("has not been used"))
  ) {
    return [
      "The Vertex AI API is not enabled for this project.",
      `Run: gcloud services enable aiplatform.googleapis.com --project=${project}`,
      `Original error: ${message}`,
    ].join("\n");
  }

  if (status === 403 || normalized.includes("permission denied")) {
    return [
      "The authenticated identity does not have permission to call Vertex AI.",
      "Grant the identity an appropriate least-privilege role, commonly Vertex AI User (roles/aiplatform.user).",
      `Original error: ${message}`,
    ].join("\n");
  }

  if (
    status === 404 ||
    normalized.includes("not found") ||
    normalized.includes("not supported in location")
  ) {
    return [
      `The model or region is unavailable (model=${config.model || "unknown"}, location=${config.location || "unknown"}).`,
      "Check VERTEX_AI_MODEL and GOOGLE_CLOUD_LOCATION against the Vertex AI model availability documentation.",
      `Original error: ${message}`,
    ].join("\n");
  }

  if (status === 400 || normalized.includes("invalid argument")) {
    return [
      "Vertex AI rejected the request configuration.",
      "Check GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, and VERTEX_AI_MODEL.",
      `Original error: ${message}`,
    ].join("\n");
  }

  return `Vertex AI smoke test failed.\nOriginal error: ${message}`;
}

module.exports = {
  SMOKE_TEST_PROMPT,
  createVertexAIClient,
  formatVertexError,
  runVertexSmokeTest,
};
