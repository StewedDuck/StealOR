async function fetchProjectDetails(year, projectId) {
  const userToken = process.env.GOVSPENDING_USER_TOKEN;
  const baseUrl = process.env.GOVSPENDING_BASE_URL || "https://govspendingapi.data.go.th/api/service";

  if (!userToken) {
    throw new Error("GOVSPENDING_USER_TOKEN is missing from .env");
  }

  const endpoint = `${baseUrl}/cgdcontract`;
  const params = new URLSearchParams({
    user_token: userToken,
    year: year.toString(),
    project_id: projectId,
  });

  const response = await fetch(`${endpoint}?${params.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`GovSpending API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

module.exports = { fetchProjectDetails };