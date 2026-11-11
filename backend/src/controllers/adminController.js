// backend/src/controllers/adminController.js
const ActivityLog = require('../models/ActivityLog');
const { logActivity } = require("../utils/logger");

exports.getActivityLogs = async (req, res) => {
    
    try {
        const { category, search, page = 1, limit = 50 } = req.query;
        let query = {};

        // 1. ถ้ามีการส่ง category มา (และไม่ใช่ 'all') ให้เพิ่มในเงื่อนไขค้นหา
        if (category && category !== 'all') {
            query.category = category;
        }

        // 2. ถ้ามีการค้นหาด้วย Text (พิมพ์หาชื่อคนหรือเหตุการณ์)
        if (search) {
            query.$or = [
                { actorName: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } },
                { details: { $regex: search, $options: 'i' } }
            ];
        }

        // 3. คำนวณข้ามหน้า (Pagination)
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 4. ดึงข้อมูลจาก MongoDB
        const logs = await ActivityLog.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // 5. นับจำนวนทั้งหมดเพื่อใช้ทำหน้าถัดไปใน Frontend
        const total = await ActivityLog.countDocuments(query);

        res.status(200).json({
            success: true,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            data: logs
        });

    } catch (error) {
        console.error("Get Activity Logs Error:", error);
        res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบันทึกกิจกรรมได้" });
    }
};