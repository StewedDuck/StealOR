"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";
import {
  getMarketTors,
  getMarketTorById,
  getBookmarks,
  createBookmark,
  deleteBookmark,
  getEgpAnnouncementUrl,
  getLocalProjectDocuments,
} from "@/lib/torApi";

import type {
  MarketTor,
  MarketTorDetail,
} from "@/types/tor";
import { useSession } from "next-auth/react";
import TorDetailModal from "@/components/TORDetail";
import FilterDropdown from "@/components/FilterDropdown";
import MultiSelectFilterDropdown from "@/components/MultiSelectFilterDropdown";
import TorDeadlineBadge from "@/components/TorDeadlineBadge";
import { getDeadlineInfo } from "@/lib/torDeadline";

import {
  Tag,
  Building2,
  RotateCcw,
  Search,
  BellRing,
  CalendarDays,
  Bookmark,
  Download,
  ChevronDown,
  ExternalLink,
  Phone,
  FileText,
} from "lucide-react";
import "./market.css";
import { getUserProfile } from "@/lib/torApi";
import TORDocumentModal from "@/components/TORDocumentModal";


type TypeFilter = 
  | "all"
  | "government"
  | "internal"
  | "tor_preparation"
  | "invitation";

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

type DocumentType =
  | "priceEstimate"
  | "draftEbidding"
  | "invitation";

type SortOption =
  | "name-asc"
  | "name-desc"
  | "newest"
  | "oldest";

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

function isClosed(value?: string | null) {
  const days = getDaysUntil(value);

  return days !== null && days < 0;
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

function getCurrentBuddhistYear() {
  return new Date().getFullYear() + 543;
}


function getCurrentBuddhistYearShort() {
  return getCurrentBuddhistYear() % 100;
}


function getShortBuddhistYear(
  yearsAgo: number
) {
  const fullYear =
    getCurrentBuddhistYear() - yearsAgo;

  return fullYear % 100;
}


function getTorBuddhistYear(
  tor: MarketTor
): number | null {

  // Government:
  // projectId 69059292256 -> 69 -> 2569
  if (tor.source === "government") {

    if (
      !tor.projectId ||
      tor.projectId.length < 2
    ) {
      return null;
    }

    const shortYear = Number(
      tor.projectId.slice(0, 2)
    );

    if (Number.isNaN(shortYear)) {
      return null;
    }

    /*
      e-GP IDs use the last two digits
      of the Buddhist year.

      Convert 69 -> 2569.
      This also avoids comparing only
      two-digit years internally.
    */
    return 2500 + shortYear;
  }


  // Internal:
  // use createdAt
  if (tor.source === "internal") {

    if (!tor.createdAt) {
      return null;
    }

    const createdAt =
      new Date(tor.createdAt);

    if (
      Number.isNaN(
        createdAt.getTime()
      )
    ) {
      return null;
    }

    return (
      createdAt.getFullYear() + 543
    );
  }


  return null;
}

const typeOptions: {
  value: TypeFilter;
  label: string;
  dividerBefore?: boolean;
}[] = [
  {
    value: "all",
    label: "ทุกประเภท TOR",
  },
  {
    value: "government",
    label: "Government",
  },
  {
    value: "internal",
    label: "Internal",
  }
  // {
  //   value: "tor_preparation",
  //   label: "จัดทำ TOR",
  //   dividerBefore: true,
  // },
  // {
  //   value: "invitation",
  //   label: "หนังสือเชิญชวน/ประกาศเชิญชวน",
  // },
];


const budgetOptions = [
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


const sortOptions: {
  value: SortOption;
  label: string;
}[] = [
  {
    value: "name-asc",
    label: "เรียงตาม: ชื่อโครงการ (ก → ฮ)",
  },
  {
    value: "name-desc",
    label: "เรียงตาม: ชื่อโครงการ (ฮ → ก)",
  },
  {
    value: "newest",
    label: "เรียงตาม: ใหม่ล่าสุด",
  },
  {
    value: "oldest",
    label: "เรียงตาม: เก่าสุด",
  },
];

const documentTypeOptions: {
  value: DocumentType;
  label: string;
}[] = [
  {
    value: "priceEstimate",
    label: "ประกาศราคากลาง",
  },
  {
    value: "draftEbidding",
    label: "ร่างเอกสารประกวดราคา",
  },
  {
    value: "invitation",
    label: "ประกาศเชิญชวน",
  },
];

export default function TorMarketPage() {
    const [tors, setTors] = useState<MarketTor[]>([]);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
    const [yearFilter, setYearFilter] =  useState<YearFilter>("all");
    const [projectDocumentTypes, setProjectDocumentTypes] = useState<Record<string, DocumentType[]>>({});
    const [documentTypeFilter, setDocumentTypeFilter] = useState<DocumentType[]>([]);
    const [sortOption, setSortOption] = useState<SortOption>("name-asc");
    const [budgetFilter, setBudgetFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const [activeTor, setActiveTor] = useState<MarketTorDetail | null>(null);

    const [documentTor, setDocumentTor] = useState<{ projectId: string; projectName: string; } | null>(null);

    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState("");
    const [savedProjectIds, setSavedProjectIds] = useState<string[]>([]);
    const [bookmarkLoading, setBookmarkLoading] = useState<string | null>(null);

    const { data: session } = useSession();
    const { showToast } = useToast();
    const [displayName, setDisplayName] = useState("");

    const currentShortYear = getCurrentBuddhistYearShort();

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
        label: `ปีนี้ (${currentShortYear
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
              console.error(
                  "Failed to load dashboard profile:",
                  error
              );
  
              setDisplayName(session?.user?.name ?? "");
          });
    }, [session?.user?.email, session?.user?.name]);
  
    const userName =
        displayName ||
        session?.user?.name ||
        "ผู้ใช้";

    const initials = userName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    ;

    useEffect(() => {
      async function loadMarketTors() {
        try {
          setLoading(true);
          setError("");

          const marketTors = await getMarketTors();

          const documentTypeEntries =
            await Promise.all(
              marketTors.map(async (tor) => {
                // Internal ไม่มี local Government documents
                if (
                  tor.source !== "government" || !tor.projectId
                ) {
                  return null;
                }

                try {
                  const localDocuments =
                    await getLocalProjectDocuments(
                      tor.projectId
                    );

                  const documents =
                    localDocuments.documents;

                  const availableTypes: DocumentType[] =
                    [];

                  if (
                    documents.priceEstimate.available &&
                    documents.priceEstimate.files.length > 0
                  ) {
                    availableTypes.push(
                      "priceEstimate"
                    );
                  }

                  if (
                    documents.draftEbidding.available &&
                    documents.draftEbidding.files.length > 0
                  ) {
                    availableTypes.push(
                      "draftEbidding"
                    );
                  }

                  if (
                    documents.invitation.available &&
                    documents.invitation.files.length > 0
                  ) {
                    availableTypes.push(
                      "invitation"
                    );
                  }

                  return [
                    tor.projectId,
                    availableTypes,
                  ] as const;

                } catch (error) {
                  console.error(
                    `Failed to check local documents for project ${tor.projectId}:`,
                    error
                  );

                  return [
                    tor.projectId,
                    [],
                  ] as const;
                }
              })
            );

          const documentTypeMap: Record< string, DocumentType[] > = {};

          documentTypeEntries.forEach((entry) => {
            if (!entry) return;
            const [projectId, types] = entry;
            documentTypeMap[projectId] = [...types];
          });

          setProjectDocumentTypes(documentTypeMap);

          setTors(marketTors);

        } catch (err) {
          setError(
            err instanceof Error ? err.message : "โหลด TOR ไม่สำเร็จ"
          );
        } finally {
          setLoading(false);
        }
      }
      loadMarketTors();
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

    console.log("MARKET TORS:", tors);

    console.log(
        "TORS WITHOUT PROJECT NAME:",
        tors.filter((tor) => !tor.projectName)
    );

    const getTorDisplayName = (tor: MarketTor) => {
      return tor.projectName?.trim() || tor.projectId || "ไม่ระบุชื่อโครงการ";
    };

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

        // Type / Source / Government status
        if (typeFilter === "government") {
          result = result.filter(
            (tor) =>
              tor.source === "government"
          );
        }

        if (typeFilter === "internal") {
          result = result.filter(
            (tor) =>
              tor.source === "internal"
          );
        }

        if (typeFilter === "tor_preparation") {
          result = result.filter((tor) => {
            if (tor.source !== "government") {
              return false;
            }
            const status = tor.status
                ?.trim()
                .toLocaleLowerCase("th") ?? "";
            return (
              status.includes("จัดทำ tor") ||
              status.includes("จัดทำtor")
            );
          });
        }

        if (typeFilter === "invitation") {
          result = result.filter((tor) => {
            if (tor.source !== "government") {
              return false;
            }
            const status = tor.status
                ?.trim()
                .toLocaleLowerCase("th") ?? "";
            return (
              status.includes("หนังสือเชิญชวน") ||
              status.includes("ประกาศเชิญชวน")
            );
          });
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

        if (timeFilter === "closed") {
          result = result.filter((tor) =>
            isClosed(tor.deadline)
          );
        }

        // Year
        if (yearFilter !== "all") {
          const currentYear = getCurrentBuddhistYear();

          result = result.filter((tor) => {
            const torYear = getTorBuddhistYear(tor);
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
            }
          );
        }

        // Document Type
        if (documentTypeFilter.length > 0) {
          result = result.filter((tor) => {
            if (
              tor.source !== "government" || !tor.projectId
            ) {
              return false;
            }

            const availableTypes =  projectDocumentTypes[tor.projectId] ?? [];

            // AND:
            return documentTypeFilter.every(
              (selectedType) =>
                availableTypes.includes(selectedType)
            );
          });
        }

        // Sort
        result.sort((a, b) => {
            const aName = a.projectName ?? "";
            const bName = b.projectName ?? "";

            switch (sortOption) {
                case "name-asc":
                return aName.localeCompare(
                  bName,
                    "th"
                );

                case "name-desc":
                return bName.localeCompare(
                  aName,
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
            }
          );
        return result;
      }, [
        tors,
        query,
        typeFilter,
        timeFilter,
        yearFilter,
        budgetFilter,
        documentTypeFilter,
        projectDocumentTypes,
        sortOption,
      ]);

    function resetFilters() {
        setQuery("");
        setTypeFilter("all");
        setTimeFilter("all");
        setYearFilter("all");
        setBudgetFilter("all");
        setDocumentTypeFilter([]);
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
        showToast("กรุณาเข้าสู่ระบบก่อนบันทึก TOR", "error");
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
                showToast("ยกเลิกการบันทึก TOR แล้ว");
            } else {
                await createBookmark(
                    userId,
                    tor.projectId
                );
        
                setSavedProjectIds((prev) => [
                    ...prev,
                    tor.projectId!,
                ]);
                showToast("บันทึก TOR แล้ว");
            }
        } catch (err) {
            const message = err instanceof Error
                ? err.message
                : "บันทึก TOR ไม่สำเร็จ";
            showToast(message, "error");
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
          <section className="market-filters">
            {/* Search */}
            <div className="market-filter-search-row">
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
            </div>
            
            {/* filter */}
            <div className="market-filter-options-row">
              {/* Type */}
              <FilterDropdown
                value={typeFilter}
                options={typeOptions}
                onChange={setTypeFilter}
                className="type-filter-dropdown"
              />
              
              {/* Budget */}
              <FilterDropdown
                value={budgetFilter}
                options={budgetOptions}
                onChange={setBudgetFilter}
                className="budget-filter-dropdown"
              />

              {/* Time */}
              <FilterDropdown
                value={timeFilter}
                options={timeOptions}
                onChange={setTimeFilter}
                className="time-filter-dropdown"
              />

              {/* Year */}
              <FilterDropdown
                value={yearFilter}
                options={yearOptions}
                onChange={setYearFilter}
                className="year-filter-dropdown"
              />

              {/* Document Type */}
              <MultiSelectFilterDropdown
                values={documentTypeFilter}
                options={documentTypeOptions}
                onChange={setDocumentTypeFilter}
                placeholder="ประเภทเอกสาร"
              />
              
              {/* Sort */}
              <FilterDropdown
                value={sortOption}
                options={sortOptions}
                onChange={setSortOption}
                className="sort-filter-dropdown"
              />

              <button
                type="button"
                className="reset-filter"
                onClick={resetFilters}
                title="ล้างตัวกรอง"
              >
                <RotateCcw size={16} />
                <span>ล้างตัวกรอง</span>
              </button>
            </div>
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

              const almostClosing = isAlmostClosing(tor.deadline);
              const closed = isClosed(tor.deadline);

            return (
                <article
                  key={tor.id}
                  className="market-card"
                >
                    {/* Left / Content */}
                    <div className="market-card-content">
                      <div className="market-card-top">
                        <span
                          className={`tor-status-badge ${
                            tor.source === "government"
                              ? "government"
                              : "internal"
                          }`}
                        >
                          {getSourceLabel(tor.source)}
                        </span>

                        <span
                          className={`tor-status-badge ${
                            getDeadlineDays(tor.deadline) !== null &&
                            getDeadlineDays(tor.deadline)! < 0
                              ? "closed"
                              : tor.status?.toLowerCase() === "draft"
                              ? "draft"
                              : "open"
                          }`}
                        >
                          {getDeadlineDays(tor.deadline) !== null &&
                          getDeadlineDays(tor.deadline)! < 0
                            ? "ปิดรับแล้ว"
                            : tor.status?.toLowerCase() === "draft"
                            ? "Draft"
                            : tor.status || "เปิดรับ"}
                        </span>

                        {tor.projectId && (
                          <span className="market-tor-id">
                            TOR-{tor.projectId}
                          </span>
                        )}
                      </div>

                        <h2 className="market-card-title">
                          {getTorDisplayName(tor)}
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

                            <TorDeadline deadline={tor.deadline} />
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

                        {/* <button
                            type="button"
                            className="market-action-button primary"
                        >
                            <Phone size={15} />
                            ติดต่อเจ้าของโครงการ
                        </button> */}

                        {tor.source === "government" && tor.projectId && (
                            <>
                                <button
                                    type="button"
                                    className="market-action-button"
                                    onClick={() =>
                                        window.open(
                                            getEgpAnnouncementUrl(tor.projectId!),
                                            "_blank",
                                            "noopener,noreferrer"
                                        )
                                    }
                                >
                                    <ExternalLink size={15} />
                                    ไปยังหน้า TOR
                                </button>

                                {/* <button
                                    type="button"
                                    className="market-action-button"
                                    onClick={() =>
                                        window.location.assign(
                                            getGovProjectDocumentDownloadUrl(
                                                tor.projectId!
                                            )
                                        )
                                    }
                                >
                                    <Download size={15} />
                                    ดาวน์โหลดเอกสาร
                                </button> */}

                                <button
                                  type="button"
                                  className="market-action-button"
                                  onClick={() =>
                                    setDocumentTor({
                                      projectId: tor.projectId!,
                                      projectName: tor.projectName,
                                    })
                                  }
                                >
                                  <FileText size={15} />
                                  เอกสาร TOR
                                </button>
                            </>
                        )}

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

        {documentTor && (
          <TORDocumentModal
            projectId={documentTor.projectId}
            projectName={documentTor.projectName}
            onClose={() => setDocumentTor(null)}
          />
        )}

    </div>
  );
}
