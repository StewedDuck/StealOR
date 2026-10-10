"use client";

import { useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import {
    Search,
    CheckCircle2,
    XCircle,
    CircleHelp,
    Bookmark,
    BookmarkCheck,
    CalendarDays,
    Wallet,
    X,
    SlidersHorizontal,
    ExternalLink,
    FileText,
} from "lucide-react";

import "./matching.css";

type MatchStatus = "match" | "not_match" | "unknown";
type OverallStatus = "Match" | "Not Match" | "ข้อมูลไม่เพียงพอ";
type SortOrder = "desc" | "asc";

type Requirement = {
    id: string;
    category: string;
    name: string;
    required: string;
    actual: string;
    mandatory: boolean;
    weight: number;
    status: MatchStatus;
    reason: string;
};

type MockTor = {
    id: string;
    title: string;
    agency: string;
    source: string;
    budget: number;
    deadline: string;
    category: string;
    description: string;
    objectives: string[];
    scopeOfWork: string[];
    contactName: string;
    contactEmail: string;
    requirements: Requirement[];
    torPageUrl?: string;
    documentUrl?: string;
};

// MOCK DATA
const mockTors: MockTor[] = [
  {
    id: "TOR-2569-0151",
    title: "โครงการพัฒนาระบบบริหารจัดการเอกสารอิเล็กทรอนิกส์",
    agency: "สำนักเทคโนโลยีสารสนเทศ กรุงเทพมหานคร",
    source: "TOR ภายใน",
    budget: 5500000,
    deadline: "2026-10-30",
    category: "Web Application",
    description:
      "พัฒนาระบบจัดเก็บ ค้นหา และติดตามเอกสารภายในองค์กร เพื่อเพิ่มประสิทธิภาพการทำงาน",
    objectives: [
      "พัฒนาระบบจัดเก็บเอกสารในรูปแบบดิจิทัล",
      "เพิ่มความสะดวกในการค้นหาและติดตามเอกสาร",
      "ลดขั้นตอนการทำงานด้วยเอกสารกระดาษ",
    ],
    scopeOfWork: [
      "พัฒนา Web Application สำหรับจัดการเอกสาร",
      "พัฒนาระบบ Login และจัดการสิทธิ์ผู้ใช้",
      "พัฒนา Dashboard และระบบแจ้งเตือน",
      "เชื่อมต่อ REST API กับระบบภายใน",
    ],
    contactName: "เจ้าของโครงการ",
    contactEmail: "contact@example.com",
    requirements: [
      {
        id: "r1",
        category: "Technical Skills",
        name: "React / Next.js",
        required: "มีทักษะ React หรือ Next.js",
        actual: "มี React และ Next.js",
        mandatory: true,
        weight: 20,
        status: "match",
        reason: "มีทักษะตรงกับเทคโนโลยีที่ TOR ต้องการ",
      },
      {
        id: "r2",
        category: "Technical Skills",
        name: "Database",
        required: "MongoDB หรือ PostgreSQL",
        actual: "มี MongoDB",
        mandatory: true,
        weight: 15,
        status: "match",
        reason: "มีทักษะฐานข้อมูลตามที่กำหนด",
      },
      {
        id: "r3",
        category: "Experience",
        name: "ประสบการณ์ทำงาน",
        required: "อย่างน้อย 2 ปี",
        actual: "3 ปี",
        mandatory: true,
        weight: 20,
        status: "match",
        reason: "มีประสบการณ์มากกว่าขั้นต่ำที่กำหนด",
      },
      {
        id: "r4",
        category: "Technical Skills",
        name: "REST API",
        required: "มีประสบการณ์พัฒนา REST API",
        actual: "มี REST API",
        mandatory: true,
        weight: 15,
        status: "match",
        reason: "มีทักษะตรงตามข้อกำหนด",
      },
      {
        id: "r5",
        category: "Company Qualifications",
        name: "ทุนจดทะเบียน",
        required: "อย่างน้อย ฿2,000,000",
        actual: "฿1,000,000",
        mandatory: true,
        weight: 20,
        status: "not_match",
        reason: "ทุนจดทะเบียนต่ำกว่าเกณฑ์ ฿1,000,000",
      },
      {
        id: "r6",
        category: "Certifications",
        name: "ISO/IEC 27001",
        required: "มีใบรับรอง ISO/IEC 27001",
        actual: "ยังไม่ได้ระบุ",
        mandatory: false,
        weight: 10,
        status: "unknown",
        reason: "ยังไม่มีข้อมูลใบรับรองในโปรไฟล์",
      },
    ],
  },
  {
    id: "TOR-2569-0142",
    title: "โครงการพัฒนาเว็บไซต์และระบบบริการประชาชนออนไลน์",
    agency: "สำนักงานเขต กรุงเทพมหานคร",
    source: "TOR ภายใน",
    budget: 2800000,
    deadline: "2026-11-15",
    category: "Web Application",
    description:
      "พัฒนาเว็บไซต์สำหรับให้บริการประชาชนและติดตามคำร้องออนไลน์",
    objectives: [
      "เพิ่มช่องทางให้บริการประชาชนผ่านระบบออนไลน์",
      "ลดระยะเวลาในการยื่นและติดตามคำร้อง",
    ],
    scopeOfWork: [
      "พัฒนาเว็บไซต์ Responsive",
      "พัฒนาระบบยื่นคำร้องและติดตามสถานะ",
      "จัดทำระบบรายงานและ Dashboard",
    ],
    contactName: "ฝ่ายเทคโนโลยีสารสนเทศ",
    contactEmail: "web@example.com",
    requirements: [
      {
        id: "r1",
        category: "Technical Skills",
        name: "React",
        required: "มีทักษะ React",
        actual: "มี React",
        mandatory: true,
        weight: 30,
        status: "match",
        reason: "มี React ตามที่กำหนด",
      },
      {
        id: "r2",
        category: "Experience",
        name: "ประสบการณ์",
        required: "อย่างน้อย 2 ปี",
        actual: "3 ปี",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีประสบการณ์เพียงพอ",
      },
      {
        id: "r3",
        category: "Technical Skills",
        name: "Node.js",
        required: "มีทักษะ Node.js",
        actual: "มี Node.js",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีทักษะตรงตามข้อกำหนด",
      },
      {
        id: "r4",
        category: "Work Preferences",
        name: "พื้นที่ให้บริการ",
        required: "กรุงเทพมหานคร",
        actual: "กรุงเทพมหานคร",
        mandatory: true,
        weight: 20,
        status: "match",
        reason: "สามารถให้บริการในพื้นที่ที่กำหนด",
      },
    ],
  },
  {
    id: "TOR-2569-0161",
    title: "โครงการพัฒนาระบบวิเคราะห์ข้อมูลและรายงานอัจฉริยะ",
    agency: "หน่วยงานภาครัฐ",
    source: "TOR ภายใน",
    budget: 4200000,
    deadline: "2026-11-25",
    category: "AI / Data",
    description:
      "พัฒนาระบบวิเคราะห์ข้อมูลและ Dashboard เพื่อสนับสนุนการตัดสินใจ",
    objectives: [
      "รวมข้อมูลจากหลายแหล่ง",
      "สร้างรายงานและ Dashboard สำหรับผู้บริหาร",
    ],
    scopeOfWork: [
      "พัฒนาระบบ Data Processing",
      "พัฒนา Dashboard",
      "เชื่อมต่อฐานข้อมูลและ API",
    ],
    contactName: "ผู้ประสานงานโครงการ",
    contactEmail: "data@example.com",
    requirements: [
      {
        id: "r1",
        category: "Technical Skills",
        name: "Python",
        required: "มีทักษะ Python",
        actual: "มี Python",
        mandatory: true,
        weight: 30,
        status: "match",
        reason: "มีทักษะ Python",
      },
      {
        id: "r2",
        category: "Technical Skills",
        name: "Data Engineering",
        required: "มีทักษะ Data Engineering",
        actual: "ยังไม่ได้ระบุ",
        mandatory: true,
        weight: 30,
        status: "unknown",
        reason: "ข้อมูลในโปรไฟล์ไม่เพียงพอ",
      },
      {
        id: "r3",
        category: "Experience",
        name: "ประสบการณ์ด้าน AI / Data",
        required: "อย่างน้อย 4 ปี",
        actual: "3 ปี",
        mandatory: true,
        weight: 40,
        status: "not_match",
        reason: "ประสบการณ์ต่ำกว่าที่กำหนด 1 ปี",
      },
    ],
  },
  {
    id: "TOR-2569-0170",
    title: "โครงการพัฒนาระบบจัดการข้อมูลบุคลากร",
    agency: "สำนักงานเทคโนโลยีสารสนเทศ",
    source: "TOR ภายใน",
    budget: 3500000,
    deadline: "2026-12-10",
    category: "Web Application",
    description:
      "พัฒนาระบบจัดการข้อมูลบุคลากรและการทำงานภายในองค์กร",
    objectives: [
      "เพิ่มประสิทธิภาพในการจัดการข้อมูลบุคลากร",
      "ลดขั้นตอนการจัดเก็บข้อมูลแบบเดิม",
    ],
    scopeOfWork: [
      "พัฒนาระบบจัดการข้อมูลบุคลากร",
      "พัฒนาระบบจัดการสิทธิ์ผู้ใช้งาน",
      "พัฒนาระบบรายงานและ Dashboard",
    ],
    contactName: "ฝ่ายบริหารระบบ",
    contactEmail: "hr@example.com",
    requirements: [
      {
        id: "r1",
        category: "Technical Skills",
        name: "React",
        required: "มีทักษะ React",
        actual: "มี React",
        mandatory: true,
        weight: 30,
        status: "match",
        reason: "มีทักษะ React",
      },
      {
        id: "r2",
        category: "Technical Skills",
        name: "Node.js",
        required: "มีทักษะ Node.js",
        actual: "มี Node.js",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีทักษะ Node.js",
      },
      {
        id: "r3",
        category: "Experience",
        name: "ประสบการณ์",
        required: "อย่างน้อย 2 ปี",
        actual: "3 ปี",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีประสบการณ์เพียงพอ",
      },
      {
        id: "r4",
        category: "Certifications",
        name: "Scrum Master",
        required: "มีใบรับรอง Scrum Master",
        actual: "ไม่มีใบรับรอง",
        mandatory: false,
        weight: 20,
        status: "not_match",
        reason: "ไม่มีใบรับรองเพิ่มเติมที่ TOR แนะนำ",
      },
    ],
  },
  {
    id: "TOR-2569-0178",
    title: "โครงการพัฒนาระบบ Dashboard และรายงานข้อมูล",
    agency: "สำนักงานบริหารข้อมูลภาครัฐ",
    source: "TOR ภายใน",
    budget: 3100000,
    deadline: "2026-12-18",
    category: "AI / Data",
    description:
      "พัฒนาระบบ Dashboard สำหรับวิเคราะห์และติดตามข้อมูลขององค์กร",
    objectives: [
      "แสดงผลข้อมูลในรูปแบบ Dashboard",
      "สนับสนุนการตัดสินใจด้วยข้อมูล",
    ],
    scopeOfWork: [
      "พัฒนาระบบ Dashboard",
      "เชื่อมต่อ API และฐานข้อมูล",
      "พัฒนาระบบรายงาน",
    ],
    contactName: "ฝ่ายข้อมูล",
    contactEmail: "dashboard@example.com",
    requirements: [
      {
        id: "r1",
        category: "Technical Skills",
        name: "Python",
        required: "มีทักษะ Python",
        actual: "มี Python",
        mandatory: true,
        weight: 30,
        status: "match",
        reason: "มี Python ตามที่กำหนด",
      },
      {
        id: "r2",
        category: "Database",
        name: "PostgreSQL",
        required: "มีทักษะ PostgreSQL",
        actual: "มี PostgreSQL",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีทักษะฐานข้อมูลตรงตามข้อกำหนด",
      },
      {
        id: "r3",
        category: "Technical Skills",
        name: "REST API",
        required: "มีประสบการณ์ REST API",
        actual: "มี REST API",
        mandatory: true,
        weight: 25,
        status: "match",
        reason: "มีประสบการณ์ REST API",
      },
      {
        id: "r4",
        category: "Certifications",
        name: "Google Cloud Certification",
        required: "มีใบรับรอง Google Cloud",
        actual: "ยังไม่ได้ระบุ",
        mandatory: false,
        weight: 20,
        status: "unknown",
        reason: "ยังไม่มีข้อมูลใบรับรองในโปรไฟล์",
      },
    ],
  },
];

// MATCHING LOGIC (MOCK)
function getMatchResult(requirements: Requirement[]) {
  const checked = requirements.filter(
    (requirement) => requirement.status !== "unknown"
  );

  const totalWeight = checked.reduce(
    (sum, requirement) => sum + requirement.weight,
    0
  );

  const matchedWeight = checked
    .filter((requirement) => requirement.status === "match")
    .reduce((sum, requirement) => sum + requirement.weight, 0);

  const percentage =
    totalWeight > 0
      ? Math.round((matchedWeight / totalWeight) * 100)
      : null;

  const hasMandatoryFailure = requirements.some(
    (requirement) =>
      requirement.mandatory && requirement.status === "not_match"
  );

  const hasMandatoryUnknown = requirements.some(
    (requirement) =>
      requirement.mandatory && requirement.status === "unknown"
  );

  const status: OverallStatus = hasMandatoryFailure
    ? "Not Match"
    : hasMandatoryUnknown
      ? "ข้อมูลไม่เพียงพอ"
      : "Match";

  return { percentage, status };
}

function formatMoney(value: number) {
  return `฿${value.toLocaleString("th-TH")}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

// ========================================
// SHARED UI COMPONENTS
// ========================================

function MatchCircle({
  percentage,
}: {
  percentage: number | null;
}) {
  const value = percentage ?? 0;

  return (
    <div
      className="matching-circle"
      style={{
        background: `conic-gradient(
          #477bad ${value}%,
          #dce6f0 ${value}% 100%
        )`,
      }}
    >
      <div className="matching-circle-inner">
        {percentage === null ? "N/A" : `${percentage}%`}
      </div>
    </div>
  );
}

function ResultBadge({ status }: { status: OverallStatus }) {
  const className =
    status === "Match"
      ? "is-match"
      : status === "Not Match"
        ? "is-not-match"
        : "is-unknown";

  return (
    <span className={`matching-result-badge ${className}`}>
      {status}
    </span>
  );
}

// ========================================
// MATCHING DETAIL MODAL
// ========================================

function MatchingDetailModal({
  tor,
  onClose,
}: {
  tor: MockTor;
  onClose: () => void;
}) {
  const result = getMatchResult(tor.requirements);

  const matched = tor.requirements.filter(
    (requirement) => requirement.status === "match"
  ).length;

  const unmatched = tor.requirements.filter(
    (requirement) => requirement.status === "not_match"
  ).length;

  const unknown = tor.requirements.filter(
    (requirement) => requirement.status === "unknown"
  ).length;

  return (
    <div className="matching-modal-overlay" onClick={onClose}>
      <div
        className="matching-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`รายละเอียด ${tor.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="matching-modal-header">
          <button
            type="button"
            className="matching-modal-close"
            onClick={onClose}
            aria-label="ปิด"
          >
            <X size={21} />
          </button>

          <div className="matching-tags">
            <span>เปิดรับสมัคร</span>
            <span>{tor.source}</span>
          </div>

          <h2>{tor.title}</h2>
          <p>
            {tor.agency} · {tor.id}
          </p>
        </div>

        {/* PROJECT INFORMATION */}
        <div className="matching-modal-info">
          <div>
            <small>งบประมาณ</small>
            <strong>{formatMoney(tor.budget)}</strong>
          </div>

          <div>
            <small>กำหนดส่ง</small>
            <strong>{formatDate(tor.deadline)}</strong>
          </div>

          <div>
            <small>ผู้ติดต่อ</small>
            <strong>{tor.contactName}</strong>
          </div>
        </div>

        <div className="matching-modal-body">
          {/* DESCRIPTION */}
          <section className="matching-detail-section">
            <h3>รายละเอียดโครงการ</h3>
            <p>{tor.description}</p>
          </section>

          {/* OBJECTIVES */}
          <section className="matching-detail-section">
            <h3>วัตถุประสงค์</h3>
            <ul>
              {tor.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>

          {/* SCOPE */}
          <section className="matching-detail-section">
            <h3>ขอบเขตงาน</h3>
            <ul>
              {tor.scopeOfWork.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </section>

          {/* MATCHING ANALYSIS */}
          <section className="matching-detail-section">
            <div className="matching-analysis-title">
              <h3>ผลการตรวจคุณสมบัติ (Matching Analysis)</h3>
              <ResultBadge status={result.status} />
            </div>

            <div className="matching-analysis-summary">
              <MatchCircle percentage={result.percentage} />

              <div className="matching-analysis-summary-text">
                <strong>ความเหมาะสมของคุณกับ TOR นี้</strong>

                <p>
                  เปอร์เซ็นต์คำนวณจากน้ำหนักของ Requirements
                  ที่สามารถตรวจสอบได้ โดยไม่นำข้อที่ข้อมูลไม่เพียงพอมาคำนวณ
                </p>

                <div className="matching-analysis-counts">
                  <span className="count-match">
                    ✓ Match {matched}
                  </span>

                  <span className="count-fail">
                    ✕ Not Match {unmatched}
                  </span>

                  <span className="count-unknown">
                    ? ไม่ทราบ {unknown}
                  </span>
                </div>
              </div>
            </div>

            {/* INDIVIDUAL REQUIREMENTS */}
            <div className="matching-requirement-list">
              {tor.requirements.map((requirement) => (
                <div
                  key={requirement.id}
                  className={`matching-requirement-item ${requirement.status}`}
                >
                  <div className="matching-requirement-top">
                    {requirement.status === "match" ? (
                      <CheckCircle2 size={19} />
                    ) : requirement.status === "not_match" ? (
                      <XCircle size={19} />
                    ) : (
                      <CircleHelp size={19} />
                    )}

                    <div className="matching-requirement-name">
                      <strong>{requirement.name}</strong>
                      <small>{requirement.category}</small>
                    </div>

                    <span className="matching-mandatory">
                      {requirement.mandatory
                        ? "บังคับ"
                        : "เพิ่มเติม"}
                    </span>

                    <span className="matching-requirement-status">
                      {requirement.status === "match"
                        ? "Match"
                        : requirement.status === "not_match"
                          ? "Not Match"
                          : "ไม่ทราบ"}
                    </span>
                  </div>

                  <div className="matching-requirement-compare">
                    <div>
                      <small>TOR ต้องการ</small>
                      <p>{requirement.required}</p>
                    </div>

                    <div>
                      <small>Profile ของคุณ</small>
                      <p>{requirement.actual}</p>
                    </div>
                  </div>

                  <p className="matching-requirement-reason">
                    {requirement.reason}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* CONTACT */}
          <section className="matching-detail-section">
            <h3>ผู้ติดต่อ</h3>
            <p>
              {tor.contactName} · {tor.contactEmail}
            </p>
          </section>
        </div>

        {/* MODAL FOOTER */}
        <div className="matching-modal-footer">
          <button
            type="button"
            className="matching-outline-button"
            onClick={onClose}
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

// ========================================
// MAIN MATCHING PAGE
// ========================================

export default function MatchingPage() {
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

    const [selectedTor, setSelectedTor] = useState<MockTor | null>(
        null
    );

    const [savedIds, setSavedIds] = useState<string[]>([]);

    // Show only TORs with Match status
    const filteredTors = useMemo(() => {
        return mockTors
        .filter((tor) => {
            const search = query.toLowerCase().trim();
            const result = getMatchResult(tor.requirements);

            const matchesSearch =
            tor.title.toLowerCase().includes(search) ||
            tor.agency.toLowerCase().includes(search) ||
            tor.id.toLowerCase().includes(search);

            const matchesCategory =
            categoryFilter === "all" ||
            tor.category === categoryFilter;

            return (
            result.status === "Match" &&
            matchesSearch &&
            matchesCategory
            );
        })
        .sort((a, b) => {
            const percentA =
            getMatchResult(a.requirements).percentage ?? 0;

            const percentB =
            getMatchResult(b.requirements).percentage ?? 0;

            return sortOrder === "desc"
            ? percentB - percentA
            : percentA - percentB;
        });
    }, [query, categoryFilter, sortOrder]);

    function toggleSaved(id: string) {
        setSavedIds((current) =>
        current.includes(id)
            ? current.filter((item) => item !== id)
            : [...current, id]
        );
    }

    return (
        <div className="matching_layout">
            <Sidebar />

            <main className="matching-main-header">
                {/* PAGE HEADING */}
                <div className="matching-page-heading">
                    <h1>TOR ที่ตรงกับคุณ</h1>
                    <p>
                        ค้นหาและตรวจสอบ TOR ที่ตรงกับคุณสมบัติของคุณ
                    </p>
                </div>

                <div className="matching-page-content">
                    {/* SEARCH AND FILTERS */}
                    <div className="matching-toolbar">
                        <div className="matching-search">
                            <Search size={18} />

                            <input
                                value={query}
                                onChange={(event) =>
                                setQuery(event.target.value)
                                }
                                placeholder="ค้นหา TOR ที่ตรงกับคุณ..."
                            />
                        </div>

                        <select
                            value={categoryFilter}
                            onChange={(event) =>
                                setCategoryFilter(event.target.value)
                            }
                            aria-label="กรองประเภทโครงการ"
                        >
                            <option value="all">
                                ทุกประเภทโครงการ
                            </option>

                            <option value="Web Application">
                                Web Application
                            </option>

                            <option value="AI / Data">
                                AI / Data
                            </option>
                        </select>

                        <select
                            value={sortOrder}
                            onChange={(event) =>
                                setSortOrder(event.target.value as SortOrder)
                            }
                            aria-label="เรียงตาม Match Percentage"
                        >
                            <option value="desc">
                                Match % : มาก → น้อย
                            </option>

                            <option value="asc">
                                Match % : น้อย → มาก
                            </option>
                        </select>
                    </div>

                    {/* RESULT COUNT */}
                    <div className="matching-list-heading">
                        <span>
                            <SlidersHorizontal size={16} />
                            พบ {filteredTors.length} โครงการ
                        </span>

                        <small>
                            {sortOrder === "desc"
                                ? "เรียงตาม Match Percentage: มาก → น้อย"
                                : "เรียงตาม Match Percentage: น้อย → มาก"}
                        </small>
                    </div>

                    {/* TOR LIST */}
                    <div className="matching-tor-list">
                        {filteredTors.map((tor) => {
                            const result = getMatchResult(tor.requirements);

                            const matched = tor.requirements.filter(
                                (requirement) =>
                                requirement.status === "match"
                            );

                            const unmatched = tor.requirements.filter(
                                (requirement) =>
                                requirement.status === "not_match"
                            );

                            const unknown = tor.requirements.filter(
                                (requirement) =>
                                requirement.status === "unknown"
                            );

                            const isSaved = savedIds.includes(tor.id);

                            return (
                                <article
                                    className="matching-tor-card"
                                    key={tor.id}
                                >
                                <div className="matching-tor-main">
                                    <div className="matching-tags matching-card-tags">
                                        <span>{tor.source}</span>
                                        <span>เปิดรับสมัคร</span>
                                        <small>{tor.id}</small>
                                    </div>

                                    <small className="matching-agency">
                                        {tor.agency}
                                    </small>

                                    <h2>{tor.title}</h2>

                                    <div className="matching-tor-meta">
                                        <span>
                                            <Wallet size={15} />
                                            {formatMoney(tor.budget)}
                                        </span>

                                        <span>{tor.category}</span>

                                        <span>
                                            <CalendarDays size={15} />
                                            ปิดรับ {formatDate(tor.deadline)}
                                        </span>
                                    </div>

                                    {/* REQUIREMENT SUMMARY */}
                                    <div className="matching-tor-requirements">
                                        <div>
                                            <h3 className="count-match">
                                                <CheckCircle2 size={16} />
                                                ตรงกัน ({matched.length})
                                            </h3>

                                            {matched.map((requirement) => (
                                                <p key={requirement.id}>
                                                    ✓ {requirement.name}
                                                </p>
                                            ))}
                                        </div>

                                        <div>
                                            <h3 className="count-fail">
                                                <XCircle size={16} />
                                                ไม่ตรงกัน ({unmatched.length})
                                            </h3>

                                            {unmatched.length === 0 ? (
                                                <p className="matching-muted">
                                                    ไม่มีข้อที่ไม่ตรงกัน
                                                </p>
                                            ) : (
                                                unmatched.map((requirement) => (
                                                    <p key={requirement.id}>
                                                        ✕ {requirement.name}
                                                    </p>
                                                ))
                                            )}

                                            {unknown.length > 0 && (
                                            <>
                                                <h3 className="count-unknown">
                                                    <CircleHelp size={16} />
                                                    ข้อมูลไม่พอ ({unknown.length})
                                                </h3>

                                                {unknown.map((requirement) => (
                                                    <p key={requirement.id}>
                                                        ? {requirement.name}
                                                    </p>
                                                ))}
                                            </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* PERCENTAGE AND ACTIONS */}
                                    <div className="matching-tor-side">
                                        <MatchCircle percentage={result.percentage} />

                                        <ResultBadge status={result.status} />

                                        <div className="matching-card-actions">
                                            {/* View details */}
                                            <button
                                                type="button"
                                                className="matching-outline-button"
                                                onClick={() => setSelectedTor(tor)}
                                            >
                                                ดูรายละเอียด
                                            </button>

                                            {/* Save / Unsave */}
                                            <button
                                                type="button"
                                                className={`matching-save-button ${isSaved ? "is-saved" : ""}`}
                                                onClick={() => toggleSaved(tor.id)}
                                            >
                                                {isSaved ? (
                                                    <BookmarkCheck size={18} fill="currentColor" />
                                                ) : (
                                                    <Bookmark size={18} />
                                                )}

                                                {isSaved ? "บันทึกแล้ว" : "บันทึก"}
                                            </button>

                                            {/* Go to TOR page */}
                                            <button
                                                type="button"
                                                className="matching-outline-button"
                                                disabled={!tor.torPageUrl}
                                                onClick={() => {
                                                    if (tor.torPageUrl) {
                                                    window.open(tor.torPageUrl, "_blank", "noopener,noreferrer");
                                                    }
                                                }}
                                            >
                                                <ExternalLink size={17} />
                                                ไปยังหน้า TOR
                                            </button>

                                            {/* TOR document */}
                                            <button
                                                type="button"
                                                className="matching-outline-button"
                                                disabled={!tor.documentUrl}
                                                onClick={() => {
                                                    if (tor.documentUrl) {
                                                    window.open(tor.documentUrl, "_blank", "noopener,noreferrer");
                                                    }
                                                }}
                                            >
                                                <FileText size={17} />
                                                เอกสาร TOR
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}

                        {/* EMPTY STATE */}
                        {filteredTors.length === 0 && (
                        <div className="matching-empty">
                            ไม่พบ TOR ที่ตรงกับเงื่อนไขการค้นหา
                        </div>
                        )}
                    </div>
                </div>
            </main>

            {/* DETAIL MODAL */}
            {selectedTor && (
                <MatchingDetailModal
                tor={selectedTor}
                onClose={() => setSelectedTor(null)}
                />
            )}
        </div>
    );
}
