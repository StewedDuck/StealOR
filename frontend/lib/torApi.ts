import type { MarketTor, MarketTorDetail, Tor, TorFormData } from "@/types/tor";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

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