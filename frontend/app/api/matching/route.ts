import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const API_URL =
    process.env.INTERNAL_API_URL ?? "http://localhost:5000";

export async function GET(request: Request) {
    const session = await auth();
    const email = session?.user?.email;

    if (!email) {
        return NextResponse.json(
            {
                success: false,
                error: "Unauthorized",
            },
            { status: 401 }
        );
    }

    const secret = process.env.TOR_PROXY_SECRET;

    if (!secret) {
        return NextResponse.json(
            {
                success: false,
                error: "Server configuration error",
            },
            { status: 500 }
        );
    }

    try {
        const response = await fetch(
            `${API_URL}/api/matching${new URL(request.url).search}`,
            {
                method: "GET",
                headers: {
                    "x-profile-email": email,
                    "x-profile-proxy-secret": secret,
                },
                cache: "no-store",
                signal: AbortSignal.timeout(15000),
            }
        );

        const data = await response.json();

        return NextResponse.json(data, {
            status: response.status,
        });
    } catch (error) {
        console.error("Matching List API error:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Cannot connect to backend",
            },
            { status: 502 }
        );
    }
}