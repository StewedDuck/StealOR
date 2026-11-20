import type { Comment } from './torApi';

// Keep replies grouped with their parent; never hide replies when a parent was deleted.
export function commentThreads(comments: Comment[]) {
    const byId = new Map(comments.map(comment => [comment._id, comment]));
    const children = new Map<string, Comment[]>();
    const roots: Comment[] = [];
    for (const comment of comments) {
        if (comment.parentId && byId.has(comment.parentId) && comment.parentId !== comment._id) {
            const siblings = children.get(comment.parentId) || [];
            siblings.push(comment); children.set(comment.parentId, siblings);
        } else roots.push(comment);
    }
    const result: { comment: Comment; depth: number; parent?: Comment }[] = [];
    const seen = new Set<string>();
    const visit = (comment: Comment, depth: number) => {
        if (seen.has(comment._id)) return;
        seen.add(comment._id);
        result.push({ comment, depth, parent: comment.parentId ? byId.get(comment.parentId) : undefined });
        for (const child of (children.get(comment._id) || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) visit(child, depth + 1);
    };
    roots.forEach(comment => visit(comment, 0));
    comments.forEach(comment => visit(comment, 0));
    return result;
}

export type CommentThread = {
    comment: Comment;
    parent?: Comment;
    replies: CommentThread[];
    replyCount: number;
};

export function commentThreadGroups(comments: Comment[]): CommentThread[] {
    const roots: CommentThread[] = [];
    const stack: CommentThread[] = [];
    const nodes: CommentThread[] = [];
    for (const { comment, parent, depth } of commentThreads(comments)) {
        const node: CommentThread = { comment, parent, replies: [], replyCount: 0 };
        stack.length = depth;
        if (depth && stack[depth - 1]) stack[depth - 1].replies.push(node);
        else roots.push(node);
        stack[depth] = node;
        nodes.push(node);
    }
    for (let index = nodes.length - 1; index >= 0; index--) {
        nodes[index].replyCount = nodes[index].replies.reduce((count, child) => count + 1 + child.replyCount, 0);
    }
    return roots;
}
