import type { MarketTor, MarketTorDetail, Tor, TorFormData } from "@/types/tor";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export function getEgpAnnouncementUrl(projectId: string) {
  return `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectId)}`;
}

export function getGovProjectDocumentDownloadUrl(projectId: string) {
  return getGovProjectDocumentCategoryDownloadUrl(projectId, "price-estimate");
}

export type GovProjectDocumentCategory =
  | "price-estimate"
  | "invitation"
  | "draft-ebidding";

export function getGovProjectDocumentCategoryDownloadUrl(
  projectId: string,
  category: GovProjectDocumentCategory
) {
  const encodedProjectId = encodeURIComponent(projectId);
  // The browser always downloads through our backend; it never relies on a
  // stored e-GP URL, which may become stale when upstream file IDs change.
  if (category === "price-estimate") {
    return `${API_URL}/api/gov-projects/${encodedProjectId}/document/download`;
  }
  return `${API_URL}/api/gov-projects/${encodedProjectId}/documents/${category}/download`;
}

export function getGovProjectInvitationDownloadUrl(projectId: string) {
  return getGovProjectDocumentCategoryDownloadUrl(projectId, "invitation");
}

export function getGovProjectDraftEbiddingDownloadUrl(projectId: string) {
  return getGovProjectDocumentCategoryDownloadUrl(projectId, "draft-ebidding");
}

type ApiResponse<T> = { success: boolean; data: T; message?: string; error?: string };

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url =
  path.startsWith("/api/tors") &&
  !path.startsWith("/api/tors/market")
    ? path.replace(/^\/api\/tors/, "/api/owner-tors")
    : `${API_URL}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    console.log("API URL:", url);
    console.log("HTTP status:", response.status);
    console.log("Final response URL:", response.url);
    console.log("Content-Type:", contentType);
    console.log("Response body:", text.slice(0, 500));

    throw new Error(
      `API returned HTML instead of JSON (${response.status}) at ${url}`
    );
  }

  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || result.success === false) {
    throw new Error(
      result.error ??
        result.message ??
        "เกิดข้อผิดพลาดในการเชื่อมต่อ API"
    );
  }

  return result.data;
}

export async function createTor(data: TorFormData): Promise<Tor> {
  return request<Tor>("/api/tors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export const getDraftTors = () => request<Tor[]>("/api/tors?status=draft");
export async function getMyTors(): Promise<Tor[]> {
  return request<Tor[]>("/api/tors");
}

export async function publishTor(
  id: string,
  applicationDeadline: string
): Promise<Tor> {
  return request<Tor>(
    `/api/tors/${encodeURIComponent(id)}/publish`,
    {
      method: "PATCH",
      body: JSON.stringify({ applicationDeadline }),
    }
  );
}
export const getTorById = (id: string) => request<Tor>(`/api/tors/${encodeURIComponent(id)}`);

export async function updateTor(
  id: string,
  data: Partial<TorFormData>
): Promise<Tor> {
  return request<Tor>(`/api/tors/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export const deleteTor = (id: string) => request<{ id: string }>(
  `/api/tors/${encodeURIComponent(id)}`,
  { method: "DELETE" }
);

export async function getMarketTors(): Promise<MarketTor[]> {
  return request<MarketTor[]>("/api/tors/market");
}

export async function getMarketTorById(
  projectId: string
): Promise<MarketTorDetail> {
  return request<MarketTorDetail>(
    `/api/tors/market/${encodeURIComponent(projectId)}`
  );
}

export type BookmarkMatch = {
  percent?: number;
  matchedRequirements?: string[];
  unmatchedRequirements?: string[];
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

  match?: BookmarkMatch | null;

  savedAt: string;
};

export async function createBookmark(
  userId: string,
  projectId: string
) {
  return request("/api/bookmarks", {
    method: "POST",
    body: JSON.stringify({
      userId,
      source: "government",
      projectId,
      savedFrom: "market",
      match: null,
    }),
  });
}

export async function createInternalBookmark(
  userId: string,
  torId: string
) {
  return request("/api/bookmarks", {
    method: "POST",
    body: JSON.stringify({
      userId,
      source: "internal",
      torId,
      savedFrom: "market",
      match: null,
    }),
  });
}

export async function getBookmarks(
  userId: string
): Promise<SavedTor[]> {
  return request<SavedTor[]>(
    `/api/bookmarks?userId=${encodeURIComponent(userId)}`
  );
}

export async function deleteBookmark(
  userId: string,
  projectId: string
) {
  return request<{ projectId: string }>(
    `/api/bookmarks/${encodeURIComponent(
      userId
    )}/${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function deleteInternalBookmark(
  userId: string,
  torId: string
) {
  return request<{ torId: string }>(
    `/api/bookmarks/internal/${encodeURIComponent(userId)}/${encodeURIComponent(torId)}`,
    {
      method: "DELETE",
    }
  );
}

export type Comment = {
  _id: string;
  userId: string;
  userName: string;
  projectId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export async function getComments(
  projectId: string
): Promise<Comment[]> {
  return request<Comment[]>(
    `/api/comments/${encodeURIComponent(projectId)}`
  );
}

export async function createComment(
  userId: string,
  userName: string,
  projectId: string,
  content: string
): Promise<Comment> {
  return request<Comment>("/api/comments", {
    method: "POST",
    body: JSON.stringify({
      userId,
      userName,
      projectId,
      content,
    }),
  });
}

export async function deleteComment(
  commentId: string,
  userId: string
) {
    return request<{ commentId: string }>(
      `/api/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ userId }),
      }
    );
}

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;

  phone: string;
  company: string;
  profileSummary: string;
  experienceYears: number;
  experienceSummary: string;
  skills: string[];

  contractorType: "individual" | "company" | "freelance_team";
  occupation: string;
  teamSize: number;

  projectTypes: string[];
  serviceAreas: string[];
  workModes: ("onsite" | "remote" | "hybrid")[];
  certifications: string[];

  minProjectBudget: number | null;
  maxProjectBudget: number | null;

  availableFrom: string | null;
  preferredProjectDuration: string;
  additionalInfo: string;

  registeredCapital: number | null;
  maxPastProjectValue: number | null;
  hasGovernmentExperience: boolean | null;

  accountRole:
    | "contractor"
    | "project_owner"
    | "admin";

  verificationStatus:
    | "not_required"
    | "pending"
    | "approved"
    | "rejected";
};

export async function getUserProfile(
  email: string
): Promise<UserProfile> {
  return request<UserProfile>(
    `/api/users/profile/${encodeURIComponent(email)}`
  );
}

export type UpdateUserProfileData = {
  name: string;
  phone: string;
  company: string;
  profileSummary: string;
  experienceYears: number;
  experienceSummary: string;
  skills: string[];

  contractorType?: "individual" | "company" | "freelance_team";
  occupation?: string;
  teamSize?: number;

  projectTypes?: string[];
  serviceAreas?: string[];
  workModes?: ("onsite" | "remote" | "hybrid")[];
  certifications?: string[];

  minProjectBudget?: number | null;
  maxProjectBudget?: number | null;

  availableFrom?: string | null;
  preferredProjectDuration?: string;
  additionalInfo?: string;

  registeredCapital?: number | null;
  maxPastProjectValue?: number | null;
  hasGovernmentExperience?: boolean | null;
};

export async function updateUserProfile(
  email: string,
  data: UpdateUserProfileData
): Promise<UserProfile> {
  return request<UserProfile>(
    `/api/users/profile/${encodeURIComponent(email)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export type LocalDocumentFile = {
  fileName: string;
  url: string;
};

export type LocalDocumentCategory = {
  available: boolean;
  files: LocalDocumentFile[];
};

export type LocalProjectDocuments = {
  projectId: string;
  documents: {
    priceEstimate: LocalDocumentCategory;
    invitation: LocalDocumentCategory;
    draftEbidding: LocalDocumentCategory;
  };
};

export async function getLocalProjectDocuments(
  projectId: string
): Promise<LocalProjectDocuments> {
    return request<LocalProjectDocuments>(
      `/api/gov-projects/${encodeURIComponent(
        projectId
      )}/documents/local`
    );
  }

export function getLocalDocumentUrl(
  relativeUrl: string
) {
  return `${API_URL}${relativeUrl}`;
}

export type ContractorNotificationType =
  | "deadline_5_days"
  | "deadline_1_day"
  | "draft_updated";

  export type ContractorNotification = {
    _id: string;
    userId: string;

    source: "government" | "internal";

    projectId: string | null;
    torId: string | null;

    type: ContractorNotificationType;

    title?: string;
    message?: string;

    torName?: string;
    torIdentifier?: string;

    read: boolean;

    sentAt: string;
    createdAt: string;
    updatedAt: string;
};


export async function getContractorNotifications(
  userId: string
): Promise<ContractorNotification[]> {
  return request<ContractorNotification[]>(
    `/api/notifications?userId=${encodeURIComponent(userId)}`
  );
}

export async function markContractorNotificationAsRead(
  notificationId: string
): Promise<ContractorNotification> {
  return request<ContractorNotification>(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PATCH",
    }
  );
}


export type VerificationStatus =
    | "not_required"
    | "pending"
    | "approved"
    | "rejected";


export type MyVerification = {
    verificationStatus: VerificationStatus;

    verificationReason: string | null;

    verification: {
        id: string;
        status: "pending" | "approved" | "rejected";
        rejectionReason: string | null;
        submittedAt: string;
        reviewedAt: string | null;
    } | null;
};


export async function getMyVerification(
    userId: string
): Promise<MyVerification> {

    return request<MyVerification>(
        `/api/verifications/me/${encodeURIComponent(userId)}`
    );
}


export async function submitIdentityVerification(data: {
    userId: string;
    citizenId: string;
    laserCode: string;
    email: string;
    phone: string;
    document: File;
}) {
    const formData = new FormData();

    formData.append("userId", data.userId);
    formData.append("citizenId", data.citizenId);
    formData.append("laserCode", data.laserCode);
    formData.append("email", data.email);
    formData.append("phone", data.phone);

    formData.append(
        "document",
        data.document
    );

    const response = await fetch(
        `${API_URL}/api/verifications`,
        {
            method: "POST",
            body: formData,
        }
    );

    const contentType = response.headers.get("content-type");

    if (
        !contentType?.includes(
            "application/json"
        )
    ) {
        const text = await response.text();

        console.error(
            "Verification API returned non-JSON:",
            response.status,
            text
        );

        throw new Error(
            `Verification API error (${response.status})`
        );
    }

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.error ||
            "Failed to submit verification"
        );
    }

  return result.data;
}

// ===============================
// Admin Identity Verification
// ===============================

export type AdminVerificationStatus =
    | "pending"
    | "approved"
    | "rejected";

export type AdminVerificationListItem = {
    id: string;

    owner: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    } | null;

    phone: string;

    status: AdminVerificationStatus;

    rejectionReason: string | null;

    submittedAt: string;

    reviewedAt: string | null;
};

export type AdminVerificationDetail = {
    id: string;

    owner: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    } | null;

    citizenId: string;
    laserCode: string;
    email: string;
    phone: string;

    document: {
        fileName: string;
        mimeType: string;
        size: number;
        url: string;
    };

    status: AdminVerificationStatus;

    rejectionReason: string | null;

    reviewedBy: string | null;

    submittedAt: string;

    reviewedAt: string | null;
};


export async function getAdminVerifications(
    adminId: string,
    status?: AdminVerificationStatus
): Promise<AdminVerificationListItem[]> {

    const params =
        new URLSearchParams({
            adminId,
        });

    if (status) {
        params.set("status", status);
    }

    return request<AdminVerificationListItem[]>(
        `/api/verifications/admin?${params.toString()}`
    );
}


export async function getAdminVerificationById(
    verificationId: string,
    adminId: string
): Promise<AdminVerificationDetail> {

    return request<AdminVerificationDetail>(
        `/api/verifications/admin/${encodeURIComponent(
            verificationId
        )}?adminId=${encodeURIComponent(adminId)}`
    );
}


export async function approveIdentityVerification(
    verificationId: string,
    adminId: string
) {

    return request<{
        id: string;
        status: "approved";
        reviewedAt: string;
    }>(
        `/api/verifications/admin/${encodeURIComponent(
            verificationId
        )}/approve`,
        {
            method: "PATCH",

            body: JSON.stringify({
                adminId,
            }),
        }
    );
}


export async function rejectIdentityVerification(
    verificationId: string,
    adminId: string,
    reason: string
) {

    return request<{
        id: string;
        status: "rejected";
        rejectionReason: string;
        reviewedAt: string;
    }>(
        `/api/verifications/admin/${encodeURIComponent(
            verificationId
        )}/reject`,
        {
            method: "PATCH",

            body: JSON.stringify({
                adminId,
                reason,
            }),
        }
    );
}


export function getVerificationDocumentUrl(
    relativeUrl: string
) {
    return `${API_URL}${relativeUrl}`;
}
