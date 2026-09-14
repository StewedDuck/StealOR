const Comment = require("../models/Comment");

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
  
        return res.json({
            success: true,
            data: comments,
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
        } = req.body;
    
        if (
            !userId ||
            !userName ||
            !projectId ||
            !content?.trim()
        ) {
            return res.status(400).json({
            success: false,
            error: "กรุณากรอกข้อมูลความคิดเห็นให้ครบ",
            });
        }
    
        const comment = await Comment.create({
            userId,
            userName,
            projectId,
            content: content.trim(),
        });
    
        return res.status(201).json({
            success: true,
            data: comment,
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
        const { userId } = req.body;
    
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
