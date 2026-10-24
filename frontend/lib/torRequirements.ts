import type { TorRequirement } from "@/types/tor";

// อ่านจาก requirements เท่านั้น และกำหนดหมวดเริ่มต้นให้รายการเดิมที่ยังไม่มี category
export function normalizeTorRequirements(data: { requirements?: TorRequirement[] }): TorRequirement[] {
  return (data.requirements ?? []).map((item) => ({
    ...item, category: item.category ?? "projectSpecific",
  }));
}
