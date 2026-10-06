require("dotenv").config({ quiet: true });

const {
  VertexConfigurationError,
  getVertexConfig,
} = require("../src/config/vertex");
const {
  formatVertexError,
  runVertexSmokeTest,
} = require("../src/services/vertexAIService");

async function main() {
  let config;

  try {
    config = getVertexConfig();
    const response = await runVertexSmokeTest({ config });
    console.log(response);
  } catch (error) {
    if (error instanceof VertexConfigurationError) {
      console.error(`Vertex AI configuration error: ${error.message}`);
    } else {
      console.error(formatVertexError(error, config));
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
