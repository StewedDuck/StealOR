"use client";

import { shouldShowMatchingCard } from '@/lib/matchingStatus';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from 'next/link';
import FilterDropdown from '@/components/FilterDropdown';
import { useSession } from "next-auth/react";
import Sidebar from "@/components/sideBar";
import TorDetailModal from "@/components/TORDetail";
import TORDocumentModal from "@/components/TORDocumentModal";
import { useToast } from "@/components/toast/ToastProvider";
import { getMarketTorById } from '@/lib/torApi';
import type { MarketTor, MarketTorDetail } from '@/types/tor';
import { ChevronDown, CheckCircle2, LoaderCircle, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';

import "./matching.css";
import { TorMatchingCard, MatchingModal } from '@/components/TorMatchingCard';
import type { MatchingData, MatchedTor } from '@/types/matching';
import { torBookmarkKey } from '@/lib/torIdentity';
import { getTorProgressStatus } from '@/lib/torPublicationStatus';
import { useTorBookmarks } from '@/hooks/useTorBookmarks';
import { useGovernmentPublicationStatuses } from '@/hooks/useGovernmentPublicationStatuses';

type SortOrder = "desc" | "asc";
type StatusFilter = "all" | "open" | "draft" | "closed";

export default function TorMatchingPage() {
    const { data: session, status: sessionStatus } = useSession();
    const { showToast } = useToast();

    const [items, setItems] = useState<MatchedTor[]>([]);
    const [pending, setPending] = useState(0);
    const [failed, setFailed] = useState(0);
    const [retrying, setRetrying] = useState(0);
    const [pollingStopped, setPollingStopped] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [retryState, setRetryState] = useState<'idle' | 'sending' | 'accepted' | 'error'>('idle');
    const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
    const consumedRetryKey = useRef(0);

    function requestRetry() {
        if (retryState === 'sending') return;
        setRetryState('sending');
        setRefreshKey(value => value + 1);
    }
    const [visibleCount, setVisibleCount] = useState(20);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [selectedMatching, setSelectedMatching] = useState<MatchedTor | null>(null);
    const [activeTor, setActiveTor] = useState<MarketTorDetail | null>(null);
    const [documentTor, setDocumentTor] = useState<{projectId: string; projectName: string;} | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const { savedIds, bookmarkLoading, toggleBookmark } = useTorBookmarks(session?.user?.email);
    const publicationStatuses = useGovernmentPublicationStatuses(items.map(item => item.tor));

    useEffect(() => {
        if (sessionStatus === "loading") return;

        if (sessionStatus === "unauthenticated") {
            setLoading(false);
            setError("กรุณาเข้าสู่ระบบก่อนใช้งาน TOR Matching");
            return;
        }

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const started = Date.now();
        let retryRequested = refreshKey > consumedRetryKey.current;
        setPollingStopped(false);

        async function load() {
            const isRetryRequest = retryRequested;
            if (isRetryRequest) consumedRetryKey.current = refreshKey;
            try {
                setError("");

                const matchingUrl = retryRequested ? '/api/matching?retry=true' : '/api/matching';
                retryRequested = false;
                const response = await fetch(matchingUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });

                if (!response.ok) {
                    const failure = await response.json().catch(() => null);
                    throw new Error(failure?.error || `Matching API: HTTP ${response.status}`);
                }

                const payload = (await response.json()) as {
                    success: boolean;
                    pending?: number;
                    failed?: number;
                    retrying?: number;
                    waitingForData?: number;
                    withoutCriteria?: number;
                    total?: number;
                    data?: MatchingData[];
                };

                if (!payload.success || !Array.isArray(payload.data)) {
                    throw new Error("Invalid Matching API response");
                }

                const found: MatchedTor[] = payload.data.flatMap(matching => matching.tor ? [{ tor: matching.tor, matching }] : []);

                if (!cancelled) {
                    setItems(found);
                    setLastCheckedAt(new Date());
                    if (isRetryRequest) setRetryState('accepted');
                    setPending(payload.pending || 0);
                    setFailed(payload.failed || 0);
                    setRetrying(payload.retrying || 0);
                    if (payload.pending && Date.now() - started < 120000) {
                        timer = setTimeout(() => void load(), 4000);
                    } else {
                        if (payload.pending) setPollingStopped(true);
                        timer = setTimeout(() => void load(), 30000);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    if (isRetryRequest) setRetryState('error');
                    timer = setTimeout(() => void load(), 30000);
                    setError(
                        err instanceof Error
                            ? err.message
                            : "โหลด TOR Matching ไม่สำเร็จ"
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        void load();

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [sessionStatus, session?.user?.email, refreshKey]);

    const filteredItems = useMemo(() => {
        const search = query.trim().toLocaleLowerCase("th");

        return items
        .filter(({ tor, matching }) => {
            if (!shouldShowMatchingCard(matching)) return false;
            if (
                sourceFilter !== "all" &&
                tor.source !== sourceFilter
            )
            return false;

            if (
                statusFilter !== "all" &&
                getTorProgressStatus(tor, publicationStatuses[tor.projectId || '']) !== statusFilter
            )
            return false;

            return (
                !search ||
                `${tor.projectName} ${tor.agencyName} ${
                    tor.projectId ?? ""
                }`
                    .toLocaleLowerCase("th")
                    .includes(search)
            );
        })
        .sort((a, b) => {
            const av = a.matching.matchingPercentage;
            const bv = b.matching.matchingPercentage;

            if (av === null && bv === null) {
                return a.tor.projectName.localeCompare(
                    b.tor.projectName,
                    "th"
                );
            }

            if (av === null) return 1;
            if (bv === null) return -1;

            return sortOrder === "desc" ? bv - av : av - bv;
        });
    }, [
        items,
        query,
        sourceFilter,
        statusFilter,
        sortOrder,
        publicationStatuses,
    ]);

    useEffect(() => setVisibleCount(20), [query, sourceFilter, statusFilter, sortOrder]);

    async function viewDetails(tor: MarketTor) {
        const id = tor.projectId ?? tor.id;

        setDetailLoading(true);

        try {
            const detail = await getMarketTorById(id);

            setActiveTor(detail);
        } catch (err) {
            showToast(
                err instanceof Error
                ? err.message
                : "โหลดรายละเอียดไม่สำเร็จ",
                "error"
            );
        } finally {
            setDetailLoading(false);
        }
    }


    return (
        <div className="tm-page">
            <Sidebar />

            <main className="tm-main">
                <header className="tm-header">
                    <h1>TOR ที่ตรงกับคุณ</h1>
                    <p>
                        ค้นหาและตรวจสอบ TOR ที่ตรงกับคุณสมบัติของคุณ
                    </p>
                </header>

                <div className="tm-content">
                    <div className="tm-filters">
                        <label className="tm-search">
                            <Search size={18} />
                            <input
                                placeholder="ค้นหา TOR ที่ตรงกับคุณ..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </label>

                        <FilterDropdown
                            value={sourceFilter}
                            onChange={setSourceFilter}
                            options={[
                                { value: 'all', label: 'ทุกประเภทโครงการ' },
                                { value: 'government', label: 'TOR ราชการ' },
                                { value: 'internal', label: 'TOR ภายใน' },
                            ]}
                        />
                        <FilterDropdown<SortOrder>
                            value={sortOrder}
                            onChange={setSortOrder}
                            options={[
                                { value: 'desc', label: 'Match % : มาก → น้อย' },
                                { value: 'asc', label: 'Match % : น้อย → มาก' },
                            ]}
                        />
                        <FilterDropdown<StatusFilter>
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={[
                                { value: 'all', label: 'ทุกสถานะ' },
                                { value: 'open', label: 'เปิด' },
                                { value: 'draft', label: 'แบบร่าง' },
                                { value: 'closed', label: 'ปิด' },
                            ]}
                        />
                    </div>

                    <div className="tm-result-heading">
                        <span>
                            <SlidersHorizontal size={16} />
                            พบ {filteredItems.length} โครงการ
                        </span>

                        <small>
                            เรียงตาม Match Percentage:{" "}
                            {sortOrder === "desc"
                                ? "มาก → น้อย"
                                : "น้อย → มาก"}{" "}
                            · แสดงเฉพาะคะแนนมากกว่า 39%
                        </small>
                    </div>

                    {loading && (
                        <div className="tm-message">
                            กำลังโหลดและประเมินผล TOR จาก Backend...
                        </div>
                    )}

                    {!loading && (pending > 0 || failed > 0 || retryState !== 'idle') && (
                        <div className="tm-message tm-evaluation-status" role="status" aria-live="polite">
                            <div className="tm-evaluation-summary">
                                {pending > retrying && <span>กำลังประเมินหรือรอคิว {pending - retrying} โครงการ</span>}
                                {retrying > 0 && <span>AI ไม่พร้อม รอลองใหม่ {retrying} โครงการ</span>}
                                {failed > 0 && <span>ประเมินไม่สำเร็จ {failed} โครงการ</span>}
                            </div>
                            <button className="tm-retry-button" type="button" disabled={retryState === 'sending'}
                                aria-busy={retryState === 'sending'} onClick={requestRetry}>
                                {retryState === 'sending' ? <LoaderCircle className="tm-status-spinner" size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
                                {retryState === 'sending' ? 'กำลังส่งคำขอ…' : 'ลองประเมินใหม่'}
                            </button>
                            {retryState === 'accepted' && (
                                <p className="tm-retry-feedback"><CheckCircle2 size={16} aria-hidden="true" />
                                    ส่งคำขอแล้ว ระบบจะประเมินรายการที่สามารถลองใหม่ได้และอัปเดตผลอัตโนมัติ
                                </p>
                            )}
                            {retryState === 'error' && <p className="tm-retry-feedback">ยังยืนยันการรับคำขอไม่ได้ กรุณาลองอีกครั้ง</p>}
                            {lastCheckedAt && <small className="tm-status-updated">ตรวจสถานะล่าสุด {lastCheckedAt.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} · ตรวจให้อัตโนมัติทุก {pollingStopped || !pending ? '30' : '4'} วินาที</small>}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="tm-message tm-error">
                            {error}
                            <button type="button" disabled={retryState === 'sending'} onClick={requestRetry}>{retryState === 'sending' ? 'กำลังส่งคำขอ…' : 'ลองอีกครั้ง'}</button>
                        </div>
                    )}

                    {!loading &&
                        !error &&
                        filteredItems.length === 0 && (
                        <div className="tm-message">
                            <div>
                                <p>{query || sourceFilter !== 'all' || statusFilter !== 'all'
                                    ? 'ไม่พบ TOR คะแนนมากกว่า 39% ที่ตรงกับตัวกรอง'
                                    : pending > 0
                                        ? 'ยังไม่มีผลคะแนนมากกว่า 39% ให้แสดง ระบบกำลังประเมิน TOR เพิ่มเติม'
                                        : 'ยังไม่มี TOR ที่มีคะแนนมากกว่า 39%'}</p>
                                <p>รายการที่รอข้อมูล ยังไม่มีคะแนน หรือคะแนนไม่เกิน 39% อยู่ใน TOR Market และบันทึกไว้ รายการที่ได้คะแนนมากกว่า 39% จะแสดงที่นี่อัตโนมัติ</p>
                                <Link className="tm-empty-market-link" href="/contractor/market">ดู TOR ทั้งหมดใน Market</Link>
                            </div>
                        </div>
                        )
                    }

                    <div className="tm-list">
                        {filteredItems.slice(0, visibleCount).map(item => (
                            <TorMatchingCard key={torBookmarkKey(item.tor)}
                                tor={item.tor} matching={item.matching}
                                saved={savedIds.includes(torBookmarkKey(item.tor))}
                                bookmarkLoading={bookmarkLoading === torBookmarkKey(item.tor)}
                                detailLoading={detailLoading}
                                progressStatus={getTorProgressStatus(item.tor, publicationStatuses[item.tor.projectId || ''])}
                                onViewDetails={() => void viewDetails(item.tor)}
                                onMatchingDetails={() => setSelectedMatching(item)}
                                onBookmark={() => void toggleBookmark(item.tor, item.matching)}
                                onDocuments={() => setDocumentTor({ projectId: item.tor.projectId!, projectName: item.tor.projectName })}
                            />
                        ))}
                    </div>
                    {visibleCount < filteredItems.length && (
                        <div className="tm-load-more">
                            <button className="tm-load-more-button" type="button" onClick={() => setVisibleCount(count => count + 20)}>
                                แสดงเพิ่มเติม
                                <ChevronDown size={18} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {selectedMatching && (
                <MatchingModal
                    item={items.find(item => torBookmarkKey(item.tor) === torBookmarkKey(selectedMatching.tor)) || selectedMatching}
                    onClose={() =>
                        setSelectedMatching(null)
                    }
                />
            )}

            {activeTor && (
                <TorDetailModal
                    tor={activeTor}
                    progressStatus={getTorProgressStatus({ ...activeTor, deadline: activeTor.submissionDeadline }, publicationStatuses[activeTor.projectId || ''])}
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
