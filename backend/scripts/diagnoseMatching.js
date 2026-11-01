// Read-only diagnostics: never invokes AI or prints contractor profile values.
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const GovProject = require('../src/models/GovProject');
const TorAnalysis = require('../src/models/TorAnalysis');
async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const project = await GovProject.findOne({ project_id: process.argv[2] }).select('_id').lean();
    if (!project) throw new Error('Project not found');
    const analyses = await TorAnalysis.find({ torId: project._id }).select('projectRelevance').lean();
    const cached = await mongoose.connection.db.collection('precomputed_matching').find(
        { 'result.torId': String(project._id) },
        { projection: { _id: 0, result: 1, computedAt: 1, retryAt: 1 } }
    ).limit(30).toArray();
    console.log(JSON.stringify({
        criteria: analyses.flatMap(a => a.projectRelevance || []).map(c => ({ text: c.text, profileFields: c.profileFields, skillGroups: c.skillGroups })),
        storedResults: cached.map(row => ({
            computedAt: row.computedAt, retryAt: row.retryAt,
            relevance: row.result.relevanceResults.map(r => ({
                text: r.text, status: r.status, semanticMatchingStatus: r.semanticMatchingStatus,
                missingGroups: r.missingGroups,
                diagnosis: r.semanticMatchingStatus === 'unavailable' ? 'AI_UNAVAILABLE' :
                    r.status === 'unknown' ? (r.reason?.startsWith('ไม่พบข้อมูลทักษะ') ? 'NO_AUTHORIZED_EVIDENCE' : 'UNCONFIRMED_GROUPS') : 'CONFIRMED',
            })),
            mandatory: row.result.mandatoryResults.map(r => ({ field: r.profileField, status: r.status, reason: r.status === 'unknown' ? r.reason : undefined })),
        })),
        contractorProfileCompleteness: (await User.find({ accountRole: 'contractor' }).select('skills projectTypes pastProjects teamQualifications experienceSummary profileSummary').limit(5).lean()).map(p => ({
            skills: p.skills?.length || 0, projectTypes: p.projectTypes?.length || 0,
            pastProjects: p.pastProjects?.length || 0, teamMembers: p.teamQualifications?.length || 0,
            hasExperienceSummary: !!p.experienceSummary, hasProfileSummary: !!p.profileSummary,
        })),
    }, null, 2));
}
main().catch(error => { console.error('Matching diagnostic unavailable:', error.code || error.name); process.exitCode = 1; }).finally(() => mongoose.disconnect());
