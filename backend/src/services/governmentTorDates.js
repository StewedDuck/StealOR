function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function governmentTorDates(project, publicationStatus) {
    const documents = project.documents || {};
    const status = publicationStatus || (documents.invitation?.status === 'available' ? 'open' :
        documents.draftEbidding || String(project.contract_status).toLowerCase() === 'draft' ? 'draft' : undefined);
    const commentDeadlineAt = validDate(documents.draftEbidding?.commentDeadlineAt);
    const biddingDeadline = validDate(project.procurementAnalysis?.biddingClosingDate?.dateTime ||
        project.raw_data?.submission_deadline || project.raw_data?.deadline);
    return { commentDeadlineAt, biddingDeadline, publicationStatus: status,
        deadline: status === 'draft' ? commentDeadlineAt : biddingDeadline };
}

module.exports = { governmentTorDates };
