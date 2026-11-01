import Link from 'next/link';
import { ArrowRight, Bell, ChartNoAxesColumnIncreasing, Check, FileText, Search, Settings2, Users, Landmark, ExternalLink } from 'lucide-react';
import './landing.css';

const features = [
  { title: 'ค้นหา TOR', description: 'ค้นหาโครงการจากหน่วยงานภาครัฐ ด้วยตัวกรองที่ตรงกับธุรกิจของคุณ', icon: Search, theme: 'search' },
  { title: 'เทียบคุณสมบัติ', description: 'ระบบระบุทักษะ ให้คะแนนตามข้อกำหนด พร้อมเหตุผลการจับคู่ที่ตรวจสอบได้', icon: ChartNoAxesColumnIncreasing, theme: 'match' },
  { title: 'ติดตามการเปลี่ยนแปลง', description: 'บันทึกโครงการที่สนใจ และรับแจ้งเตือนเมื่อมีความคืบหน้าหรือการแก้ไข TOR', icon: Bell, theme: 'follow' },
];
const steps = [
  { title: 'เพิ่มข้อมูลและทักษะ', text: 'สร้างโปรไฟล์ ระบุประสบการณ์ เทคโนโลยี และใบรับรอง', icon: FileText },
  { title: 'ดูคะแนนพร้อมเหตุผล', text: 'เปรียบเทียบคุณสมบัติกับ TOR พร้อมดูหลักฐานประกอบ', icon: ChartNoAxesColumnIncreasing },
  { title: 'บันทึกและรับแจ้งเตือน', text: 'ติดตามโครงการที่สนใจ และเตรียมตัวก่อนหมดเขตรับสมัคร', icon: Bell },
];
function Documents({ compact = false }: { compact?: boolean }) {
  // Decorative SVGs keep the product preview text selectable and responsive.
  return <div className={`lp-documents ${compact ? 'lp-documents-compact' : ''}`} aria-hidden="true" />;
}
function Pixels() {
  return <div className="lp-pixels" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}</div>;
}
export default function LandingPage() {
  return <main className="lp-page">
    <section className="lp-hero">
      <nav className="lp-nav lp-container" aria-label="เมนูหลัก">
        <Link href="/" className="lp-wordmark">sTealORs</Link>
        <div className="lp-nav-links"><Link href="/login">ค้นหา TOR</Link><a href="#how-it-works">วิธีใช้งาน</a><a href="#audiences">เจ้าของโครงการ</a></div>
        <Link href="/login" className="lp-login">เข้าสู่ระบบ</Link>
      </nav>
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy"><h1>ค้นหา TOR<br /><span>ที่ตรงกับคุณ</span></h1><p>เปรียบเทียบคุณสมบัติ ค้นหาโอกาส และติดตามโครงการที่สนใจในที่เดียว</p>
          <div className="lp-actions"><Link href="/login" className="lp-button">ค้นหา TOR <ArrowRight size={18} /></Link><Link href="/login" className="lp-text-link">สร้าง TOR ของคุณ <ArrowRight size={18} /></Link></div>
        </div>
        <div className="lp-preview-scene"><Documents /><div className="lp-preview">
          <div className="lp-preview-caption"><span>ตัวอย่างผลการจับคู่</span><ExternalLink size={16} /></div>
          <div className="lp-preview-body"><div className="lp-preview-top"><div><h2>ระบบจัดการเอกสารออนไลน์</h2><p>กรมสารสนเทศและการสื่อสารดิจิทัล</p><div className="lp-tags"><span>React</span><span>Node.js</span><span>PostgreSQL</span></div></div><div className="lp-preview-score"><strong>83<span>%</span></strong><small>ความตรงกัน</small><div><i /></div></div></div>
            <ul>{['ตรงกับประสบการณ์งานพัฒนาระบบ', 'ตรงกับเทคโนโลยีที่ระบุใน TOR', 'ตรงกับมูลค่างานและขนาดโครงการ'].map(text => <li key={text}><Check size={14} />{text}</li>)}</ul>
          </div></div></div>
        <div className="lp-trust"><div><FileText /><span>ข้อมูล TOR ในที่เดียว<small>รวบรวมจากทุกหน่วยงานภาครัฐ</small></span></div><div><Settings2 /><span>เหตุผลการจับคู่ที่ตรวจสอบได้<small>โปร่งใส อ้างอิงจากคุณสมบัติจริง</small></span></div><div><Bell /><span>แจ้งเตือนงานที่ติดตาม<small>ไม่พลาดทุกโอกาสสำคัญ</small></span></div></div>
      </div>
    </section>
    <section className="lp-explore" id="how-it-works"><div className="lp-features"><div className="lp-cubes" aria-hidden="true" /><div className="lp-container"><span className="lp-eyebrow">สิ่งที่คุณทำได้กับ sTealORs</span><h2 className="lp-section-title">เลือกโครงการได้ชัดเจนขึ้น</h2>
      <div className="lp-feature-grid">{features.map(({ title, description, icon: Icon, theme }) => <article className={`lp-feature lp-feature-${theme}`} key={title}><div className="lp-feature-art" aria-hidden="true"><span /><span /><span /><i /><i /><i /></div><Icon className="lp-feature-icon" size={24} /><div className="lp-feature-copy"><h3>{title}</h3><p>{description}</p></div><ArrowRight className="lp-feature-arrow" size={20} aria-hidden="true" /></article>)}</div>
    </div></div>
    <div className="lp-workflow"><Pixels /><div className="lp-container lp-workflow-grid"><div><h2>จากโปรไฟล์<br />สู่โครงการที่เหมาะกับคุณ</h2><p>ให้ sTealORs ช่วยเชื่อมความสามารถของคุณ<br />กับโครงการภาครัฐที่ใช่ อย่างเป็นระบบและโปร่งใส</p></div><ol>{steps.map(({ title, text, icon: Icon }, i) => <li key={title}><span className="lp-step-number">0{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div><Icon size={21} /></li>)}</ol></div></div></section>
    <section className="lp-roles" id="audiences"><div className="lp-container"><div className="lp-audiences"><div className="lp-audience"><Users size={27} /><h2>สำหรับผู้รับจ้าง</h2><p>ค้นหาโครงการที่ตรงกับศักยภาพของคุณ เทียบคุณสมบัติ และติดตามโอกาสใหม่ได้อย่างต่อเนื่อง</p><Link href="/login" className="lp-small-link">ค้นหา TOR <ArrowRight size={16} /></Link></div><div className="lp-audience-art"><Documents compact /></div><div className="lp-audience"><Landmark size={27} /><h2>สำหรับเจ้าของโครงการ</h2><p>สร้าง TOR กำหนดคุณสมบัติ น้ำหนักคะแนน และเงื่อนไขที่จำเป็นได้ตามความต้องการ</p><Link href="/login" className="lp-small-link">สร้าง TOR ของคุณ <ArrowRight size={16} /></Link></div><div className="lp-final"><Pixels /><h2>เริ่มใช้งาน sTealORs</h2><p>เข้าสู่ระบบด้วย Google เพื่อเริ่มต้นใช้งาน</p><Link href="/login" className="lp-button">เข้าสู่ระบบ <ArrowRight size={18} /></Link></div></div></div></section>
  </main>;
}
