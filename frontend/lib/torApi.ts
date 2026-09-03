import type { Tor, TorFormData } from "@/types/tor";

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
