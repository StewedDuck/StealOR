const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_LOCATION = "global";
const DEFAULT_MODEL = "gemini-2.5-flash";

class VertexConfigurationError extends Error {
  constructor(message, reason) {
    super(message);
    this.name = "VertexConfigurationError";
    this.code = "VERTEX_CONFIGURATION_ERROR";
    this.reason = reason;
  }
}

function requiredProjectId(value) {
  const projectId = String(value || "").trim();
  if (!projectId || projectId === "YOUR_PROJECT_ID") {
    throw new VertexConfigurationError(
      "VERTEX_AI_PROJECT_ID is required. Set it to the Google Cloud project ID that has Vertex AI enabled.",
      "missing_project_id"
    );
  }
  return projectId;
}

function requiredCredentialPath(value, dependencies = {}) {
  const configuredPath = String(value || "").trim();
  if (!configuredPath) {
    throw new VertexConfigurationError(
      "GOOGLE_APPLICATION_CREDENTIALS is required. Set it to the service-account JSON key path.",
      "missing_credential_path"
    );
  }

  const resolvePath = dependencies.resolvePath || path.resolve;
  const fileExists = dependencies.fileExists || fs.existsSync;
  const credentialsPath = resolvePath(configuredPath);

  if (!fileExists(credentialsPath)) {
    throw new VertexConfigurationError(
      `Service-account credential file not found: ${credentialsPath}`,
      "credential_file_not_found"
    );
  }

  return credentialsPath;
}

function optionalSetting(value, fallback, name) {
  const setting = String(value || fallback).trim();
  if (!setting) {
    throw new VertexConfigurationError(`${name} must not be empty.`);
  }
  return setting;
}

function getVertexConfig(env = process.env, dependencies = {}) {
  return Object.freeze({
    project: requiredProjectId(env.VERTEX_AI_PROJECT_ID),
    location: optionalSetting(
      env.VERTEX_AI_LOCATION,
      DEFAULT_LOCATION,
      "VERTEX_AI_LOCATION"
    ),
    model: optionalSetting(env.VERTEX_AI_MODEL, DEFAULT_MODEL, "VERTEX_AI_MODEL"),
    credentialsPath: requiredCredentialPath(
      env.GOOGLE_APPLICATION_CREDENTIALS,
      dependencies
    ),
  });
}

module.exports = {
  DEFAULT_LOCATION,
  DEFAULT_MODEL,
  VertexConfigurationError,
  getVertexConfig,
  requiredCredentialPath,
};
