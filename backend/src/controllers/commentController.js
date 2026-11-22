const Comment = require("../models/Comment");
const Tor = require("../models/Tor");
const mongoose = require("mongoose");
async function ownerEmail(projectId) {
    if (!mongoose.isValidObjectId(projectId)) return null;
    const tor = await Tor.findById(projectId).select('ownerId').lean();
    // Ownership comes from the creator saved on this TOR, regardless of role.
    return tor?.ownerId?.trim().toLowerCase() || null;
}
function withOwner(comment, owner) {
    const value = comment.toObject ? comment.toObject() : comment;
    return { ...value, isTorOwner: !!owner && String(value.userId).trim().toLowerCase() === owner };
}

// get comment
async function getComments(req, res) {
    try {
        const { projectId } = req.params;
    
        if (!projectId) {
            return res.status(400).json({
            success: false,
            error: "projectId is required",
            });
        }
  
        const comments = await Comment.find({
            projectId,
        })
            .sort({ createdAt: -1 })
            .lean();
  
        const owner = await ownerEmail(projectId);
        return res.json({
            success: true,
            data: comments.map(comment => withOwner(comment, owner)),
        });
    } catch (error) {
        console.error("Get comments error:", error);
  
        return res.status(500).json({
            success: false,
            error: "ไม่สามารถโหลดความคิดเห็นได้",
        });
    }
}

// create comment
async function createComment(req, res) {
    try {
        const {
            userId,
            userName,
            projectId,
            content,
            parentId = null,
        } = req.body;
        const authorId = req.profileEmail || userId;
    
        if (
            !authorId ||
            !userName ||
            !projectId ||
            typeof content !== "string" || !content.trim() || content.trim().length > 1000
        ) {
            return res.status(400).json({
            success: false,
            error: "กรุณากรอกข้อมูลความคิดเห็นให้ครบ",
            });
        }
    
        if (parentId) {
            if (!mongoose.isValidObjectId(parentId)) return res.status(400).json({ success: false, error: "Invalid parent comment ID" });
            const parent = await Comment.findOne({ _id: parentId, projectId });
            if (!parent) return res.status(404).json({ success: false, error: "ไม่พบความคิดเห็นต้นทางใน TOR นี้" });
        }
        const owner = await ownerEmail(projectId);
        const comment = await Comment.create({
            userId: authorId,
            parentId,
            userName,
            projectId,
            content: content.trim(),
        });
    
        return res.status(201).json({
            success: true,
            data: withOwner(comment, owner),
        });
    } catch (error) {
        console.error("Create comment error:", error);
    
        return res.status(500).json({
            success: false,
            error: "ไม่สามารถเพิ่มความคิดเห็นได้",
        });
    }
}

// delete comment
async function deleteComment(req, res) {
    try {
        const { commentId } = req.params;
        const userId = req.profileEmail || req.body.userId;
    
        if (!commentId || !userId) {
            return res.status(400).json({
            success: false,
            error: "commentId and userId are required",
            });
        }
    
        const comment =
            await Comment.findOne({
            _id: commentId,
            userId,
            });
    
        if (!comment) {
            return res.status(404).json({
            success: false,
            error: "ไม่พบความคิดเห็นหรือไม่มีสิทธิ์ลบ",
            });
        }
  
        await Comment.deleteOne({
            _id: commentId,
        });
    
        return res.json({
            success: true,
            data: {
            commentId,
            },
        });
    } catch (error) {
        console.error("Delete comment error:", error);
    
        return res.status(500).json({
            success: false,
            error: "ไม่สามารถลบความคิดเห็นได้",
        });
    }
}

module.exports = { getComments, createComment, deleteComment,};
