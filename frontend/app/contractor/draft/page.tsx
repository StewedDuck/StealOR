"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";
import {
    getDraftTors,
    getComments,
    createComment,
    deleteComment,
    getBookmarks,
    createInternalBookmark,
    deleteInternalBookmark,
    getUserProfile,
} from "@/lib/torApi";
import type { Tor } from "@/types/tor";
import {
    FileText,
    Search,
    TriangleAlert,
    X,
    BellRing,
    Bookmark,
    RotateCcw,
} from "lucide-react";
import "./draft.css";
import TorDetailModal from "@/components/TORDetail";
import { useSession } from "next-auth/react";
import type { Comment } from "@/lib/torApi";
import FilterDropdown from "@/components/FilterDropdown";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

function formatBudget(budget: number | null) {
    return budget == null ? "ไม่ระบุ" : `฿${budget.toLocaleString("th-TH")}`;
}

function formatDate(value: string | null) {
    if (!value) return "ไม่ระบุ";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "ไม่ระบุ";
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

function getCurrentBuddhistYear() {
    return new Date().getFullYear() + 543;
}

function getShortBuddhistYear(yearsAgo: number) {
    return (getCurrentBuddhistYear() - yearsAgo) % 100;
}

function isToday(value?: string | null) {
    if (!value) return false;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    const today = new Date();

    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}

function getDaysUntil(value?: string | null) {
    if (!value) return null;

    const target = new Date(value);

    if (Number.isNaN(target.getTime())) {
        return null;
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    return Math.ceil(
        (target.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
    );
}

export default function ContractorDraftTOR() {
    const [tors, setTors] = useState<Tor[]>([]);
    const [query, setQuery] = useState("");
    const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
    const [yearFilter, setYearFilter] = useState<YearFilter>("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeTor, setActiveTor] = useState<Tor | null>(null);
    const [reviewTor, setReviewTor] = useState<Tor | null>(null);
    const [reviewText, setReviewText] = useState("");
    const [reviews, setReviews] = useState<Comment[]>([]);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [savedTorIds, setSavedTorIds] = useState<string[]>([]);
    const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null);

    const { data: session } = useSession();
    const { showToast } = useToast();

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
        const userId = session?.user?.email;
    
        if (!userId) return;
    
        getBookmarks(userId)
            .then((bookmarks) => {
                setSavedTorIds(
                    bookmarks
                        .filter(
                            (bookmark) =>
                                bookmark.source === "internal" &&
                                bookmark.torId
                        )
                        .map((bookmark) => bookmark.torId!)
                );
            })
            .catch((err) => {
                console.error("Load draft bookmarks error:", err);
            });
    }, [session?.user?.email]);

    useEffect(() => {
        getDraftTors()
            .then(setTors)
            .catch((err) => setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ"))
            .finally(() => setLoading(false));
    }, []);

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
                        : "ไม่สามารถโหลดความคิดเห็นได้"
                );
            })
            .finally(() => {
                setReviewLoading(false);
            });
    }, [reviewTor]);

    const visibleTors = useMemo(() => {
        let result = [...tors];
        // Search
        const keyword = query.trim().toLocaleLowerCase("th");
        if (keyword) {
            result = result.filter((tor) =>
                `${tor.projectName} ${tor.agencyName}`
                    .toLocaleLowerCase("th")
                    .includes(keyword)
            );
        }
    
        // Budget
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

        // Time
        if (timeFilter === "new") {
            result = result.filter((tor) =>
                isToday(tor.createdAt)
            );
        }
    
        if (timeFilter === "closing") {
            result = result.filter((tor) => {
                const days =
                    getDaysUntil(
                        tor.submissionDeadline
                    );
    
                return (
                    days !== null &&
                    days >= 0 &&
                    days <= 7
                );
            });
        }
    
        if (timeFilter === "closed") {
            result = result.filter((tor) => {
                const days =
                    getDaysUntil(
                        tor.submissionDeadline
                    );
    
                return (
                    days !== null &&
                    days < 0
                );
            });
        }
    
        // Year: Internal TOR uses createdAt
        if (yearFilter !== "all") {
            const currentYear = new Date().getFullYear();
    
            result = result.filter((tor) => {
                if (!tor.createdAt) {
                    return false;
                }
    
                const createdAt = new Date(tor.createdAt);
    
                if (Number.isNaN (
                        createdAt.getTime()
                    )
                ) {
                    return false;
                }
    
                const torYear = createdAt.getFullYear();
    
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
        tors,
        query,
        budgetFilter,
        timeFilter,
        yearFilter,
    ]);

    async function handleBookmark(tor: Tor) {
        const userId = session?.user?.email;
    
        if (!userId) {
            showToast("กรุณาเข้าสู่ระบบก่อนบันทึก TOR", "error");
            return;
        }
    
        const isSaved = savedTorIds.includes(tor._id);
    
        try {
            setBookmarkLoading(tor._id);
    
            if (isSaved) {
                await deleteInternalBookmark(
                    userId,
                    tor._id
                );
    
                setSavedTorIds((prev) =>
                    prev.filter((id) => id !== tor._id)
                );
    
                showToast("ยกเลิกการบันทึก TOR แล้ว");
            } else {
                await createInternalBookmark(
                    userId,
                    tor._id
                );
    
                setSavedTorIds((prev) => [
                    ...prev,
                    tor._id,
                ]);
    
                showToast("บันทึก TOR แล้ว");
            }
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : "บันทึก TOR ไม่สำเร็จ";
    
            showToast(message, "error");
        } finally {
            setBookmarkLoading(null);
        }
    }

    const [displayName, setDisplayName] = useState("");
    
    useEffect(() => {
        const email = session?.user?.email;
      
        if (!email) return;
      
        getUserProfile(email)
            .then((profile) => {
                setDisplayName(profile.name);
            })
            .catch((error) => {
                console.error(
                    "Failed to load dashboard profile:",
                    error
                );
      
                  setDisplayName(session?.user?.name ?? "");
            }
        );
    }, [session?.user?.email, session?.user?.name]);
      
    const userName = displayName || session?.user?.name || "ผู้ใช้";
    
    const initials = userName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    ;

    function resetFilters() {
        setQuery("");
        setBudgetFilter("all");
        setTimeFilter("all");
        setYearFilter("all");
    }

    return (
        <div className="draft_layout">
            <Sidebar />

            <main className="draft-main">
                <header className="draft-header">
                    <div className="draft-header-content">
                        <h1>TOR ฉบับร่าง</h1>
                        <p>อ่านและติดตาม TOR ที่เจ้าของโครงการกำลังจัดทำ ก่อนเปิดรับสมัครจริง</p>
                    </div>

                    <div className="profile-header-actions">
                        <button className="notification-button">
                        <BellRing size={16}/>
                        </button>

                        <div className="profile-circle">
                            {initials}
                        </div>
                    </div>
                </header>

                <div className="draft-content">

                    <div className="draft-banner">
                        <TriangleAlert size={18} />
                        <span>
                            <b>TOR ร่างยังไม่เปิดรับสมัคร </b> 
                            รายการด้านล่างเป็นฉบับร่างที่เจ้าของโครงการยังจัดทำอยู่ กรุณาอ่านข้อกำหนดล่วงหน้า (เจ้าของโครงการอาจแก้ไขก่อนประกาศจริง)
                        </span>
                    </div>

                    <div className="draft-filters">
                        {/* search */}
                        <div className="draft-search">
                            <Search size={17} />
                            <input
                                value={query}
                                onChange={(e) =>
                                    setQuery(e.target.value)
                                }
                                placeholder="ค้นหาชื่อโครงการ"
                            />

                            <span>
                                {visibleTors.length} รายการ
                            </span>
                        </div>
                        
                        {/* filter */}
                        <div className="draft-filter-options">
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
                                className="draft-reset-filter"
                                onClick={resetFilters}
                            >
                                <RotateCcw size={16} />
                                ล้างตัวกรอง
                            </button>
                        </div>
                    </div>

                    {error && <div className="draft-error">
                        {error}
                    </div>}

                    {loading ? (
                        <div className="draft-state">
                            กำลังโหลดข้อมูล...
                        </div>
                    ) : visibleTors.length === 0 ? (
                        <div className="draft-state">
                            <FileText size={36} />
                            <h2>
                                {query 
                                    ? "ไม่พบ TOR ที่ค้นหา" 
                                    : "ยังไม่มี TOR ฉบับร่างในตอนนี้"
                                }
                            </h2>
                            <p>
                                {query 
                                    ? "ลองใช้คำค้นหาอื่น" 
                                    : "เมื่อเจ้าของโครงการสร้าง TOR ฉบับร่าง จะมาแสดงที่นี่"
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="draft-list">
                            {visibleTors.map((tor) => (
                                <article className="draft-list-card" key={tor._id}>

                                    {/* ข้อมูล TOR */}
                                    <div className="draft-list-content">

                                        <div className="draft-list-top">
                                            <span className="draft-card-badge">
                                                ฉบับร่าง · ยังไม่เปิดรับสมัคร
                                            </span>

                                            <span className="draft-tor-id">
                                                TOR-{tor._id.slice(-8)}
                                            </span>
                                        </div>

                                        <p className="draft-list-agency">
                                            {tor.agencyName}
                                        </p>

                                        <h2 className="draft-list-title">
                                            {tor.projectName}
                                        </h2>

                                        {tor.description && (
                                            <p className="draft-list-desc">
                                                {tor.description}
                                            </p>
                                        )}

                                        <div className="draft-list-meta">

                                            <div className="draft-meta-item">
                                                <span>งบประมาณ</span>
                                                <strong>
                                                    {formatBudget(tor.budget)}
                                                </strong>
                                            </div>

                                            <div className="draft-meta-item">
                                                <span>กำหนดส่ง</span>
                                                <strong>
                                                    {formatDate(tor.submissionDeadline)}
                                                </strong>
                                            </div>

                                            <div className="draft-meta-item">
                                                <span>คุณสมบัติ</span>
                                                <strong>
                                                    {tor.requirements.length} ข้อ
                                                </strong>
                                            </div>

                                        </div>

                                    </div>

                                    {/* ปุ่ม */}
                                    <div className="draft-list-actions">

                                        <button
                                            type="button"
                                            onClick={() => setActiveTor(tor)}
                                        >
                                            ดูรายละเอียด
                                        </button>

                                        <button
                                            type="button"
                                            className="draft-action-button"
                                            onClick={() => handleBookmark(tor)}
                                            disabled={bookmarkLoading === tor._id}
                                        >
                                            <Bookmark
                                                size={15}
                                                fill={
                                                    savedTorIds.includes(tor._id)
                                                        ? "currentColor"
                                                        : "none"
                                                }
                                            />

                                            {bookmarkLoading === tor._id
                                                ? "กำลังบันทึก..."
                                                : savedTorIds.includes(tor._id)
                                                ? "บันทึกแล้ว"
                                                : "บันทึก"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setReviewTor(tor)}
                                        >
                                            รีวิว
                                        </button>

                                    </div>

                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {activeTor && (
                <TorDetailModal
                    tor={activeTor}
                    onClose={() => setActiveTor(null)}
                />
            )}

            {reviewTor && (
                <div
                    className="draft-modal-overlay"
                    onClick={() => setReviewTor(null)}
                >
                    <div
                        className="review-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="draft-modal-close"
                            onClick={() => setReviewTor(null)}
                        >
                            <X size={20} />
                        </button>

                        <h2>เขียนความคิดเห็น</h2>

                        <p className="review-modal-sub">
                            {reviewTor.projectName}
                        </p>

                        <div className="review-list">
                            <h3>ความคิดเห็น</h3>

                            {reviewLoading ? (
                                <p className="no-review">
                                    กำลังโหลดความคิดเห็น...
                                </p>
                            ) : reviews.length === 0 ? (
                                <p className="no-review">
                                    ยังไม่มีความคิดเห็น
                                </p>
                            ) : (
                                reviews.map((review) => (
                                    <div
                                        className="review-item"
                                        key={review._id}
                                    >
                                        <div className="review-item-header">
                                            <strong>
                                                {review.userName}
                                            </strong>

                                            <span>
                                                {formatReviewDate(
                                                    review.createdAt
                                                )}
                                            </span>
                                        </div>

                                        <p>{review.content}</p>

                                        {session?.user?.email === review.userId && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await deleteComment(
                                                            review._id,
                                                            review.userId
                                                        );

                                                        setReviews((prev) =>
                                                            prev.filter(
                                                                (item) =>
                                                                    item._id !==
                                                                    review._id
                                                            )
                                                        );
                                                        showToast("ลบความคิดเห็นสำเร็จ");
                                                    } catch (error) {
                                                        const message = error instanceof Error
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

                        {reviewError && (
                            <p className="review-error">
                                {reviewError}
                            </p>
                        )}

                        <textarea
                            value={reviewText}
                            onChange={(e) => setReviewText(e.target.value)}
                            placeholder="เขียนความคิดเห็นของคุณ..."
                            rows={5}
                        />

                        <div className="review-modal-actions">
                            <button
                                className="review-cancel"
                                onClick={() => {
                                    setReviewText("");
                                    setReviewTor(null);
                                }}
                            >
                                ยกเลิก
                            </button>

                            <button
                                className="review-submit"
                                onClick={async () => {
                                    const userId = session?.user?.email;
                                    const userName =
                                        session?.user?.name ||
                                        session?.user?.email ||
                                        "";

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
                                            reviewText
                                        );

                                        setReviews((prev) => [
                                            newComment,
                                            ...prev,
                                        ]);

                                        setReviewText("");
                                        showToast("ส่งความคิดเห็นสำเร็จ");
                                    } catch (error) {
                                        console.error("Create comment error:", error);

                                        const message = error instanceof Error
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
