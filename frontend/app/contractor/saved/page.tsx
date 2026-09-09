"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import Sidebar from "@/components/sideBar";
import TorDetailModal from "@/components/TORDetail";

import {
  getBookmarks,
  deleteBookmark,
  getMarketTorById,
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
} from "lucide-react";

import "./saved.css";


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


  const [savedTors, setSavedTors] =
    useState<SavedTor[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [removingId, setRemovingId] =
    useState<string | null>(null);

  const [activeTorDetail, setActiveTorDetail] =
    useState<MarketTorDetail | null>(null);

  const [detailLoading, setDetailLoading] =
    useState(false);


  /*
   * =========================
   * LOAD SAVED TORS
   * =========================
   */

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


  /*
   * =========================
   * SEARCH
   * =========================
   */

  const filteredTors = useMemo(() => {
    const keyword =
      query
        .trim()
        .toLocaleLowerCase("th");

    if (!keyword) {
      return savedTors;
    }

    return savedTors.filter((tor) =>
      `${tor.projectName}
       ${tor.agencyName}
       ${tor.projectId ?? ""}
       ${tor.torId ?? ""}`
        .toLocaleLowerCase("th")
        .includes(keyword)
    );
  }, [savedTors, query]);


  /*
   * =========================
   * REMOVE BOOKMARK
   * =========================
   */

  async function handleRemoveBookmark(
    tor: SavedTor
  ) {
    if (!userId || !tor.projectId) {
      return;
    }

    try {
      setRemovingId(tor.bookmarkId);
      setError("");

      await deleteBookmark(
        userId,
        tor.projectId
      );

      setSavedTors((prev) =>
        prev.filter(
          (item) =>
            item.bookmarkId !==
            tor.bookmarkId
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "ยกเลิกการบันทึก TOR ไม่สำเร็จ"
      );
    } finally {
      setRemovingId(null);
    }
  }


  /*
   * =========================
   * VIEW DETAIL
   * =========================
   */

  async function handleViewSavedTor(
    tor: SavedTor
  ) {
    if (!tor.projectId) {
      setError("ไม่พบรหัสโครงการ");
      return;
    }

    try {
      setDetailLoading(true);
      setError("");

      const detail =
        await getMarketTorById(
          tor.projectId
        );

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

        {/* =========================
            HEADER
        ========================= */}

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

          {/* =========================
              SEARCH
          ========================= */}

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

          </section>



          {/* =========================
              RESULT COUNT
          ========================= */}

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



          {/* =========================
              LOADING
          ========================= */}

          {loading && (
            <div className="saved-message">
              กำลังโหลด TOR ที่บันทึก...
            </div>
          )}

          {/* =========================
              ERROR
          ========================= */}

          {!loading && error && (
            <div className="saved-message error">
              {error}
            </div>
          )}



          {/* =========================
              EMPTY
          ========================= */}

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


          {/* =========================
              TOR LIST
          ========================= */}

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

                      {/* =====================
                          CONTENT
                      ===================== */}

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

                      {/* =====================
                          MATCH
                      ===================== */}

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
                                className="saved-action-button saved"
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



      {/* =========================
          DETAIL MODAL
      ========================= */}

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