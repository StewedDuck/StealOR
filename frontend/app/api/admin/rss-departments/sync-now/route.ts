import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BACKEND_URL = process.env.INTERNAL_API_URL || "http://localhost:5000";
const PROXY_SECRET = process.env.TOR_PROXY_SECRET || "";

export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND_URL}/api/admin/rss-departments/sync-now`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": PROXY_SECRET,
      "x-admin-email": email,
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}