const formatProject = (raw) => ({
  projectId: raw.project_id || raw.project_number,
  title: raw.project_name,
  department: raw.dept_name,
  subDepartment: raw.dept_sub_name,
  budget: parseFloat(raw.sum_price_agree || raw.budget_amount || 0),
  winnerName: raw.winner || raw.winner_name,
  winnerTaxId: raw.winner_tin,
  status: raw.contract_status || "Active",
  signDate: raw.contract_date || raw.transaction_date,
});

module.exports = { formatProject };