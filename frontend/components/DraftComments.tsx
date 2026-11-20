'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { createComment, deleteComment, getComments, type Comment } from '@/lib/torApi';
import { useProfileIdentity } from '@/hooks/useProfileIdentity';
import { commentThreadGroups, type CommentThread } from '@/lib/commentThreads';
import './DraftComments.css';

export default function DraftComments({ projectId }: { projectId: string }) {
    const { email, name } = useProfileIdentity();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [text, setText] = useState('');
    const [replyText, setReplyText] = useState('');
    const [replyTo, setReplyTo] = useState<Comment | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const replyInput = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (replyTo) {
            replyInput.current?.focus();
            replyInput.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [replyTo]);
    useEffect(() => {
        let active = true;
        setLoading(true); setError('');
        getComments(projectId).then(rows => { if (active) setComments(rows); })
            .catch(error => { if (active) setError(error instanceof Error ? error.message : 'โหลดความคิดเห็นไม่สำเร็จ'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [projectId, attempt]);
    async function submit(event: React.FormEvent, parent?: Comment) {
        event.preventDefault();
        const content = parent ? replyText : text;
        if (!email || !content.trim() || busy) return;
        setBusy(true); setError('');
        try {
            const comment = await createComment(email, name, projectId, content, parent?._id);
            setComments(current => [comment, ...current]);
            if (parent) { setExpanded(current => new Set(current).add(parent._id)); setReplyText(''); setReplyTo(null); } else setText('');
        } catch (error) { setError(error instanceof Error ? error.message : 'ส่งความคิดเห็นไม่สำเร็จ'); }
        finally { setBusy(false); }
    }
    async function remove(comment: Comment) {
        setBusy(true); setError('');
        try {
            await deleteComment(comment._id, email);
            setComments(current => current.filter(row => row._id !== comment._id));
            if (replyTo?._id === comment._id) setReplyTo(null);
        } catch (error) { setError(error instanceof Error ? error.message : 'ลบความคิดเห็นไม่สำเร็จ'); }
        finally { setBusy(false); }
    }
    function renderComment({ comment, parent, replies, replyCount }: CommentThread, depth = 0): React.ReactNode {
        const isExpanded = expanded.has(comment._id);
        return <article key={comment._id} className={`draft-comment ${depth ? 'draft-comment-reply' : ''}`}>
                <div className="draft-comment-meta"><strong>{comment.userName}</strong>{comment.isTorOwner && <span className="draft-comment-owner">เจ้าของ TOR</span>}<time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</time></div>
                {comment.parentId && <small className="draft-comment-parent">{parent ? `ตอบกลับ ${parent.userName}` : 'ความคิดเห็นต้นทางถูกลบแล้ว'}</small>}
                <p className="draft-comment-text">{comment.content}</p>
                <div className="draft-comment-actions">
                    <button type="button" disabled={!email || busy} aria-expanded={replyTo?._id === comment._id} onClick={() => { setReplyText(''); setReplyTo(comment); }}>ตอบกลับ</button>
                    {comment.userId.toLowerCase() === email.toLowerCase() && <button type="button" className="draft-comment-delete" disabled={busy} onClick={() => void remove(comment)}><Trash2 size={14} /> ลบความคิดเห็น</button>}
                </div>
                {replyTo?._id === comment._id && <form className="draft-comment-form draft-comment-inline-reply" onSubmit={event => void submit(event, comment)}>
                    <div className="draft-comment-replying"><label htmlFor={`reply-${comment._id}`}>ตอบกลับ {comment.userName}</label><button type="button" disabled={busy} onClick={() => { setReplyTo(null); setReplyText(''); }}>ยกเลิก</button></div>
                    <textarea id={`reply-${comment._id}`} ref={replyInput} value={replyText} onChange={event => setReplyText(event.target.value)} rows={2} maxLength={1000} disabled={busy} placeholder={`ตอบกลับ ${comment.userName}…`} />
                    <div className="draft-comment-submit"><small>{replyText.length}/1000</small><button type="submit" disabled={!replyText.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'ส่งคำตอบ'}</button></div>
                </form>}
                {replyCount > 0 && <>
                    <button type="button" className="draft-comment-toggle" aria-expanded={isExpanded} aria-controls={`replies-${comment._id}`} onClick={() => {
                        setExpanded(current => {
                            const next = new Set(current);
                            if (next.has(comment._id)) next.delete(comment._id); else next.add(comment._id);
                            return next;
                        });
                        if (isExpanded) setReplyTo(null);
                    }}>{isExpanded ? 'ซ่อนคำตอบกลับ' : `ดูคำตอบกลับ (${replyCount})`}</button>
                    <div id={`replies-${comment._id}`} className="draft-comment-replies" hidden={!isExpanded}>
                        {isExpanded && replies.map(reply => renderComment(reply, depth + 1))}
                    </div>
                </>}
            </article>;
    }
    return <section className="draft-comments" aria-label="ความคิดเห็นและการตอบกลับ">
        {loading ? <p role="status">กำลังโหลดความคิดเห็น…</p> : <>
            {comments.length === 0 && <p>ยังไม่มีความคิดเห็น</p>}
            <div className="draft-comment-list">{commentThreadGroups(comments).map(thread => renderComment(thread))}</div>
        </>}
        {error && <p role="alert" className="draft-comment-error">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>โหลดใหม่</button></p>}
        <form className="draft-comment-form" onSubmit={event => void submit(event)}>
            <label htmlFor="draft-comment-input">เขียนความคิดเห็น</label>
            <textarea id="draft-comment-input" value={text} onChange={event => setText(event.target.value)} rows={3} maxLength={1000} disabled={!email || busy || loading} placeholder="เขียนความคิดเห็นของคุณ…" />
            <div className="draft-comment-submit"><small>{text.length}/1000</small><button type="submit" disabled={!email || !text.trim() || busy || loading}>{busy ? 'กำลังบันทึก…' : 'ส่งความคิดเห็น'}</button></div>
        </form>
    </section>;
}
