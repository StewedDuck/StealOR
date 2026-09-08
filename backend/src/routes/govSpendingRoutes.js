const express = require('express');
const router = express.Router();
const GovProject = require('../models/GovProject');

router.post('/sync', async (req, res) => {
  try {
    const { year = '2568', limit = 100 } = req.body;
    const token = process.env.GOVSPENDING_USER_TOKEN;

    // Correct URL mapping from official documentation:
    // Base URL: https://opend.data.go.th/govspending/service
    // Endpoint: egp-contract
    const baseUrl = process.env.GOVSPENDING_BASE_URL || 'https://opend.data.go.th/govspending/service';
    const url = `${baseUrl}/egp-contract?api-key=${token}&year=${year}&limit=${limit}`;

    console.log('Fetching GovSpending API:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      throw new Error(`GovSpending API responded with status ${response.status}`);
    }

    const data = await response.json();
    const rawData = data?.result || data?.data || [];

    // Filter out canceled or completed projects
    const activeProjects = Array.isArray(rawData)
      ? rawData.filter(
          p => !p.contract_status?.includes('ยกเลิก') && !p.contract_status?.includes('สิ้นสุด')
        )
      : [];

    // Bulk Upsert into MongoDB Atlas
    const bulkOps = activeProjects.map(item => ({
      updateOne: {
        filter: { project_id: String(item.project_id) },
        update: {
          $set: {
            project_id: String(item.project_id),
            project_name: item.project_name,
            dept_name: item.dept_name,
            dept_code: item.dept_code,
            budget_amount: Number(item.budget_amount) || 0,
            sum_price_agree: Number(item.sum_price_agree) || 0,
            winner_tin: item.winner_tin || null,
            winner_name: item.winner_name || null,
            contract_status: item.contract_status,
            raw_data: item
          }
        },
        upsert: true
      }
    }));

    let dbResult = null;
    if (bulkOps.length > 0) {
      dbResult = await GovProject.bulkWrite(bulkOps);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${activeProjects.length} records into MongoDB.`,
      upsertedCount: dbResult?.upsertedCount || 0,
      modifiedCount: dbResult?.modifiedCount || 0,
      matchedCount: dbResult?.matchedCount || 0
    });

  } catch (error) {
    console.error('GovSpending Sync Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;