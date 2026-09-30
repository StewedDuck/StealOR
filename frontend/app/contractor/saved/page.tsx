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
} from "lucide-react";
import "./saved.css";
import { getUserProfile } from "@/lib/torApi";

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

export default function SavedPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();

  const userId = session?.user?.email ?? null;

  const [displayName, setDisplayName] = useState("");
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

  const [activeTorDetail, setActiveTorDetail] =
    useState<MarketTorDetail | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [reviewTor, setReviewTor] = useState<Tor | null>(null);

  const [reviewText, setReviewText] = useState("");

  const [reviews, setReviews] = useState<Comment[]>([]);

  const [reviewLoading, setReviewLoading] = useState(false);

  const [reviewError, setReviewError] = useState("");

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
            <div className="saved-search">
              <Search size={18} />

              <input
                type="text"
                placeholder="ค้นหา TOR ตามชื่อหรือหน่วยงาน..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="saved-filter-select">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
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

                      <h2 className="saved-card-title">{tor.projectName}</h2>

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
                                  window.location.assign(
                                    getGovProjectDocumentDownloadUrl(
                                      tor.projectId!,
                                    ),
                                  )
                                }
                              >
                                <Download size={15} />
                                ดาวน์โหลดเอกสาร
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
