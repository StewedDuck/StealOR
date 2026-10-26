export const REQUIREMENT_CATEGORIES = {
  generalLegal: "คุณสมบัติทั่วไปและข้อกำหนดทางกฎหมาย",
  projectSpecific: "คุณสมบัติเฉพาะโครงการ",
  technicalRequirements: "ข้อกำหนดทางเทคนิค",
  deliverables: "สิ่งที่ต้องส่งมอบ",
} as const;
export type TorRequirementCategory = keyof typeof REQUIREMENT_CATEGORIES;

export type TorRequirement = {
  category?: TorRequirementCategory; // รายการเดิมที่ไม่มีหมวดจัดเป็นคุณสมบัติเฉพาะโครงการ
  description: string;
  weight: number;
  mandatory: boolean;
};

export type TorFormData = {
  referencePriceEstimate?: number | null;
  projectName: string;
  agencyName: string;
  description: string;
  objectives: string[];
  scopeOfWork: string[];
  requirements: TorRequirement[];
  budget: number | null;
  submissionDeadline: string;
  contactName: string;
  contactEmail: string;
};

// การตรวจ TOR เป็นคนละขั้นตอนกับความคิดเห็นผู้รับจ้างและการยืนยันตัวตน
export type TorReviewStatus = "not_submitted" | "pending" | "changes_requested" | "approved";
export type TorReviewHistoryEntry = {
  decision: "approved" | "changes_requested";
  comment: string;
  reviewedBy: string;
  reviewedAt: string;
  version: number;
};

export type Tor = TorFormData & {
  _id: string;
  ownerId: string;
  // เมื่ออ่านข้อมูลเดิม ให้ถือว่ายังไม่ส่งตรวจ ไม่อนุมานว่าได้รับอนุมัติแล้ว
  reviewStatus?: TorReviewStatus;
  contentVersion?: number;
  submittedVersion?: number | null;
  submittedForReviewAt?: string | null;
  reviewHistory?: TorReviewHistoryEntry[];
  status: "draft" | "pending_verification" | "published";
  applicationDeadline?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketTor = {
  documentTypes?: ('priceEstimate' | 'draftEbidding' | 'invitation')[];
  publicationStatus?: 'open' | 'draft' | 'unknown';
  id: string;
  source: "government" | "internal";
  projectId?: string;
  projectName: string;
  agencyName: string;
  budget: number | null;
  allocatedBudget?: number | null;
  referencePriceEstimate?: number | null;
  deadline?: string | null;
  description?: string;
  status: string;
  winnerName?: string | null;
  winnerTin?: string | null;
  createdAt: string;
  updatedAt: string;

  matchPercent?: number | null;
};

export type MarketTorDetail = {
  id: string;
  source: "government" | "internal";
  projectId?: string;

  projectName: string;
  agencyName: string;

  budget: number | null;
  allocatedBudget?: number | null;
  referencePriceEstimate?: number | null;
  submissionDeadline: string | null;

  contactName: string;
  contactEmail: string;

  description: string;
  objectives: string[];
  scopeOfWork: string[];

  requirements: TorRequirement[];

  status: string;

  winnerName?: string | null;
  winnerTin?: string | null;

  createdAt: string;
  updatedAt: string;

  contractorQualifications?: {
    generalLegal: string[];
    projectSpecific: string[];
  };
  
  technicalRequirements?: string[];
  deliverables?: string[];
  
  biddingClosingDate?: {
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    dateTime: string | null;
    timezone: string | null;
  } | null;
};

export type SavedTor = {
  bookmarkId: string;
  source: "government" | "internal";
  projectId?: string;
  torId?: string;
  projectName: string;
  agencyName: string;
  budget: number | null;
  deadline?: string | null;
  status: string;
  description?: string;
  objectives?: string[];
  scopeOfWork?: string[];
  requirements?: {
    description: string;
    weight: number;
    mandatory: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
  savedFrom: "market" | "matching";
  match?: {
    percent?: number;
    matchedRequirements?: string[];
    unmatchedRequirements?: string[];
  } | null;
  savedAt: string;

  allocatedBudget?: number | null;
  referencePriceEstimate?: number | null;
};
