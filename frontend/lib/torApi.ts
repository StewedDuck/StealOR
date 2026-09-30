import type { MarketTor, MarketTorDetail, Tor, TorFormData } from "@/types/tor";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export function getEgpAnnouncementUrl(projectId: string) {
  return `https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=${encodeURIComponent(projectId)}`;
}

export function getGovProjectDocumentDownloadUrl(projectId: string) {
  return `${API_URL}/api/gov-projects/${encodeURIComponent(projectId)}/document/download`;
}

type ApiResponse<T> = { success: boolean; data: T; message?: string; error?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(result.error ?? "เกิดข้อผิดพลาดในการเชื่อมต่อ API");
  return result.data;
}

export async function createTor(data: TorFormData): Promise<Tor> {
  return request<Tor>("/api/tors", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export const getDraftTors = () => request<Tor[]>("/api/tors?status=draft");
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
