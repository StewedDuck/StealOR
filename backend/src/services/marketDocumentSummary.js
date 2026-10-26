const { getLocalProjectDocuments } = require('./localDocumentService');
async function addMarketDocumentSummaries(tors, lookup = getLocalProjectDocuments) {
    const results = [...tors];
    let next = 0;
    async function worker() {
        while (next < tors.length) {
            const index = next++;
            const tor = tors[index];
            if (tor.source !== 'government' || !tor.projectId) continue;
            try {
                const { documents } = await lookup(tor.projectId);
                const documentTypes = ['priceEstimate', 'draftEbidding', 'invitation'].filter(type => documents[type]?.available && documents[type].files.length > 0);
                results[index] = { ...tor, documentTypes, publicationStatus: documentTypes.includes('invitation') ? 'open' : 'draft' };
            } catch {
                results[index] = { ...tor, documentTypes: [], publicationStatus: 'unknown' };
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(8, tors.length) }, worker));
    return results;
}
module.exports = { addMarketDocumentSummaries };
