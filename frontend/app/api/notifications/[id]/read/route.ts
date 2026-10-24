import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const secret = process.env.TOR_PROXY_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    const { id } = await context.params;
    try {
        const response = await fetch(`${process.env.INTERNAL_API_URL || 'http://localhost:5000'}/api/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH', headers: { 'x-profile-email': session.user.email, 'x-profile-proxy-secret': secret }, signal: AbortSignal.timeout(15000),
        });
        return NextResponse.json(await response.json(), { status: response.status });
    } catch { return NextResponse.json({ success: false, error: 'Cannot connect to backend' }, { status: 502 }); }
}
