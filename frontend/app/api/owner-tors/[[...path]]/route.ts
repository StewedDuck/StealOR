import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.INTERNAL_API_URL ?? "http://localhost:5000";

type Context = {
    params: Promise<{ path?: string[] }>;
};

async function handler(
    request: NextRequest,
    context: Context
) {
    const session = await auth();
    const email = session?.user?.email?.trim().toLowerCase();

    if (!email) {
        return NextResponse.json(
            { success: false, error: "กรุณาเข้าสู่ระบบ" },
            { status: 401 }
        );
    }

    const secret = process.env.TOR_PROXY_SECRET;

    if (!secret) {
        return NextResponse.json(
            { success: false, error: "Missing TOR_PROXY_SECRET" },
            { status: 500 }
        );
    }

    const { path = [] } = await context.params;

    const target = new URL(
        `${BACKEND_URL}/api/tors/${path.map(encodeURIComponent).join("/")}`
    );

    target.search = request.nextUrl.search;

    const headers = new Headers();

    headers.set("x-owner-email", email);
    headers.set("x-tor-proxy-secret", secret);

    if (request.headers.get("content-type")) {
        headers.set(
            "content-type",
            request.headers.get("content-type")!
        );
    }

    try {
        const response = await fetch(target, {
        method: request.method,
        headers,
        body:
            request.method === "GET" ||
            request.method === "HEAD"
                ? undefined
                : await request.arrayBuffer(),
        cache: "no-store",
        });

        return new NextResponse(response.body, {
            status: response.status,
            headers: {
                "content-type":
                response.headers.get("content-type") ??
                "application/json",
            },
        });
    } catch (error) {
        console.error("TOR proxy error:", error);

        return NextResponse.json(
            { success: false, error: "Backend connection failed" },
            { status: 502 }
        );
    }
}

export {
    handler as GET,
    handler as POST,
    handler as PATCH,
    handler as DELETE,
};