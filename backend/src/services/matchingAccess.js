// Project owners can also use contractor mode in the UI; admin access stays separate.
const MATCHING_ROLES = ['contractor', 'project_owner'];
function matchingAccountFilter() {
    return { accountRole: { $in: MATCHING_ROLES }, isActive: { $ne: false } };
}
module.exports = { MATCHING_ROLES, matchingAccountFilter };
