import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BACKEND_URL = process.env.INTERNAL_API_URL || "http://localhost:5000";
const PROXY_SECRET = process.env.TOR_PROXY_SECRET || "";

async function getAdminHeaders() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return {
    "Content-Type": "application/json",
    "x-internal-secret": PROXY_SECRET,
    "x-admin-email": email,
  };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = await getAdminHeaders();
  if (!headers) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const res = await fetch(`${BACKEND_URL}/api/admin/rss-departments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = await getAdminHeaders();
  if (!headers) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await fetch(`${BACKEND_URL}/api/admin/rss-departments/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}