import Link from "next/link";

export default function AuthErrorPage() {
  return <main className="login-shell"><section className="login-card">
    <h1 className="login-title">เข้าสู่ระบบไม่สำเร็จ</h1>
    <p className="login-sub">ไม่สามารถยืนยันการเข้าสู่ระบบได้ในขณะนี้ กรุณาลองอีกครั้ง</p>
    <Link className="btn-google" href="/login">กลับไปเข้าสู่ระบบ</Link>
  </section></main>;
}
