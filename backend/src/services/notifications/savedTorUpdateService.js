const Bookmark = require('../../models/Bookmark');
const GovProject = require('../../models/GovProject');
const Tor = require('../../models/Tor');
const User = require('../../models/User');
const { hash } = require('../matchingCache');
const { notify, eventKey } = require('./deliveryService');
const { appUrl } = require('../../email/Shared');

// Track only user-facing TOR content, never crawls, AI-cache writes or lastCheckedAt.
function savedTorFingerprint(tor, source) {
    const row = tor?.toObject ? tor.toObject() : tor;
    if (source === 'internal') return hash(Object.fromEntries([
        'projectName', 'agencyName', 'description', 'objectives', 'scopeOfWork', 'requirements',
        'budget', 'referencePriceEstimate', 'submissionDeadline', 'applicationDeadline', 'status', 'contactName', 'contactEmail',
    ].map(key => [key, row[key] ?? null])));
    const raw = row.raw_data || {}, analysis = row.procurementAnalysis || {};
    const documents = Object.fromEntries(['priceEstimate', 'invitation', 'draftEbidding'].map(key => {
        const doc = row.documents?.[key] || {};
        return [key, { fileId: doc.fileId ?? null, sha256: doc.sha256 ?? null, revision: doc.revision ?? null, version: doc.version ?? null, fileName: doc.fileName ?? null }];
    }));
    return hash({ projectName: row.project_name, agencyName: row.dept_name, budget: row.budget_amount,
        status: row.contract_status, documents,
        raw: Object.fromEntries(['project_description', 'description', 'submission_deadline', 'deadline', 'requirements', 'objectives', 'scope_of_work', 'contact_name', 'contact_email'].map(key => [key, raw[key] ?? null])),
        analysis: Object.fromEntries(['projectDetails', 'objectives', 'scopeOfWork', 'contractorQualifications', 'technicalRequirements', 'deliverables', 'allocatedBudget', 'referencePriceEstimate', 'biddingClosingDate'].map(key => [key, analysis[key] ?? null])),
    });
}
function createSavedTorUpdateService(deps = {}) {
    const bookmarks = deps.Bookmark || Bookmark, gov = deps.GovProject || GovProject;
    const tors = deps.Tor || Tor, users = deps.User || User, deliver = deps.notify || notify;
    async function checkSavedTorUpdates(filter = {}) {
        for (const bookmark of await bookmarks.find(filter).lean()) {
            try {
                const tor = bookmark.source === 'government'
                    ? await gov.findOne({ project_id: bookmark.projectId }).lean()
                    : await tors.findById(bookmark.torId).lean();
                if (!tor) continue;
                const fingerprint = savedTorFingerprint(tor, bookmark.source);
                if (fingerprint === bookmark.observedTorFingerprint) continue;
                if (bookmark.observedTorFingerprint) {
                    const user = await users.findOne({ email: bookmark.userId.trim().toLowerCase(), accountRole: 'contractor' }).lean();
                    if (!user) continue;
                    const projectName = bookmark.source === 'government' ? tor.project_name : tor.projectName;
                    await deliver({ key: eventKey([String(bookmark._id), 'saved_tor_updated', bookmark.observedTorFingerprint, fingerprint, tor.updatedAt || null]),
                        user, source: bookmark.source, projectId: bookmark.source === 'government' ? bookmark.projectId : null,
                        torId: bookmark.source === 'internal' ? bookmark.torId : null, type: 'saved_tor_updated',
                        title: `TOR ที่คุณบันทึกไว้มีการอัปเดต: ${projectName}`,
                        message: 'ข้อมูล TOR ที่คุณติดตามมีการเปลี่ยนแปลง กรุณาตรวจสอบรายละเอียดล่าสุดก่อนยื่นข้อเสนอ',
                        url: `${appUrl()}/contractor/saved?tor=${encodeURIComponent(bookmark.source === 'government' ? bookmark.projectId : bookmark.torId)}`,
                        details: { projectName, agencyName: tor.dept_name || tor.agencyName, label: 'TOR UPDATED', buttonLabel: 'ดูรายละเอียด TOR' },
                    });
                }
                // Advance only after both the web event and queued email have been saved.
                await bookmarks.updateOne({ _id: bookmark._id, observedTorFingerprint: bookmark.observedTorFingerprint || null }, { $set: { observedTorFingerprint: fingerprint } });
            } catch { console.warn('[NOTIFICATION] Saved TOR change check deferred'); }
        }
    }
    return { checkSavedTorUpdates };
}
module.exports = { ...createSavedTorUpdateService(), createSavedTorUpdateService, savedTorFingerprint };
