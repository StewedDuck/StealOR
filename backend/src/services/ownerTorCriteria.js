// Owner flags and weights come only from persisted structured settings, never AI output.
function applyOwnerCriteria(tor, extracted, relevance, modelName) {
    const requirements = [], projectRelevance = [];
    const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
    (tor.requirements || []).forEach((row, index) => {
        const text = normalize(row.description);
        if (!text) return;
        const matches = relevance.filter(item => normalize(item.sourceText) === text);
        if (!matches.length) throw new Error('Incomplete owner criteria response');
        const groups = matches.flatMap(item => item.skillGroups || []);
        const fields = [...new Set([...(groups.length ? ['skills', 'teamQualifications.skills'] : []), ...matches.flatMap(item => item.profileFields || [])])];
        const extractedRow = extracted.find(item => normalize(item.sourceText) === text);
        projectRelevance.push({
            text: row.description, sourceText: row.description, ownerRequirementIndex: index,
            skillGroups: groups, skillKeywords: [...new Set(groups.flat())], profileFields: fields,
            weight: Number(row.weight) || 0, reason: 'เกณฑ์และน้ำหนักที่เจ้าของโครงการกำหนด',
            profileField: extractedRow?.profileField || null,
            requirementType: extractedRow?.requirementType || 'other',
        });
        if (row.mandatory === true) requirements.push({
            ...(extractedRow || {}), text: row.description, sourceText: row.description,
            ownerRequirementIndex: index, category: 'mandatory', weight: null,
            requirementType: extractedRow?.requirementType || 'other',
            profileField: extractedRow?.profileField || null,
        });
    });
    const incomplete = projectRelevance.some(item => !item.skillGroups.length);
    return { requirements, projectRelevance, modelName, analyzedAt: new Date(),
        status: incomplete ? 'needs_review' : 'completed', relevanceStatus: incomplete ? 'needs_review' : 'ready',
        scoringStatus: 'ready' };
}
module.exports = { applyOwnerCriteria };
