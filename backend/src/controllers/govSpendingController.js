const getGovSpendingData = async (req, res) => {
  const { 
    endpoint = "egp-contract", 
    year = 2568, 
    keyword, 
    dept_code, 
    limit = 100, 
    offset = 0 
  } = req.query;

  const token = process.env.GOVSPENDING_USER_TOKEN;
  const baseUrl = process.env.GOVSPENDING_BASE_URL || "https://opend.data.go.th/govspending/service";

  const params = new URLSearchParams({
    "api-key": token,
    year,
    limit: Math.min(parseInt(limit), 1000), // DGA max limit is 1000
    offset
  });

  if (keyword) params.append("keyword", keyword);
  if (dept_code) params.append("dept_code", dept_code);

  const targetUrl = `${baseUrl}/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      return res.status(response.status || 400).json({
        success: false,
        apiResponse: data
      });
    }

    // Filter out closed/completed projects if status field exists in the response payload
    const rawProjects = data.data || [];
    const activeProjects = rawProjects.filter(project => {
      // DGA flags completed/closed items under fields like contract_status or project_status
      const status = project.contract_status || project.project_status || "";
      return !status.includes("ยกเลิก") && !status.includes("สิ้นสุด");
    });

    return res.json({
      success: true,
      total_returned: activeProjects.length,
      total_available: data.total,
      data: activeProjects
    });
  } catch (err) {
    console.error("GovSpending Fetch Error:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

module.exports = { getGovSpendingData };