// Backwards-compatible adapter: all semantic matching uses the same prompt,
// validation, Thai explanations, timeout, concurrency and persistent cache.
const { findSemanticMatchesBatch } = require('./semanticBatchMatcher');
async function findSemanticMatches({ skillGroups, profileValues }, options = {}) {
    if (!skillGroups.length || !profileValues.length) return [];
    const matches = await findSemanticMatchesBatch([{ skillGroups, profileValues }], options);
    return matches.map(({ groupIndex, evidence, reason }) => ({ groupIndex, evidence, reason }));
}
module.exports = { findSemanticMatches };
