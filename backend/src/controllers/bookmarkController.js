const Bookmark = require("../models/Bookmark");
const GovProject = require("../models/GovProject");
const Tor = require("../models/Tor");

async function createBookmark(req, res) {
    try {
        const {
            userId,
            source = "government",
            projectId,
            torId,
            savedFrom = "market",
            match = null,
        } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: "User id is required",
            });
        }

        if (source === "goverment" && !projectId) {
            return res.status(400).json({
                success: false,
                error: "Project id is required"
            });
        }

        if (source === "internal" && !torId) {
            return res.status(400).json({
                success: false,
                error: "TOR id is required",
              });
        }

        if (source === "government") {
            const project = await GovProject.findOne({
                project_id: projectId,
            });

            if (!project) {
                return res.status(404).json({
                    success: false,
                    error: "Government TOR not found",
                });
            }
        }

        if (source === "internal") {
            const tor = await Tor.findById(torId);
      
            if (!tor) {
                return res.status(404).json({
                    success: false,
                    error: "TOR not found",
                });
            }
        }

        const existingQuery = {
            userId,
            source,
        };

        if (source === "government") {
            existingQuery.projectId = projectId;
        } else {
            existingQuery.torId = torId;
        }

        const existing = await Bookmark.findOne(existingQuery);

        if (existing) {
            return res.json ({
                success: true,
                data: existing,
                message: "TOR already bookmarked",
            });
        }

        const bookmark = await Bookmark.create({
            userId,
            source,
            projectId: source === "government" ? projectId : null,
            torId: source === "internal" ? torId : null,
            savedFrom,
            match,
        });

        return res.status(201).json({
            success: true,
            data: bookmark,
            message: "TOR bookmarked successfully",
        });
    } catch (error) {
        console.error("Create bookmark error:", error);

        return res.status(400).json({
            success: false,
            error: "Failed to bookmark TOR"
        });
    }
}

async function getBookmarks(req, res) {
    try {
        const userId = req.query.userId;
    
        if (!userId) {
            return res.status(400).json({
            success: false,
            error: "User id is required",
            });
        }
  
        const bookmarks = await Bookmark.find({
            userId,
        }).sort({ createdAt: -1 });
  
        const data = [];
  
        for (const bookmark of bookmarks) {
            // Government TOR
            if (
                bookmark.source === "government" &&
                bookmark.projectId
            ) {
                const project = await GovProject.findOne({
                    project_id: bookmark.projectId,
                }).lean();
        
                if (!project) {
                    continue;
                }
        
                const raw = project.raw_data || {};
    
                data.push({
                    bookmarkId: bookmark._id.toString(),
        
                    source: "government",
                    projectId: project.project_id,
        
                    projectName:
                    project.project_name ||
                    raw.project_name ||
                    "ไม่ระบุชื่อโครงการ",
        
                    agencyName:
                    project.dept_name ||
                    raw.dept_name ||
                    "ไม่ระบุหน่วยงาน",
        
                    budget:
                    project.sum_price_agree ||
                    project.budget_amount ||
                    0,
        
                    deadline:
                    raw.submission_deadline ||
                    raw.deadline ||
                    raw.project_end_date ||
                    null,
        
                    status:
                    project.contract_status ||
                    raw.contract_status ||
                    "Active",
        
                    description:
                    raw.project_description ||
                    raw.description ||
                    "",
        
                    createdAt: project.createdAt,
                    updatedAt: project.updatedAt,
        
                    savedFrom: bookmark.savedFrom,
        
                    // ตอนกดจาก Market = null
                    match: bookmark.match || null,
        
                    savedAt: bookmark.createdAt,
                });
            }
  
            // Internal TOR
            if (
            bookmark.source === "internal" &&
            bookmark.torId
            ) {
            const tor = await Tor.findById(
                bookmark.torId
            ).lean();
    
            if (!tor) {
                continue;
            }
    
            data.push({
                bookmarkId: bookmark._id.toString(),
    
                source: "internal",
                torId: tor._id.toString(),
    
                projectName: tor.projectName,
                agencyName: tor.agencyName,
                budget: tor.budget,
                deadline: tor.submissionDeadline,
                status: tor.status,
    
                description: tor.description,
    
                objectives: tor.objectives,
                scopeOfWork: tor.scopeOfWork,
                requirements: tor.requirements,
    
                createdAt: tor.createdAt,
                updatedAt: tor.updatedAt,
    
                savedFrom: bookmark.savedFrom,
    
                match: bookmark.match || null,
    
                savedAt: bookmark.createdAt,
            });
            }
        }
  
        return res.json({
            success: true,
            total: data.length,
            data,
        });
    } 
    catch (error) {
        console.error("Get bookmarks error:", error);
        
        return res.status(500).json({
            success: false,
            error: "Failed to retrieve bookmarks",
        });
    }
}
  
  
async function deleteBookmark(req, res) {
    try {
        const {
            projectId,
            userId,
        } = req.params;
  
        if (!userId) {
            return res.status(400).json({
            success: false,
            error: "User id is required",
            });
        }
  
        const bookmark = await Bookmark.findOneAndDelete({
            userId,
            source: "government",
            projectId,
        });
  
        if (!bookmark) {
            return res.status(404).json({
            success: false,
            error: "Bookmark not found",
            });
        }
  
        return res.json({
            success: true,
            data: {
            projectId,
            },
            message: "Bookmark removed successfully",
        });
    } 
    catch (error) {
        console.error("Delete bookmark error:", error);
  
        return res.status(500).json({
            success: false,
            error: "Failed to remove bookmark",
        });
    }
}
  
  
module.exports = {
    createBookmark,
    getBookmarks,
    deleteBookmark,
};
