const DEFAULT_LOCATION = "global";
const DEFAULT_MODEL = "gemini-2.5-flash";

class VertexConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VertexConfigurationError";
    this.code = "VERTEX_CONFIGURATION_ERROR";
  }
}

function requiredProjectId(value) {
  const projectId = String(value || "").trim();
  if (!projectId || projectId === "your-google-cloud-project-id") {
    throw new VertexConfigurationError(
      "GOOGLE_CLOUD_PROJECT is required. Set it to the Google Cloud project ID that has Vertex AI enabled."
    );
  }
  return projectId;
}

function optionalSetting(value, fallback, name) {
  const setting = String(value || fallback).trim();
  if (!setting) {
    throw new VertexConfigurationError(`${name} must not be empty.`);
  }
  return setting;
}

function getVertexConfig(env = process.env) {
  return Object.freeze({
    project: requiredProjectId(env.GOOGLE_CLOUD_PROJECT),
    location: optionalSetting(
      env.GOOGLE_CLOUD_LOCATION,
      DEFAULT_LOCATION,
      "GOOGLE_CLOUD_LOCATION"
    ),
    model: optionalSetting(env.VERTEX_AI_MODEL, DEFAULT_MODEL, "VERTEX_AI_MODEL"),
  });
}

module.exports = {
  DEFAULT_LOCATION,
  DEFAULT_MODEL,
  VertexConfigurationError,
  getVertexConfig,
};
