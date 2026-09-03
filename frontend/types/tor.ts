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