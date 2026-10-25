import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:5000";

async function forwardProfileRequest(
    request: NextRequest,
    method: "GET" | "PATCH"
) {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json(
            { success: false, error: "Unauthorized" },
            { status: 401 }
        );
    }

    const secret = process.env.TOR_PROXY_SECRET;

    if (!secret) {
        return NextResponse.json(
            { success: false, error: "Server configuration error" },
            { status: 500 }
        );
    }

    try {
        const response = await fetch(
            `${API_URL}/api/users/profile/${encodeURIComponent(email)}`,
            {
                method,
                headers: {
                "Content-Type": "application/json",
                "x-profile-proxy-secret": secret,
                "x-profile-email": email,
                },
                ...(method === "PATCH"
                ? { body: await request.text() }
                : {}),
                cache: "no-store",
            }
        );

        const data = await response.json();

        return NextResponse.json(data, {
            status: response.status,
        });
    } catch (error) {
        console.error("Profile API error:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Cannot connect to backend",
            },
            { status: 502 }
        );
    }
}

export async function GET(request: NextRequest) {
    return forwardProfileRequest(request, "GET");
}

export async function PATCH(request: NextRequest) {
    return forwardProfileRequest(request, "PATCH");
}