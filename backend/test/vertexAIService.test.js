const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_LOCATION,
  DEFAULT_MODEL,
  getVertexConfig,
} = require("../src/config/vertex");
const {
  SMOKE_TEST_PROMPT,
  createVertexAIClient,
  formatVertexError,
  runVertexSmokeTest,
} = require("../src/services/vertexAIService");

test("Vertex configuration requires a Google Cloud project ID", () => {
  assert.throws(
    () => getVertexConfig({}),
    (error) =>
      error.code === "VERTEX_CONFIGURATION_ERROR" &&
      /GOOGLE_CLOUD_PROJECT/.test(error.message)
  );
});

test("Vertex configuration uses small, stable smoke-test defaults", () => {
  assert.deepEqual(getVertexConfig({ GOOGLE_CLOUD_PROJECT: "stealor-dev" }), {
    project: "stealor-dev",
    location: DEFAULT_LOCATION,
    model: DEFAULT_MODEL,
  });
});

test("Vertex client explicitly selects Vertex AI and the stable API", () => {
  let receivedOptions;
  class FakeGoogleGenAI {
    constructor(options) {
      receivedOptions = options;
    }
  }

  createVertexAIClient(
    { project: "stealor-dev", location: "global", model: DEFAULT_MODEL },
    { GoogleGenAI: FakeGoogleGenAI }
  );

  assert.deepEqual(receivedOptions, {
    vertexai: true,
    project: "stealor-dev",
    location: "global",
    apiVersion: "v1",
  });
});

test("smoke test sends only the fixed tiny prompt without a real request", async () => {
  let request;
  const client = {
    models: {
      generateContent: async (value) => {
        request = value;
        return { text: "Vertex connection successful" };
      },
    },
  };

  const response = await runVertexSmokeTest({
    client,
    config: {
      project: "stealor-dev",
      location: "global",
      model: "gemini-2.5-flash",
    },
  });

  assert.equal(response, "Vertex connection successful");
  assert.equal(request.contents, SMOKE_TEST_PROMPT);
  assert.equal(request.config.maxOutputTokens, 16);
  assert.equal(request.config.temperature, 0);
  assert.equal(request.config.candidateCount, 1);
  assert.deepEqual(request.config.thinkingConfig, { thinkingBudget: 0 });
  assert.equal("pdf" in request, false);
});

test("common Vertex setup errors include actionable guidance", () => {
  const config = {
    project: "stealor-dev",
    location: "global",
    model: "gemini-2.5-flash",
  };

  assert.match(
    formatVertexError(new Error("Could not load the default credentials"), config),
    /gcloud auth application-default login/
  );
  assert.match(
    formatVertexError(
      new Error("API aiplatform.googleapis.com has not been used or is disabled"),
      config
    ),
    /gcloud services enable aiplatform.googleapis.com/
  );
  assert.match(
    formatVertexError(Object.assign(new Error("Permission denied"), { status: 403 }), config),
    /roles\/aiplatform\.user/
  );
  assert.match(
    formatVertexError(Object.assign(new Error("Model not found"), { status: 404 }), config),
    /model or region is unavailable/
  );
});
