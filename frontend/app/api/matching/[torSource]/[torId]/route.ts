
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.INTERNAL_API_URL ?? "http://localhost:5000";

export async function GET(
    _request: NextRequest,
    context: {
        params: Promise<{
        torSource: string;
        torId: string;
        }>;
    }
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

    const { torSource, torId } = await context.params;

    if (
        !["internal", "government"].includes(torSource) ||
        !/^[a-f\d]{24}$/i.test(torId)
    ) {
        return NextResponse.json(
            { success: false, error: "Invalid TOR source or ID" },
            { status: 400 }
        );
    }

    try {
        const response = await fetch(
            `${API_URL}/api/matching/${torSource}/${torId}`,
            {
                method: "GET",
                headers: {
                "x-profile-email": email,
                "x-profile-proxy-secret": secret,
                },
                cache: "no-store",
            }
        );

        const data = await response.json();

        return NextResponse.json(data, {
            status: response.status,
        });
    } catch (error) {
        console.error("Matching API error:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Cannot connect to backend",
            },
            { status: 502 }
        );
    }
}
