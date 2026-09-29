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
  getTorById,
} from "@/lib/torApi";

import type {
  SavedTor,
  MarketTorDetail,
} from "@/types/tor";

import {
  Search,
  BellRing,
  Building2,
  CalendarDays,
  Bookmark,
  ExternalLink,
  Phone,
  Tag,
  ChevronDown,
} from "lucide-react";

import "./saved.css";

type StatusFilter = "all" | "draft" | "published";

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


function getDaysUntil(value?: string | null) {
  if (!value) {
    return null;
  }

  const deadline = new Date(value);

  if (Number.isNaN(deadline.getTime())) {
    return null;
  }

  const now = new Date();

  const diff =
    deadline.getTime() - now.getTime();

  return Math.ceil(
    diff / (1000 * 60 * 60 * 24)
  );
}


function isAlmostClosing(value?: string | null) {
  const days = getDaysUntil(value);

  return (
    days !== null &&
    days >= 0 &&
    days <= 7
  );
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


export default function SavedPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();

  const userId =
    session?.user?.email ?? null;

  const userName =
    session?.user?.name ?? "ผู้ใช้";

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

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
          err instanceof Error
            ? err.message
            : "โหลด TOR ที่บันทึกไม่สำเร็จ"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  const filteredTors = useMemo(() => {
    let result = [...savedTors];
  
    // SEARCH
    const keyword = query
      .trim()
      .toLocaleLowerCase("th");
  
    if (keyword) {
      result = result.filter((tor) =>
        `${tor.projectName}
         ${tor.agencyName}
         ${tor.projectId ?? ""}
         ${tor.torId ?? ""}`
          .toLocaleLowerCase("th")
          .includes(keyword)
      );
    }
  
    // STATUS FILTER
    if (statusFilter !== "all") {
      result = result.filter((tor) => {
        if (statusFilter === "draft") {
          return tor.source === "internal";
        }
  
        if (statusFilter === "published") {
          return tor.source === "government";
        }
  
        return true;
      });
    }
  
    return result;
  }, [savedTors, query, statusFilter]);

  async function handleRemoveBookmark(
    tor: SavedTor
  ) {
    if (!userId) {
      showToast(
        "กรุณาเข้าสู่ระบบก่อนยกเลิกการบันทึก",
        "error"
      );
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
  
        await deleteBookmark(
          userId,
          tor.projectId
        );
      }
  
      // Internal / Draft TOR
      else {
        if (!tor.torId) {
          throw new Error("ไม่พบรหัส TOR");
        }
  
        await deleteInternalBookmark(
          userId,
          tor.torId
        );
      }
  
      // เอาออกจากหน้า Saved ทันที
      setSavedTors((prev) =>
        prev.filter(
          (item) =>
            item.bookmarkId !== tor.bookmarkId
        )
      );
  
      showToast("ยกเลิกการบันทึก TOR แล้ว");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "ยกเลิกการบันทึก TOR ไม่สำเร็จ";
  
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
  
        const detail = await getMarketTorById(
          tor.projectId
        );
  
        setActiveTorDetail(detail);
        return;
      }
  
      // INTERNAL / DRAFT TOR
      if (!tor.torId) {
        throw new Error("ไม่พบรหัส TOR");
      }
  
      const internalTor = await getTorById(
        tor.torId
      );
  
      const detail: MarketTorDetail = {
        id: internalTor._id,
        source: "internal",
  
        projectName: internalTor.projectName,
        agencyName: internalTor.agencyName,
  
        budget: internalTor.budget,
  
        submissionDeadline:
          internalTor.submissionDeadline || null,
  
        contactName:
          internalTor.contactName || "",
  
        contactEmail:
          internalTor.contactEmail || "",
  
        description:
          internalTor.description || "",
  
        objectives:
          internalTor.objectives || [],
  
        scopeOfWork:
          internalTor.scopeOfWork || [],
  
        requirements:
          internalTor.requirements || [],
  
        status: internalTor.status,
  
        createdAt: internalTor.createdAt,
        updatedAt: internalTor.updatedAt,
      };
  
      setActiveTorDetail(detail);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "โหลดรายละเอียด TOR ไม่สำเร็จ"
      );
    } finally {
      setDetailLoading(false);
    }
  }


  return (
    <div className="saved-page">

      <Sidebar />

      <main className="saved-main">
        <header className="saved-header">

          <div>
            <h1>Saved</h1>

            <p>
              TORs you have saved from the market or matches
            </p>
          </div>


          <div className="saved-header-actions">

            <button
              type="button"
              className="saved-notification-button"
            >
              <BellRing size={16} />
            </button>


            <div className="saved-profile-circle">
              {initials}
            </div>

          </div>

        </header>

        <div className="saved-content">

          <section className="saved-toolbar">

            <div className="saved-search">

              <Search size={18} />

              <input
                type="text"
                placeholder="ค้นหา TOR ตามชื่อหรือหน่วยงาน..."
                value={query}
                onChange={(event) =>
                  setQuery(
                    event.target.value
                  )
                }
              />

            </div>

            <div className="saved-filter-select">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as StatusFilter
                  )
                }
              >
                <option value="all">สถานะทั้งหมด</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>

              <ChevronDown size={15} />
            </div>
          </section>

          <div className="saved-result-count">

            <span>
              พบ {filteredTors.length} TOR
            </span>

            {query && (
              <span className="saved-search-result">
                จาก {savedTors.length} TOR ที่บันทึกไว้
              </span>
            )}

          </div>

          {loading && (
            <div className="saved-message">
              กำลังโหลด TOR ที่บันทึก...
            </div>
          )}

          {!loading && error && (
            <div className="saved-message error">
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            filteredTors.length === 0 && (

              <div className="saved-empty">

                <div className="saved-empty-icon">
                  <Bookmark size={22} />
                </div>

                <h2>
                  {query
                    ? "ไม่พบ TOR ที่ค้นหา"
                    : "ยังไม่มี TOR ที่บันทึกไว้"}
                </h2>

                <p>
                  {query
                    ? "ลองค้นหาด้วยชื่อโครงการหรือหน่วยงานอื่น"
                    : "เมื่อคุณบันทึก TOR จาก TOR Market จะปรากฏที่หน้านี้"}
                </p>

              </div>
            )}

          {!loading &&
            filteredTors.length > 0 && (

              <section className="saved-list">

                {filteredTors.map((tor) => {

                  const deadline =
                    tor.deadline;

                  const daysLeft =
                    getDaysUntil(
                      deadline
                    );

                  const almostClosing =
                    isAlmostClosing(
                      deadline
                    );

                  const matchPercent =
                    tor.match?.percent;


                  return (
                    <article
                      key={tor.bookmarkId}
                      className="saved-card"
                    >

                      <div className="saved-card-content">

                        <div className="saved-card-top">

                          <span className="saved-badge source">
                            {getSourceLabel(
                              tor.source
                            )}
                          </span>


                          <span
                            className={`saved-badge ${getStatusClass(
                              tor.status
                            )}`}
                          >
                            {tor.status ||
                              "เปิดรับ"}
                          </span>


                          {tor.projectId && (
                            <span className="saved-tor-id">
                              TOR-{tor.projectId}
                            </span>
                          )}

                        </div>

                        <h2 className="saved-card-title">
                          {tor.projectName}
                        </h2>

                        <div className="saved-agency">

                          <Building2
                            size={15}
                          />

                          <span>
                            {tor.agencyName ||
                              "ไม่ระบุหน่วยงาน"}
                          </span>

                        </div>

                        <div className="saved-card-meta">

                          {/* Budget */}

                          <div className="saved-meta-item">

                            <span className="saved-money-icon">
                              ฿
                            </span>

                            <strong>
                              {formatBudget(
                                tor.budget
                              )}
                            </strong>

                          </div>

                          {/* Type */}
                          <div className="saved-meta-item">

                            <Tag size={15} />

                            <span>
                              Software Project
                            </span>

                          </div>

                          {/* Deadline */}

                          <div className="saved-meta-item">
                            <CalendarDays
                              size={15}
                            />

                            <span>
                              ปิดรับ{" "}
                              <strong>
                                {formatDate(
                                  deadline
                                )}
                              </strong>
                            </span>

                          </div>

                          {/* Closing */}
                          {almostClosing &&
                            daysLeft !== null && (

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
                        {typeof matchPercent ===
                          "number" ? (
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
                                      251 -
                                      (251 *
                                        matchPercent) /
                                        100,
                                  }}
                                />
                              </svg>
                              <span>
                                {matchPercent}%
                              </span>

                            </div>

                            <small>
                              ความตรงกัน
                            </small>
                          </>

                        ) : (

                          <div>
                          </div>

                        )}

                      </div>

                      {/* ACTIONS */}

                      <div className="saved-card-actions">
                            <button
                                type="button"
                                className="saved-action-button"
                                onClick={() =>
                                    handleViewSavedTor(
                                    tor
                                    )
                                }
                            >
                                ดูรายละเอียด
                            </button>

                            <button
                                type="button"
                                className="saved-action-button"
                                onClick={() =>
                                    handleRemoveBookmark(
                                    tor
                                    )
                                }
                                disabled={
                                    removingId ===
                                    tor.bookmarkId
                                }
                            >
                                <Bookmark size={15} fill="currentColor" />
                                {removingId ===
                                    tor.bookmarkId
                                        ? "กำลังยกเลิก..."
                                        : "บันทึกแล้ว"
                                }
                            </button>

                            <button
                                type="button"
                                className="saved-action-button primary"
                            >
                                <Phone size={15} />
                                ติดต่อเจ้าของโครงการ
                            </button>



                            <button
                                type="button"
                                className="saved-action-button"
                            >
                                <ExternalLink size={15} />
                                ไปยังหน้า TOR
                            </button>

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
          <div className="saved-loading-box">
            กำลังโหลดรายละเอียด TOR...
          </div>
        </div>
      )}


      {activeTorDetail && (
        <TorDetailModal
          tor={activeTorDetail}
          onClose={() =>
            setActiveTorDetail(null)
          }
        />
      )}

    </div>
  );
}
