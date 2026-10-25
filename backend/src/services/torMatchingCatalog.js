const Tor = require('../models/Tor');
const GovProject = require('../models/GovProject');
const CATALOG_PROJECTION = {
    government: '_id project_id project_name dept_name budget_amount contract_status createdAt updatedAt procurementAnalysis.projectDetails procurementAnalysis.allocatedBudget procurementAnalysis.referencePriceEstimate procurementAnalysis.biddingClosingDate procurementAnalysis.contractorQualifications procurementAnalysis.evaluationCriteria procurementAnalysis.technicalRequirements procurementAnalysis.scopeOfWork procurementAnalysis.deliverables raw_data.project_description raw_data.submission_deadline raw_data.deadline',
    internal: '_id projectName agencyName budget referencePriceEstimate applicationDeadline status description scopeOfWork requirements objectives technicalRequirements createdAt updatedAt',
};
function visibleFilter(source, now = new Date()) {
    return source === 'government' ? { contract_status: { $not: /ยกเลิก|สิ้นสุด/ } } :
        { status: 'published', applicationDeadline: { $gt: now } };
}
function marketTor(tor, source) {
    const government = source === 'government';
    const analysis = tor.procurementAnalysis || {};
    return {
        id: String(tor._id), source, projectId: government ? tor.project_id : String(tor._id),
        projectName: government ? tor.project_name : tor.projectName,
        agencyName: government ? tor.dept_name : tor.agencyName,
        budget: government ? (analysis.allocatedBudget?.amount > 0 ? analysis.allocatedBudget.amount : tor.budget_amount ?? null) : tor.budget,
        referencePriceEstimate: government ? analysis.referencePriceEstimate?.amount ?? null : tor.referencePriceEstimate ?? null,
        deadline: government ? analysis.biddingClosingDate?.dateTime || tor.raw_data?.submission_deadline || tor.raw_data?.deadline || null : tor.applicationDeadline,
        status: government ? tor.contract_status || 'Active' : tor.status,
        description: government ? analysis.projectDetails || tor.raw_data?.project_description || '' : tor.description,
        createdAt: tor.createdAt, updatedAt: tor.updatedAt,
    };
}
async function loadVisibleCatalog() {
    const [government, internal] = await Promise.all([
        GovProject.find(visibleFilter('government'), CATALOG_PROJECTION.government).lean(), Tor.find(visibleFilter('internal'), CATALOG_PROJECTION.internal).lean(),
    ]);
    return [...government.map(tor => ({ tor, source: 'government' })), ...internal.map(tor => ({ tor, source: 'internal' }))];
}
module.exports = { CATALOG_PROJECTION, visibleFilter, marketTor, loadVisibleCatalog };
