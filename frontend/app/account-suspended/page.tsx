import Link from "next/link";
import { Shield, LockKeyhole, ArrowLeft } from "lucide-react";
import "./suspended.css";

export const metadata = { title: "บัญชีถูกระงับ | sTealORs" };

export default function AccountSuspendedPage() {
  return (
    <main className="suspension-page">
      <section className="suspension-card" aria-labelledby="suspension-title">
        <div className="suspension-content">
          <div className="suspension-visual" aria-hidden="true">
            <Shield className="suspension-shield" strokeWidth={1.5} />
            <LockKeyhole className="suspension-lock" strokeWidth={1.8} />
          </div>
          <span className="suspension-status">สถานะบัญชี</span>
          <h1 id="suspension-title">บัญชีของคุณถูกระงับ</h1>
          <p className="suspension-description">
            <span>ขณะนี้คุณไม่สามารถเข้าใช้งานระบบได้</span>
            <span>กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบรายละเอียด</span>
            <span>และขอเปิดใช้งานบัญชีอีกครั้ง</span>
          </p>
          <Link href="/" className="suspension-home-button">
            <ArrowLeft size={18} aria-hidden="true" />
            กลับสู่หน้าหลัก
          </Link>
        </div>
      </section>
    </main>
  );
}
