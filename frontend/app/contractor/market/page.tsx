"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import {
    getMarketTors,
    getMarketTorById,
    getBookmarks,
    createBookmark,
    deleteBookmark,
} from "@/lib/torApi";

import type {
    MarketTor,
    MarketTorDetail,
} from "@/types/tor";import { useSession } from "next-auth/react";
import TorDetailModal from "@/components/TORDetail";

import{
    Tag,
    Building2,
    RotateCcw,
    ChevronDown,
    Search,
    BellRing,
    CalendarDays,
    Bookmark,
    ExternalLink,
    Phone
} from 'lucide-react'
import "./market.css";


type TypeFilter = "all" | "government" | "internal";
type TimeFilter = "all" | "new" | "closing";
type SortOption = "name-asc" | "name-desc" | "newest" | "oldest";

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

function formatFullBudget(budget: number | null) {
  if (budget == null) return "ไม่ระบุ";

  return `฿${budget.toLocaleString("th-TH")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "ไม่ระบุ";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "ไม่ระบุ";
  }

  return dateFormatter.format(date);
}

function isToday(value?: string | null) {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function getDaysUntil(value?: string | null) {
  if (!value) return null;

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const now = new Date();

  const diff =
    deadline.getTime() - now.getTime();

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function isAlmostClosing(value?: string | null) {
  const days = getDaysUntil(value);

  return days !== null && days >= 0 && days <= 7;
}

function getTimeLabel(value?: string | null) {
  const days = getDaysUntil(value);

  if (days === null) {
    return null;
  }

  if (days < 0) {
    return "ปิดรับแล้ว";
  }

  if (days === 0) {
    return "ปิดวันนี้";
  }

  return `${days} วันคงเหลือ`;
}

function getSourceLabel(source: MarketTor["source"]) {
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

export default function TorMarketPage() {
    const [tors, setTors] = useState<MarketTor[]>([]);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] =
        useState<TypeFilter>("all");
    const [timeFilter, setTimeFilter] =
        useState<TimeFilter>("all");
    const [sortOption, setSortOption] =
        useState<SortOption>("name-asc");
    const [budgetFilter, setBudgetFilter] =
        useState("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [activeTor, setActiveTor] = useState<MarketTorDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [savedProjectIds, setSavedProjectIds] = useState<string[]>([]);
    const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null);

    const { data: session } = useSession();
    const userName = session?.user?.name ?? "ผู้ใช้";
    const initials = userName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    ;

    useEffect(() => {
        getMarketTors()
        .then(setTors)
        .catch((err) => {
            setError(
            err instanceof Error
                ? err.message
                : "โหลด TOR Market ไม่สำเร็จ"
            );
        })
        .finally(() => {
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        const userId = session?.user?.email;
    
        if (!userId) return;
    
        getBookmarks(userId)
            .then((bookmarks) => {
                setSavedProjectIds(
                    bookmarks
                        .filter(
                            (bookmark) =>
                                bookmark.source === "government" &&
                                bookmark.projectId
                        )
                        .map((bookmark) => bookmark.projectId!)
                );
            })
            .catch((err) => {
                console.error("Load bookmarks error:", err);
            });
    }, [session?.user?.email]);

    const filteredTors = useMemo(() => {
        let result = [...tors];

        // Search
        const keyword = query
            .trim()
            .toLocaleLowerCase("th");

        if (keyword) {
            result = result.filter((tor) =>
                `${tor.projectName} ${tor.agencyName} ${tor.projectId ?? ""}`
                .toLocaleLowerCase("th")
                .includes(keyword)
            );
        }

        // Type
        if (typeFilter !== "all") {
            result = result.filter(
                (tor) => tor.source === typeFilter
            );
        }

        // Time
        if (timeFilter === "new") {
            result = result.filter((tor) =>
                isToday(tor.createdAt)
            );
        }

        if (timeFilter === "closing") {
            result = result.filter((tor) =>
                isAlmostClosing(tor.deadline)
            );
        }

        // Budget
        if (budgetFilter !== "all") {
            result = result.filter((tor) => {
                const budget = tor.budget ?? 0;

                if (budgetFilter === "under1m") {
                return budget < 1_000_000;
                }

                if (budgetFilter === "1m-10m") {
                return (
                    budget >= 1_000_000 &&
                    budget <= 10_000_000
                );
                }

                if (budgetFilter === "10m-100m") {
                return (
                    budget > 10_000_000 &&
                    budget <= 100_000_000
                );
                }

                if (budgetFilter === "over100m") {
                return budget > 100_000_000;
                }

                return true;
            });
        }

        // Sort
        result.sort((a, b) => {
            switch (sortOption) {
                case "name-asc":
                return a.projectName.localeCompare(
                    b.projectName,
                    "th"
                );

                case "name-desc":
                return b.projectName.localeCompare(
                    a.projectName,
                    "th"
                );

                case "newest":
                return (
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );

                case "oldest":
                return (
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
                );

                default:
                return 0;
            }
        });

        return result;
    }, [
        tors,
        query,
        typeFilter,
        timeFilter,
        budgetFilter,
        sortOption,
    ]);

    function resetFilters() {
        setQuery("");
        setTypeFilter("all");
        setTimeFilter("all");
        setBudgetFilter("all");
        setSortOption("name-asc");
    }

    async function handleViewDetails(tor: MarketTor) {
        console.log("CLICK:", tor);

        if (!tor.projectId) {
            console.log("NO PROJECT ID");
            setDetailError("ไม่พบรหัสโครงการ");
            return;
        }

        try {
            setDetailLoading(true);
            setDetailError("");

            console.log("PROJECT ID:", tor.projectId);

            const detail = await getMarketTorById(tor.projectId);

            console.log("DETAIL:", detail);

            setActiveTor(detail);
        } catch (err) {
            console.error("DETAIL ERROR:", err);

            setDetailError(
                err instanceof Error
                    ? err.message
                    : "โหลดรายละเอียด TOR ไม่สำเร็จ"
            );
        } finally {
            setDetailLoading(false);
        }
    }

    async function handleBookmark(tor: MarketTor) {
        if (!tor.projectId) {
        return;
        }
  
        const userId = session?.user?.email;
  
        if (!userId) {
        setDetailError("กรุณาเข้าสู่ระบบก่อนบันทึก TOR");
        return;
        }
  
        const isSaved = savedProjectIds.includes(
        tor.projectId
        );
  
        try {
            setBookmarkLoading(tor.projectId);
            setDetailError("");
    
            if (isSaved) {
                await deleteBookmark(
                    userId,
                    tor.projectId
                );
        
                setSavedProjectIds((prev) =>
                    prev.filter(
                        (id) => id !== tor.projectId
                    )
                );
            } else {
                await createBookmark(
                    userId,
                    tor.projectId
                );
        
                setSavedProjectIds((prev) => [
                    ...prev,
                    tor.projectId!,
                ]);
            }
        } catch (err) {
            setDetailError(
                err instanceof Error
                ? err.message
                : "บันทึก TOR ไม่สำเร็จ"
            );
        } finally {
            setBookmarkLoading(null);
        }
    }

  return (
    <div className="market-page">
      <Sidebar />

      <main className="market-main">
        {/* Header */}
        <header className="market-header">
          <div>
            <h1>TOR market</h1>
            <p>
                รวบรวม TOR ทั้งหมดไว้ในที่เดียว
                พร้อมคัดกรองเฉพาะสิ่งที่สำคัญสำหรับคุณ
            </p>
          </div>

          <div className="market-header-actions">
            <button className="notification-button">
              <BellRing size={16}/>
            </button>

            <div className="profile-circle">
                {initials}
            </div>
          </div>
        </header>

        <div className="market-content">
          {/* Filters */}
          <section className="market-filters">

            {/* Search */}
            <div className="market-search">
              <Search size={18} />

              <input
                type="text"
                placeholder="ค้นหา TOR ตามชื่อหรือหน่วยงาน..."
                value={query}
                onChange={(e) =>
                  setQuery(e.target.value)
                }
              />
            </div>

            {/* Type */}
            <div className="filter-select">
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(
                    e.target.value as TypeFilter
                  )
                }
              >
                <option value="all">
                  ทุกประเภทซอฟต์แวร์
                </option>

                <option value="government">
                  Government
                </option>

                <option value="internal">
                  Internal
                </option>
              </select>

              <ChevronDown size={16} />
            </div>

            {/* Budget */}
            <div className="filter-select">
              <select
                value={budgetFilter}
                onChange={(e) =>
                  setBudgetFilter(e.target.value)
                }
              >
                <option value="all">
                  ทุกงบประมาณ
                </option>

                <option value="under1m">
                  ต่ำกว่า 1M
                </option>

                <option value="1m-10m">
                  1M - 10M
                </option>

                <option value="10m-100m">
                  10M - 100M
                </option>

                <option value="over100m">
                  มากกว่า 100M
                </option>
              </select>

              <ChevronDown size={16} />
            </div>

            {/* Time */}
            <div className="filter-select">
              <select
                value={timeFilter}
                onChange={(e) =>
                  setTimeFilter(
                    e.target.value as TimeFilter
                  )
                }
              >
                <option value="all">
                  ทุกช่วงเวลา
                </option>

                <option value="new">
                  New Today
                </option>

                <option value="closing">
                  Almost Closing
                </option>
              </select>

              <ChevronDown size={16} />
            </div>

            {/* Sort */}
            <div className="filter-select sort-select">
              <select
                value={sortOption}
                onChange={(e) =>
                  setSortOption(
                    e.target.value as SortOption
                  )
                }
              >
                <option value="name-asc">
                  เรียงตาม: ชื่อโครงการ (ก → ฮ)
                </option>

                <option value="name-desc">
                  เรียงตาม: ชื่อโครงการ (ฮ → ก)
                </option>

                <option value="newest">
                  เรียงตาม: ใหม่ล่าสุด
                </option>

                <option value="oldest">
                  เรียงตาม: เก่าสุด
                </option>
              </select>

              <ChevronDown size={16} />
            </div>

            <button
              type="button"
              className="reset-filter"
              onClick={resetFilters}
              title="ล้างตัวกรอง"
            >
              <RotateCcw size={16} />
              <span>ล้างตัวกรอง</span>
            </button>
          </section>

          {/* Result count */}
          <div className="market-result-count">
            พบ {filteredTors.length} TOR
          </div>

          {/* Loading */}
          {loading && (
            <div className="market-message">
              กำลังโหลด TOR...
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="market-message error">
              {error}
            </div>
          )}

          {/* Empty */}
          {!loading &&
            !error &&
            filteredTors.length === 0 && (
              <div className="market-message">
                ไม่พบ TOR ที่ตรงกับตัวกรอง
              </div>
            )}

          {/* TOR List */}
          <section className="market-list">
            {filteredTors.map((tor) => {
              const daysLeft = getDaysUntil(
                tor.deadline
              );

              const timeLabel = getTimeLabel(
                tor.deadline
              );

              const almostClosing =
                isAlmostClosing(tor.deadline);

            return (
                <article
                  key={tor.id}
                  className="market-card"
                >
                    {/* Left / Content */}
                    <div className="market-card-content">

                        <div className="market-card-top">
                            <span className="market-badge source">
                                {getSourceLabel(tor.source)}
                            </span>

                            <span
                                className={`market-badge ${getStatusClass(
                                tor.status
                                )}`}
                            >
                                {tor.status || "เปิดรับ"}
                            </span>

                            {tor.projectId && (
                                <span className="market-tor-id">
                                TOR-{tor.projectId}
                                </span>
                            )}
                        </div>

                        <h2 className="market-card-title">
                            {tor.projectName}
                        </h2>

                        <div className="market-agency">
                            <Building2 size={15} />
                            <span>
                                {tor.agencyName ||
                                "ไม่ระบุหน่วยงาน"}
                            </span>
                        </div>

                        <div className="market-card-meta">

                            <div className="market-meta-item">
                                <span className="meta-icon">
                                ฿
                                </span>

                                <strong>
                                {formatBudget(tor.budget)}
                                </strong>
                            </div>

                            <div className="market-meta-item">
                                <Tag size={15} />

                                <span>
                                Software Project
                                </span>
                            </div>

                            <div className="market-meta-item">
                                <CalendarDays size={15} />

                                <span>
                                    ปิดรับ{" "}
                                    <strong>
                                    {formatDate(tor.deadline)}
                                    </strong>
                                </span>
                            </div>

                            {almostClosing &&
                                daysLeft !== null && (
                                    <span className="closing-badge">
                                        {daysLeft === 0
                                        ? "ปิดวันนี้"
                                        : `${daysLeft} วันคงเหลือ`}
                                    </span>
                                )
                            }
                        </div>

                        {tor.description && (
                            <p className="market-card-description">
                                {tor.description}
                            </p>
                        )}
                    </div>

                    {/* Match */}
                    <div className="market-match">
                        {typeof tor.matchPercent === "number" && (
                            <div className="market-match">
                                <div className="match-circle">
                                <svg viewBox="0 0 100 100">
                                    <circle
                                    className="match-track"
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    />

                                    <circle
                                    className="match-progress"
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    style={{
                                        strokeDashoffset:
                                        251 - (251 * tor.matchPercent) / 100,
                                    }}
                                    />
                                </svg>

                                <span>{tor.matchPercent}%</span>
                                </div>

                                <small>ความตรงกัน</small>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="market-card-actions">
                        <button
                            type="button"
                            className="market-action-button"
                            onClick={() => handleViewDetails(tor)}
                        >
                            ดูรายละเอียด
                        </button>

                        <button
                            type="button"
                            className={`market-action-button ${
                                savedProjectIds.includes(tor.projectId ?? "")
                                ? "saved"
                                : ""
                            }`}
                            onClick={() => handleBookmark(tor)}
                            disabled={bookmarkLoading === tor.projectId}
                            >
                            <Bookmark
                                size={15}
                                fill={
                                savedProjectIds.includes(
                                    tor.projectId ?? ""
                                )
                                    ? "currentColor"
                                    : "none"
                                }
                            />

                            {bookmarkLoading === tor.projectId
                                ? "กำลังบันทึก..."
                                : savedProjectIds.includes(
                                    tor.projectId ?? ""
                                )
                                ? "บันทึกแล้ว"
                                : "บันทึก"}
                        </button>

                        <button
                            type="button"
                            className="market-action-button primary"
                        >
                            <Phone size={15} />
                            ติดต่อเจ้าของโครงการ
                        </button>

                        <button
                            type="button"
                            className="market-action-button"
                        >
                            <ExternalLink size={15} />
                            ไปยังหน้า TOR
                        </button>

                    </div>
                </article>
              );
            })}
          </section>
        </div>
      </main>
      {detailLoading && (
            <div className="market-message">
                กำลังโหลดรายละเอียด TOR...
            </div>
        )}

        {detailError && (
            <div className="market-message error">
                {detailError}
            </div>
        )}

        {activeTor && (
            <TorDetailModal
                tor={activeTor}
                onClose={() => setActiveTor(null)}
            />
        )}
    </div>
  );
}