export type TorRequirement = {
  description: string;
  weight: number;
  mandatory: boolean;
};

export type TorFormData = {
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

export type Tor = TorFormData & {
  _id: string;
  ownerId: string;
  status: "draft" | "pending_verification" | "published";
  createdAt: string;
  updatedAt: string;
};

export type MarketTor = {
  id: string;
  source: "government" | "internal";
  projectId?: string;
  projectName: string;
  agencyName: string;
  budget: number | null;
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
};
