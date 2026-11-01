const Tor = require('../models/Tor');
const Verification = require('../models/IdentityVerification');

// Select event metadata only; identity documents and personal identifiers never leave MongoDB.
function activityPipeline(kind) {
    const events = kind === 'tor' ? {
        $concatArrays: [
            [
                { type: 'tor_created', at: '$createdAt' },
                { type: 'tor_submitted', at: '$submittedForReviewAt' },
                { type: 'tor_published', at: '$publishedAt' },
            ],
            { $map: { input: { $ifNull: ['$reviewHistory', []] }, as: 'review', in: {
                type: { $cond: [{ $eq: ['$$review.decision', 'approved'] }, 'tor_approved', 'tor_changes_requested'] },
                at: '$$review.reviewedAt', version: '$$review.version',
            } } },
        ],
    } : [
        { type: 'verification_submitted', at: '$createdAt' },
        { type: { $cond: [{ $eq: ['$status', 'approved'] }, 'verification_approved', 'verification_rejected'] },
            at: { $cond: [{ $in: ['$status', ['approved', 'rejected']] }, '$reviewedAt', null] } },
    ];
    return [
        { $project: { title: kind === 'tor' ? '$projectName' : { $literal: 'คำขอยืนยันตัวตน' }, events } },
        { $unwind: '$events' },
        { $match: { 'events.at': { $type: 'date' } } },
        { $sort: { 'events.at': -1, _id: -1 } },
        { $limit: 10 },
    ];
}
function mergeActivity(tors, verifications) {
    return [...tors, ...verifications].map(row => ({
        id: `${row._id}:${row.events.type}:${row.events.version || 0}:${new Date(row.events.at).toISOString()}`,
        type: row.events.type, at: new Date(row.events.at).toISOString(),
        title: row.title || 'TOR ไม่ระบุชื่อ',
        href: row.events.type.startsWith('tor_') ? '/admin/issue' : '/admin/verification',
    })).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, 10);
}
async function loadActivity() {
    const [tors, verifications] = await Promise.all([
        Tor.aggregate(activityPipeline('tor')),
        Verification.aggregate(activityPipeline('verification')),
    ]);
    return mergeActivity(tors, verifications);
}
module.exports = { loadActivity, activityPipeline, mergeActivity };
