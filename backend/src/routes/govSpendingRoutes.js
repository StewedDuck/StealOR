const express = require('express');
const router = express.Router();
const GovProject = require('../models/GovProject');

router.get('/departments', async (req, res) => {
  try {
    const token = process.env.GOVSPENDING_USER_TOKEN;
    const baseUrl = process.env.GOVSPENDING_BASE_URL || 'https://opend.data.go.th/govspending/service';

    const url = `${baseUrl}/egp-contract?api-key=${token}&year=2568&limit=1000&dept_code=3100001`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });

    if (!response.ok) {
      throw new Error(`GovSpending API responded with status ${response.status}`);
    }

    const data = await response.json();
    const rawData = data?.result || data?.data || [];

    const subDeptSet = new Set();
    rawData.forEach(item => {
      if (item.dept_sub_name) {
        subDeptSet.add(item.dept_sub_name);
      }
    });

    return res.status(200).json({
      success: true,
      totalContractsAnalyzed: rawData.length,
      totalUniqueSubDepartments: subDeptSet.size,
      subDepartments: Array.from(subDeptSet).sort()
    });

  } catch (error) {
    console.error('Dept Extraction Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const fs = require('fs');
const path = require('path');

router.get('/sync/count', async (req, res) => {
  try {
    const token = process.env.GOVSPENDING_USER_TOKEN;
    const baseUrl = process.env.GOVSPENDING_BASE_URL || 'https://opend.data.go.th/govspending/service';
    
    const years = ['2565', '2566', '2567', '2568', '2569'];
    let allRawData = [];

    for (const yr of years) {
      const url = `${baseUrl}/egp-contract?api-key=${token}&year=${yr}&limit=1000&dept_code=3100001`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (response.ok) {
        const data = await response.json();
        const records = data?.result || data?.data || [];
        allRawData = allRawData.concat(records);
      }
    }

    const techKeywords = [
      'ซอฟต์แวร์', 'software', 'สารสนเทศ', 'it', 'คอมพิวเตอร์', 'automation', 'อัตโนมัติ', 'ระบบอัตโนมัติ', 'robotics', 'หุ่นยนต์', 'data', 'ข้อมูล', 'analytics', 'วิเคราะห์',
      'computer', 'ดิจิทัล', 'digital', 'เครือข่าย', 'network', 'เทคโนโลยี', 'technology', 'ระบบสารสนเทศ', 'information system', 'ระบบ',
      'ฐานข้อมูล', 'database', 'เว็บไซต์', 'website', 'app', 'application', 'แอปพลิเคชัน', 'cloud', 'คลาวด์', 'ai', 'ปัญญาประดิษฐ์', 'cybersecurity', 'ความปลอดภัยไซเบอร์'
    ];

    const matchedProjects = allRawData.filter(p => {
      const status = p.contract_status || '';
      const isNotCanceled = !status.includes('ยกเลิก') && !status.includes('สิ้นสุด');
      
      const projectName = (p.project_name || '').toLowerCase();
      const isTechKeywordMatch = techKeywords.some(keyword => projectName.includes(keyword));

      return isNotCanceled && isTechKeywordMatch;
    });

    const payload = {
      success: true,
      generatedAt: new Date().toISOString(),
      totalFetchedAcrossAllYears: allRawData.length,
      matchingCount: matchedProjects.length,
      matchedProjects: matchedProjects.map(p => ({
        id: p.project_id,
        year: p.budget_year,
        name: p.project_name,
        subDept: p.dept_sub_name,
        budget: p.budget_amount,
        raw_data: p // Keeps all original parameters for your friend
      }))
    };

    // SAVE FILE DIRECTLY TO PROJECT FOLDER
    const filePath = path.join(__dirname, '../matched_projects.json');
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

    return res.status(200).json({
      success: true,
      message: `Successfully filtered and saved ${matchedProjects.length} projects to matched_projects.json`,
      fileLocation: 'matched_projects.json'
    });

  } catch (error) {
    console.error('Count Check Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const token = process.env.GOVSPENDING_USER_TOKEN;
    const baseUrl = process.env.GOVSPENDING_BASE_URL || 'https://opend.data.go.th/govspending/service';

    const years = ['2565', '2566', '2567', '2568', '2569'];
    let allRawData = [];

    for (const yr of years) {
      const url = `${baseUrl}/egp-contract?api-key=${token}&year=${yr}&limit=1000&dept_code=3100001`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (response.ok) {
        const data = await response.json();
        const records = data?.result || data?.data || [];
        allRawData = allRawData.concat(records);
      }
    }

    const techKeywords = [
      'ซอฟต์แวร์', 'software', 'สารสนเทศ', 'it', 'คอมพิวเตอร์', 'automation', 'อัตโนมัติ', 'ระบบอัตโนมัติ', 'robotics', 'หุ่นยนต์', 'data', 'ข้อมูล', 'analytics', 'วิเคราะห์',
      'computer', 'ดิจิทัล', 'digital', 'เครือข่าย', 'network', 'เทคโนโลยี', 'technology', 'ระบบสารสนเทศ', 'information system', 'ระบบ',
      'ฐานข้อมูล', 'database', 'เว็บไซต์', 'website', 'app', 'application', 'แอปพลิเคชัน', 'cloud', 'คลาวด์', 'ai', 'ปัญญาประดิษฐ์', 'cybersecurity', 'ความปลอดภัยไซเบอร์'
    ];

    const activeProjects = allRawData.filter(p => {
      const status = p.contract_status || '';
      const isNotCanceled = !status.includes('ยกเลิก') && !status.includes('สิ้นสุด');
      
      const projectName = (p.project_name || '').toLowerCase();
      const isTechKeywordMatch = techKeywords.some(keyword => projectName.includes(keyword));

      return isNotCanceled && isTechKeywordMatch;
    });

    const bulkOps = activeProjects.map(item => ({
      updateOne: {
        filter: { project_id: String(item.project_id) },
        update: {
          $set: {
            project_id: String(item.project_id),
            project_name: item.project_name,
            dept_name: item.dept_name,
            dept_sub_name: item.dept_sub_name,
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
      message: `Successfully synced ${activeProjects.length} tech-relevant Bangkok records across 5 years.`,
      upsertedCount: dbResult?.upsertedCount || 0,
      dataCount: activeProjects.length
    });

  } catch (error) {
    console.error('GovSpending Sync Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

