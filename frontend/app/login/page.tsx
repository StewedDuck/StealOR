"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const GOOGLE_DEMO_EMAIL = "contractor.demo@gmail.com";

export default function LoginPage() {
  const { user, ready, loginWithGmail } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  function signInWithGoogle() {
    setLoading(true);
    // Persist + set auth first; redirect via the effect below once `user` is set
    // (avoids racing router navigation against React state updates).
    loginWithGmail(GOOGLE_DEMO_EMAIL);
  }

  if (!ready || user) {
    return (
      <div className="login-shell">
        <div className="login-card">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div
          className="brand"
          style={{ borderBottom: "none", marginBottom: 8, paddingBottom: 0 }}
        >
          <div className="brand-mark">T</div>
          <div>
            <div className="brand-name" style={{ color: "var(--ink)" }}>
              sTealORs
            </div>
            <div className="brand-sub" style={{ color: "var(--text-mid)" }}>
              ค้นหา TOR · กรุงเทพฯ
            </div>
          </div>
        </div>

        <h1 className="login-title">เข้าสู่ระบบ</h1>
        <p className="login-sub">
          ล็อกอินด้วยบัญชี Google เพื่อใช้งาน sTealORs
        </p>

        <button
          type="button"
          className="btn-google"
          onClick={signInWithGoogle}
          disabled={loading}
        >
          <GoogleIcon />
          {loading ? "กำลังเข้าสู่ระบบ..." : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.5-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16.2 19 13 24 13c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.3 3.7-4.6 6.5-8.6 7.5l.1.1 6.3 5.3C36.1 39.3 44 34 44 24c0-1.3-.1-2.5-.4-3.5z"
      />
    </svg>
  );
}
