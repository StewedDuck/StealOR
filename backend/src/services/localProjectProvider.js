const fs = require("fs/promises");
const path = require("path");

const DEFAULT_DATA_FILE = path.join(
  __dirname,
  "..",
  "data",
  "software_tor_5.json"
);

function normalizeProject(rawProject) {
  return {
    ...rawProject,
    budget_amount: rawProject.budget_amount ?? rawProject.project_money ?? 0,
    contract_status:
      rawProject.contract_status ?? rawProject.project_status ?? null,
  };
}

async function getLocalFilteredProjects(
  { dataFile = DEFAULT_DATA_FILE, limit } = {}
) {
  const contents = await fs.readFile(dataFile, "utf8");
  const payload = JSON.parse(contents);

  if (!Array.isArray(payload.matchedProjects)) {
    throw new TypeError(
      "Local project data must contain a matchedProjects array"
    );
  }

  const projects = payload.matchedProjects.map((match, index) => {
    if (!match?.raw_data || typeof match.raw_data !== "object") {
      throw new TypeError(
        `matchedProjects[${index}] must contain a raw_data object`
      );
    }

    return normalizeProject(match.raw_data);
  });

  if (limit === undefined) return projects;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }

  return projects.slice(0, limit);
}

module.exports = {
  getLocalFilteredProjects,
};
