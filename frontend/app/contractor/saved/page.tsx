"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import Sidebar from "@/components/sideBar";
import TorDetailModal from "@/components/TORDetail";
import { useToast } from "@/components/toast/ToastProvider";

import {
  getBookmarks,
  deleteBookmark,
  deleteInternalBookmark,
  getMarketTorById,
  getEgpAnnouncementUrl,
  getGovProjectDocumentDownloadUrl,
  getTorById,
  getComments,
  createComment,
  deleteComment,
  type Comment,
} from "@/lib/torApi";
import FilterDropdown from "@/components/FilterDropdown";
import type { SavedTor, MarketTorDetail, Tor } from "@/types/tor";

import {
  Search,
  BellRing,
  Building2,
  CalendarDays,
  Bookmark,
  Download,
  ExternalLink,
  Phone,
  Tag,
  ChevronDown,
  X,
  FileText,
  RotateCcw,
} from "lucide-react";
import "./saved.css";
import { getUserProfile } from "@/lib/torApi";
import TORDocumentModal from "@/components/TORDocumentModal";

type SourceFilter = 
  | 'all'
  | 'government'
  | 'internal';

type StatusFilter = 
  | "all"
  | "draft"
  | "published"
  | "closed";

type BudgetFilter =
  | "all"
  | "under1m"
  | "1m-10m"
  | "10m-100m"
  | "over100m"; 

type TimeFilter =
  | "all"
  | "new"
  | "closing"
  | "closed";

type YearFilter =
  | "all"
  | "current"
  | "1"
  | "2"
  | "3"
  | "older";

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatBudget(budget: number | null) {
  if (budget == null || Number.isNaN(budget)) {
    return "ไม่ระบุ";
  }

  if (budget >= 1_000_000_000) {
    return `฿${(budget / 1_000_000_000).toFixed(1)}B`;
  }

  if (budget >= 1_000_000) {
    return `฿${(budget / 1_000_000).toFixed(1)}M`;
  }

  if (budget >= 1_000) {
    return `฿${(budget / 1_000).toFixed(1)}K`;
  }

  return `฿${budget.toLocaleString("th-TH")}`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "ไม่ระบุ";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "ไม่ระบุ";
  }

  return dateFormatter.format(date);
}

function formatReviewDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "ไม่ระบุวันที่";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getDaysUntil(value?: string | null) {
  if (!value) {
    return null;
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const now = new Date();

  const diff = deadline.getTime() - now.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isAlmostClosing(value?: string | null) {
  const days = getDaysUntil(value);

  return days !== null && days >= 0 && days <= 7;
}

function getSourceLabel(source: SavedTor["source"]) {
  if (source === "government") {
    return "ราชการ";
  }

  return "ภายใน";
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("ปิด") ||
    normalized.includes("close") ||
    normalized.includes("สิ้นสุด")
  ) {
    return "status-closed";
  }

  return "status-open";
}

function getCurrentBuddhistYear() {
  return new Date().getFullYear() + 543;
}

function getShortBuddhistYear(yearsAgo: number) {
  return (getCurrentBuddhistYear() - yearsAgo) % 100;
}

function getSavedTorYear(tor: SavedTor): number | null {
  if (tor.source === "government") {
    if (!tor.projectId || tor.projectId.length < 2) {
      return null;
    }
    const shortYear = Number(
      tor.projectId.slice(0, 2),
    );
    if (Number.isNaN(shortYear)) {
      return null;
    }
    return 2500 + shortYear;
  }

  // Internal: ใช้ createdAt
  if (!tor.createdAt) {
    return null;
  }
  const createdAt = new Date(tor.createdAt);

  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return createdAt.getFullYear() + 543;
}

export default function SavedPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const userId = session?.user?.email ?? null;
  const [displayName, setDisplayName] = useState("");
  const userName = displayName || session?.user?.name || "ผู้ใช้";
  const initials = userName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const [savedTors, setSavedTors] = useState<SavedTor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeTorDetail, setActiveTorDetail] = useState<MarketTorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [yearFilter, setYearFilter] = useState<YearFilter>("all");
  const [reviewTor, setReviewTor] = useState<Tor | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [reviews, setReviews] = useState<Comment[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [documentTor, setDocumentTor] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  const sourceOptions: {
    value: SourceFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label: "ทุกแหล่ง",
    },
    {
      value: "government",
      label: "TOR ราชการ",
    },
    {
      value: "internal",
      label: "TOR ภายใน",
    },
  ];

  const statusOptions: {
    value: StatusFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label: "ทุกสถานะ",
    },
    {
      value: "draft",
      label: "ฉบับร่าง",
    },
    {
      value: "published",
      label: "เปิดรับ / Published",
    },
    {
      value: "closed",
      label: "ปิดรับแล้ว",
    },
  ];


  const budgetOptions: {
    value: BudgetFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label: "ทุกงบประมาณ",
    },
    {
      value: "under1m",
      label: "ต่ำกว่า 1M",
    },
    {
      value: "1m-10m",
      label: "1M - 10M",
    },
    {
      value: "10m-100m",
      label: "10M - 100M",
    },
    {
      value: "over100m",
      label: "มากกว่า 100M",
    },
  ];

  const timeOptions: {
    value: TimeFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label: "ทุกช่วงเวลา",
    },
    {
      value: "new",
      label: "มาใหม่วันนี้",
    },
    {
      value: "closing",
      label: "ใกล้ปิดรับ",
    },
    {
      value: "closed",
      label: "ปิดรับแล้ว",
    },
  ];

  const yearOptions: {
    value: YearFilter;
    label: string;
  }[] = [
    {
      value: "all",
      label: "ทุกปี",
    },
    {
      value: "current",
      label: `ปีนี้ (${getShortBuddhistYear(0)
        .toString()
        .padStart(2, "0")})`,
    },
    {
      value: "1",
      label: `1 ปีที่แล้ว (${getShortBuddhistYear(1)
        .toString()
        .padStart(2, "0")})`,
    },
    {
      value: "2",
      label: `2 ปีที่แล้ว (${getShortBuddhistYear(2)
        .toString()
        .padStart(2, "0")})`,
    },
    {
      value: "3",
      label: `3 ปีที่แล้ว (${getShortBuddhistYear(3)
        .toString()
        .padStart(2, "0")})`,
    },
    {
      value: "older",
      label: `4 ปีขึ้นไป (≤${getShortBuddhistYear(4)
        .toString()
        .padStart(2, "0")})`,
    },
  ];

  useEffect(() => {
    const email = session?.user?.email;

    if (!email) return;

    getUserProfile(email)
      .then((profile) => {
        setDisplayName(profile.name);
      })
      .catch((error) => {
        console.error("Failed to load dashboard profile:", error);

        setDisplayName(session?.user?.name ?? "");
      });
  }, [session?.user?.email, session?.user?.name]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    getBookmarks(userId)
      .then((bookmarks) => {
        setSavedTors(bookmarks);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "โหลด TOR ที่บันทึกไม่สำเร็จ",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!reviewTor) return;

    setReviewLoading(true);
    setReviewError("");

    getComments(reviewTor._id)
      .then(setReviews)
      .catch((error) => {
        console.error("Load comments error:", error);

        setReviewError(
          error instanceof Error
            ? error.message
            : "ไม่สามารถโหลดความคิดเห็นได้",
        );
      })
      .finally(() => {
        setReviewLoading(false);
      });
  }, [reviewTor]);

  const filteredTors = useMemo(() => {
    let result = [...savedTors];

      // SEARCH  
    const keyword = query.trim().toLocaleLowerCase("th");
    if (keyword) {
      result = result.filter((tor) =>
        `${tor.projectName}
         ${tor.agencyName}
         ${tor.projectId ?? ""}
         ${tor.torId ?? ""}`
          .toLocaleLowerCase("th")
          .includes(keyword),
      );
    }
  
    // SOURCE  
    if (sourceFilter !== "all") {
      result = result.filter(
        (tor) => tor.source === sourceFilter,
      );
    }
  
    // STATUS  
    if (statusFilter !== "all") {
      result = result.filter((tor) => {
        const status = tor.status?.toLowerCase() ?? "";
        const days = getDaysUntil(tor.deadline);
        if (statusFilter === "draft") {
          return (
            tor.source === "internal" &&
            status === "draft"
          );
        }
  
        if (statusFilter === "published") {
          // not draft and deadline
          return (
            status !== "draft" &&
            (days === null || days >= 0)
          );
        }
  
        if (statusFilter === "closed") {
          return (
            days !== null &&
            days < 0
          );
        }
        return true;
      });
    }
  
    // BUDGET  
    if (budgetFilter !== "all") {
      result = result.filter((tor) => {
        const budget = tor.budget;
  
        if (budget == null) {
          return false;
        }
  
        if (budgetFilter === "under1m") {
          return budget < 1_000_000;
        }
  
        if (budgetFilter === "1m-10m") {
          return (
            budget >= 1_000_000 &&
            budget < 10_000_000
          );
        }
  
        if (budgetFilter === "10m-100m") {
          return (
            budget >= 10_000_000 &&
            budget < 100_000_000
          );
        }
  
        if (budgetFilter === "over100m") {
          return budget >= 100_000_000;
        }
        return true;
      });
    }

    // TIME  
    if (timeFilter !== "all") {
      result = result.filter((tor) => {
        const days = getDaysUntil(tor.deadline);
  
        if (timeFilter === "closing") {
          return (
            days !== null &&
            days >= 0 &&
            days <= 7
          );
        }
  
        if (timeFilter === "closed") {
          return (
            days !== null &&
            days < 0
          );
        }

        if (timeFilter === "new") {
          if (!tor.createdAt) {
            return false;
          }
          const createdAt = new Date(tor.createdAt);
          if (
            Number.isNaN(
              createdAt.getTime(),
            )
          ) {
            return false;
          }
          const today = new Date();
  
          return (
            createdAt.getFullYear() === today.getFullYear() &&
            createdAt.getMonth() === today.getMonth() &&
            createdAt.getDate() === today.getDate()
          );
        }
        return true;
      });
    }
  
    // YEAR  
    if (yearFilter !== "all") {
      const currentYear = getCurrentBuddhistYear();
  
      result = result.filter((tor) => {
        const torYear = getSavedTorYear(tor);
        if (torYear === null) {
          return false;
        }
  
        if (yearFilter === "current") {
          return torYear === currentYear;
        }
  
        if (yearFilter === "1") {
          return torYear === currentYear - 1;
        }
  
        if (yearFilter === "2") {
          return torYear === currentYear - 2;
        }
  
        if (yearFilter === "3") {
          return torYear === currentYear - 3;
        }
  
        if (yearFilter === "older") {
          return torYear <= currentYear - 4;
        }
        return true;
      });
    }
    return result;
  }, [
    savedTors,
    query,
    sourceFilter,
    statusFilter,
    budgetFilter,
    timeFilter,
    yearFilter,
  ]);

  async function handleRemoveBookmark(tor: SavedTor) {
    if (!userId) {
      showToast("กรุณาเข้าสู่ระบบก่อนยกเลิกการบันทึก", "error");
      return;
    }

    try {
      setRemovingId(tor.bookmarkId);
      setError("");

      // Government TOR
      if (tor.source === "government") {
        if (!tor.projectId) {
          throw new Error("ไม่พบรหัสโครงการ");
        }

        await deleteBookmark(userId, tor.projectId);
      }

      // Internal / Draft TOR
      else {
        if (!tor.torId) {
          throw new Error("ไม่พบรหัส TOR");
        }

        await deleteInternalBookmark(userId, tor.torId);
      }

      // เอาออกจากหน้า Saved ทันที
      setSavedTors((prev) =>
        prev.filter((item) => item.bookmarkId !== tor.bookmarkId),
      );

      showToast("ยกเลิกการบันทึก TOR แล้ว");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "ยกเลิกการบันทึก TOR ไม่สำเร็จ";

      setError(message);
      showToast(message, "error");
    } finally {
      setRemovingId(null);
    }
  }

  async function handleViewSavedTor(tor: SavedTor) {
    try {
      setDetailLoading(true);
      setError("");

      // GOVERNMENT TOR
      if (tor.source === "government") {
        if (!tor.projectId) {
          throw new Error("ไม่พบรหัสโครงการ");
        }

        const detail = await getMarketTorById(tor.projectId);

        setActiveTorDetail(detail);
        return;
      }

      // INTERNAL / DRAFT TOR
      if (!tor.torId) {
        throw new Error("ไม่พบรหัส TOR");
      }

      const internalTor = await getTorById(tor.torId);

      const detail: MarketTorDetail = {
        id: internalTor._id,
        source: "internal",

        projectName: internalTor.projectName,
        agencyName: internalTor.agencyName,

        budget: internalTor.budget,

        submissionDeadline: internalTor.submissionDeadline || null,

        contactName: internalTor.contactName || "",

        contactEmail: internalTor.contactEmail || "",

        description: internalTor.description || "",

        objectives: internalTor.objectives || [],

        scopeOfWork: internalTor.scopeOfWork || [],

        requirements: internalTor.requirements || [],

        status: internalTor.status,

        createdAt: internalTor.createdAt,
        updatedAt: internalTor.updatedAt,
      };

      setActiveTorDetail(detail);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "โหลดรายละเอียด TOR ไม่สำเร็จ",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleOpenReview(tor: SavedTor) {
    console.log("1. Review clicked:", tor);
    console.log("2. torId:", tor.torId);

    if (!tor.torId) {
      console.log("❌ NO torId");
      showToast("ไม่พบรหัส TOR", "error");
      return;
    }

    try {
      console.log("3. Calling getTorById...");

      const internalTor = await getTorById(tor.torId);

      console.log("4. TOR loaded:", internalTor);

      setReviewTor(internalTor);

      console.log("5. setReviewTor called");
    } catch (error) {
      console.error("❌ Load TOR for review error:", error);

      showToast(
        error instanceof Error ? error.message : "ไม่สามารถเปิด Review ได้",
        "error",
      );
    }
  }

  function resetFilters() {
    setQuery("");
    setSourceFilter("all");
    setStatusFilter("all");
    setBudgetFilter("all");
    setTimeFilter("all");
    setYearFilter("all");
  }

  return (
    <div className="saved-page">
      <Sidebar />

      <main className="saved-main">
        <header className="saved-header">
          <div>
            <h1>ดูภายหลัง</h1>

            <p>TOR ที่คุณบันทึกไว้จากตลาดหรือรายการที่ตรงกัน</p>
          </div>

          <div className="saved-header-actions">
            <button type="button" className="saved-notification-button">
              <BellRing size={16} />
            </button>

            <div className="saved-profile-circle">{initials}</div>
          </div>
        </header>

        <div className="saved-content">
          <section className="saved-toolbar">
            {/* search */}
            <div className="saved-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="ค้นหา TOR ตามชื่อหรือหน่วยงาน..."
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
              />
            </div>

            {/* Filter */}
            <div className="saved-filter-row">
              <FilterDropdown
                value={sourceFilter}
                options={sourceOptions}
                onChange={setSourceFilter}
              />

              <FilterDropdown
                value={statusFilter}
                options={statusOptions}
                onChange={setStatusFilter}
              />

              <FilterDropdown
                value={budgetFilter}
                options={budgetOptions}
                onChange={setBudgetFilter}
              />

              <FilterDropdown
                value={timeFilter}
                options={timeOptions}
                onChange={setTimeFilter}
              />

              <FilterDropdown
                value={yearFilter}
                options={yearOptions}
                onChange={setYearFilter}
              />

              <button
                type="button"
                className="saved-reset-filter"
                onClick={resetFilters}
              >
                <RotateCcw size={16} />
                <span>ล้างตัวกรอง</span>
              </button>
            </div>
          </section>

          <div className="saved-result-count">
            <span>พบ {filteredTors.length} TOR</span>

            {query && (
              <span className="saved-search-result">
                จาก {savedTors.length} TOR ที่บันทึกไว้
              </span>
            )}
          </div>

          {loading && (
            <div className="saved-message">กำลังโหลด TOR ที่บันทึก...</div>
          )}

          {!loading && error && (
            <div className="saved-message error">{error}</div>
          )}

          {!loading && !error && filteredTors.length === 0 && (
            <div className="saved-empty">
              <div className="saved-empty-icon">
                <Bookmark size={22} />
              </div>

              <h2>
                {query ? "ไม่พบ TOR ที่ค้นหา" : "ยังไม่มี TOR ที่บันทึกไว้"}
              </h2>

              <p>
                {query
                  ? "ลองค้นหาด้วยชื่อโครงการหรือหน่วยงานอื่น"
                  : "เมื่อคุณบันทึก TOR จาก TOR Market จะปรากฏที่หน้านี้"}
              </p>
            </div>
          )}

          {!loading && filteredTors.length > 0 && (
            <section className="saved-list">
              {filteredTors.map((tor) => {
                const deadline = tor.deadline;
                // console.log("SAVED TOR:", {
                //   projectName: tor.projectName,
                //   projectId: tor.projectId,
                //   source: tor.source,
                // });
                const daysLeft = getDaysUntil(deadline);

                const almostClosing = isAlmostClosing(deadline);

                const matchPercent = tor.match?.percent;

                return (
                  <article key={tor.bookmarkId} className="saved-card">
                    <div className="saved-card-content">
                      <div className="saved-card-top">
                        <span className="saved-badge source">
                          {getSourceLabel(tor.source)}
                        </span>

                        <span
                          className={`saved-badge ${getStatusClass(
                            tor.status,
                          )}`}
                        >
                          {tor.status || "เปิดรับ"}
                        </span>

                        {tor.projectId && (
                          <span className="saved-tor-id">
                            TOR-{tor.projectId}
                          </span>
                        )}
                      </div>

                      <h2 className="saved-card-title">
                        {tor.projectName?.trim() &&
                        tor.projectName.trim() !== "ไม่ระบุชื่อโครงการ"
                          ? tor.projectName
                          : tor.projectId || "ไม่ระบุชื่อโครงการ"}
                      </h2>

                      <div className="saved-agency">
                        <Building2 size={15} />

                        <span>{tor.agencyName || "ไม่ระบุหน่วยงาน"}</span>
                      </div>

                      <div className="saved-card-meta">
                        {/* Budget */}

                        <div className="saved-meta-item">
                          <span className="saved-money-icon">฿</span>

                          <strong>{formatBudget(tor.budget)}</strong>
                        </div>

                        {/* Type */}
                        <div className="saved-meta-item">
                          <Tag size={15} />

                          <span>Software Project</span>
                        </div>

                        {/* Deadline */}

                        <div className="saved-meta-item">
                          <CalendarDays size={15} />

                          <span>
                            ปิดรับ <strong>{formatDate(deadline)}</strong>
                          </span>
                        </div>

                        {/* Closing */}
                        {almostClosing && daysLeft !== null && (
                          <span className="saved-closing-badge">
                            {daysLeft === 0
                              ? "ปิดวันนี้"
                              : `${daysLeft} วันคงเหลือ`}
                          </span>
                        )}
                      </div>

                      {tor.description && (
                        <p className="saved-card-description">
                          {tor.description}
                        </p>
                      )}
                    </div>

                    <div className="saved-match">
                      {typeof matchPercent === "number" ? (
                        <>
                          <div className="saved-match-circle">
                            <svg viewBox="0 0 100 100">
                              <circle
                                className="saved-match-track"
                                cx="50"
                                cy="50"
                                r="40"
                              />

                              <circle
                                className="saved-match-progress"
                                cx="50"
                                cy="50"
                                r="40"
                                style={{
                                  strokeDashoffset:
                                    251 - (251 * matchPercent) / 100,
                                }}
                              />
                            </svg>
                            <span>{matchPercent}%</span>
                          </div>

                          <small>ความตรงกัน</small>
                        </>
                      ) : (
                        <div></div>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div className="saved-card-actions">
                      <button
                        type="button"
                        className="saved-action-button"
                        onClick={() => handleViewSavedTor(tor)}
                      >
                        ดูรายละเอียด
                      </button>

                      <button
                        type="button"
                        className="saved-action-button"
                        onClick={() => handleRemoveBookmark(tor)}
                        disabled={removingId === tor.bookmarkId}
                      >
                        <Bookmark size={14} fill="currentColor" />

                        {removingId === tor.bookmarkId
                          ? "กำลังยกเลิก..."
                          : "บันทึกแล้ว"}
                      </button>

                      {tor.source === "internal" &&
                      tor.status.toLowerCase() === "draft" ? (
                        <button
                          type="button"
                          className="saved-action-button"
                          onClick={() => handleOpenReview(tor)}
                        >
                          รีวิว
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="saved-action-button primary"
                          >
                            <Phone size={15} />
                            ติดต่อเจ้าของโครงการ
                          </button>

                          {tor.source === "government" && tor.projectId && (
                            <>
                              <button
                                type="button"
                                className="saved-action-button"
                                onClick={() =>
                                  window.open(
                                    getEgpAnnouncementUrl(tor.projectId!),
                                    "_blank",
                                    "noopener,noreferrer",
                                  )
                                }
                              >
                                <ExternalLink size={15} />
                                ไปยังหน้า TOR
                              </button>

                              <button
                                  type="button"
                                  className="saved-action-button"
                                  onClick={() =>
                                      setDocumentTor({
                                          projectId: tor.projectId!,
                                          projectName:
                                              tor.projectName?.trim() ||
                                              tor.projectId!,
                                      })
                                  }
                              >
                                  <FileText size={15} />
                                  เอกสาร TOR
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </main>

      {detailLoading && (
        <div className="saved-loading-overlay">
          <div className="saved-loading-box">กำลังโหลดรายละเอียด TOR...</div>
        </div>
      )}

      {activeTorDetail && (
        <TorDetailModal
          tor={activeTorDetail}
          onClose={() => setActiveTorDetail(null)}
        />
      )}

      {documentTor && (
          <TORDocumentModal
              projectId={documentTor.projectId}
              projectName={documentTor.projectName}
              onClose={() => setDocumentTor(null)}
          />
      )}

      {reviewTor && (
        <div
          className="draft-modal-overlay"
          onClick={() => {
            setReviewTor(null);
            setReviews([]);
            setReviewText("");
            setReviewError("");
          }}
        >
          <div className="review-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="draft-modal-close"
              onClick={() => setReviewTor(null)}
            >
              <X size={20} />
            </button>

            <h2>เขียนความคิดเห็น</h2>

            <p className="review-modal-sub">{reviewTor.projectName}</p>

            <div className="review-list">
              <h3>ความคิดเห็น</h3>

              {reviewLoading ? (
                <p className="no-review">กำลังโหลดความคิดเห็น...</p>
              ) : reviews.length === 0 ? (
                <p className="no-review">ยังไม่มีความคิดเห็น</p>
              ) : (
                reviews.map((review) => (
                  <div className="review-item" key={review._id}>
                    <div className="review-item-header">
                      <strong>{review.userName}</strong>

                      <span>{formatReviewDate(review.createdAt)}</span>
                    </div>

                    <p>{review.content}</p>

                    {session?.user?.email === review.userId && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteComment(review._id, review.userId);

                            setReviews((prev) =>
                              prev.filter((item) => item._id !== review._id),
                            );

                            showToast("ลบความคิดเห็นสำเร็จ");
                          } catch (error) {
                            const message =
                              error instanceof Error
                                ? error.message
                                : "ไม่สามารถลบความคิดเห็นได้";

                            setReviewError(message);

                            showToast(message, "error");
                          }
                        }}
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {reviewError && <p className="review-error">{reviewError}</p>}

            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="เขียนความคิดเห็นของคุณ..."
              rows={5}
            />

            <div className="review-modal-actions">
              <button
                type="button"
                className="review-cancel"
                onClick={() => {
                  setReviewText("");
                  setReviewTor(null);
                }}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className="review-submit"
                disabled={reviewLoading}
                onClick={async () => {
                  const userId = session?.user?.email;

                  const userName =
                    session?.user?.name || session?.user?.email || "";

                  if (!userId || !reviewTor) {
                    const message = "กรุณาเข้าสู่ระบบก่อนแสดงความคิดเห็น";

                    setReviewError(message);
                    showToast(message, "error");
                    return;
                  }

                  if (!reviewText.trim()) return;

                  try {
                    setReviewLoading(true);
                    setReviewError("");

                    const newComment = await createComment(
                      userId,
                      userName,
                      reviewTor._id,
                      reviewText,
                    );

                    setReviews((prev) => [newComment, ...prev]);

                    setReviewText("");

                    showToast("ส่งความคิดเห็นสำเร็จ");
                  } catch (error) {
                    console.error("Create comment error:", error);

                    const message =
                      error instanceof Error
                        ? error.message
                        : "ไม่สามารถเพิ่มความคิดเห็นได้";

                    setReviewError(message);
                    showToast(message, "error");
                  } finally {
                    setReviewLoading(false);
                  }
                }}
              >
                ส่งความคิดเห็น
              </button>
            </div>
          </div>
        </div>
        
      )}
    </div>
  );
}
