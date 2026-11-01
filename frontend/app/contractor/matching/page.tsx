"use client";

import { getMatchingActivity, shouldShowMatchingCard } from '@/lib/matchingStatus';
import { readMatchingSnapshot, writeMatchingSnapshot } from '@/lib/matchingSnapshot';

import { useEffect, useMemo, useRef, useState } from "react";
import Link from 'next/link';
import MatchingEvaluationStatus from '@/components/MatchingEvaluationStatus';
import FilterDropdown from '@/components/FilterDropdown';
import { useSession } from "next-auth/react";
import Sidebar from "@/components/sideBar";
import TorDetailModal from "@/components/TORDetail";
import TORDocumentModal from "@/components/TORDocumentModal";
import { useToast } from "@/components/toast/ToastProvider";
import { getMarketTorById, getUserProfile } from '@/lib/torApi';
import type { MarketTor, MarketTorDetail } from '@/types/tor';
import { BellRing, ChevronDown, LoaderCircle, Search, SlidersHorizontal } from 'lucide-react';

import "./matching.css";
import { TorMatchingCard, MatchingModal } from '@/components/TorMatchingCard';
import type { MatchingData, MatchedTor } from '@/types/matching';
import { torBookmarkKey } from '@/lib/torIdentity';
import { getTorProgressStatus, matchesTorStatusFilter } from '@/lib/torPublicationStatus';
import { getTorDisplayDeadline } from '@/lib/torDeadline';
import { useTorBookmarks } from '@/hooks/useTorBookmarks';
import { useGovernmentPublicationStatuses } from '@/hooks/useGovernmentPublicationStatuses';

type SortOrder = "desc" | "asc";
type StatusFilter = "all" | "open" | "draft" | "closed" | "comments_closed";

export default function TorMatchingPage() {
    const { data: session, status: sessionStatus } = useSession();
    const [displayName, setDisplayName] = useState('');
    useEffect(() => {
        setDisplayName('');
        if (!session?.user?.email) return;
        let cancelled = false;
        getUserProfile(session.user.email)
            .then(profile => { if (!cancelled) setDisplayName(profile.name); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [session?.user?.email]);
    const userName = [displayName, session?.user?.name, session?.user?.email]
        .find(name => name?.trim() && name.trim() !== '-') || 'ผู้ใช้';
    const initials = userName
        .trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
    const { showToast } = useToast();

    const [items, setItems] = useState<MatchedTor[]>([]);
    const activity = useMemo(() => getMatchingActivity(items.map(item => item.matching)), [items]);
    const checkingSavedResults = items.some(item => item.matching.isCachedSnapshot);
    const [pending, setPending] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const [retryState, setRetryState] = useState<'idle' | 'sending' | 'accepted' | 'error'>('idle');
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
        const snapshot = readMatchingSnapshot(session?.user?.email);
        setItems(snapshot?.data.flatMap(matching => matching.tor ? [{ tor: matching.tor, matching }] : []) || []);
        setPending(snapshot?.pending || 0);
        setLoading(!snapshot);
        let receivedFullResults = false;
        const previewController = new AbortController();
        if (!snapshot) {
            // Read small persisted card previews in parallel with input validation.
            void fetch('/api/matching?snapshot=true', { cache: 'no-store',
                signal: AbortSignal.any([previewController.signal, AbortSignal.timeout(10000)]) })
                .then(response => response.ok ? response.json() : null)
                .then(payload => {
                    if (cancelled || receivedFullResults || !payload?.success || !Array.isArray(payload.data)) return;
                    setItems((payload.data as MatchingData[]).flatMap(matching => matching.tor ? [{ tor: matching.tor, matching }] : []));
                    setLoading(false);
                }).catch(() => {});
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        let retryRequested = refreshKey > consumedRetryKey.current;

        async function load() {
            const isRetryRequest = retryRequested;
            if (isRetryRequest) consumedRetryKey.current = refreshKey;
            try {
                setError("");

                const matchingUrl = retryRequested ? '/api/matching?retry=true' : '/api/matching';
                retryRequested = false;
                const response = await fetch(matchingUrl, { cache: 'no-store', signal: AbortSignal.timeout(60000) });

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

                if (!cancelled) {
                    receivedFullResults = true;
                    previewController.abort();
                    const resolved = session?.user?.email ? writeMatchingSnapshot(session.user.email, { ...payload, data: payload.data }) : { ...payload, data: payload.data };
                    setItems(resolved.data.flatMap(matching => matching.tor ? [{ tor: matching.tor, matching }] : []));
                    if (isRetryRequest) setRetryState('accepted');
                    setPending(payload.pending || 0);
                    const work = getMatchingActivity(payload.data);
                    if (payload.data.some(row => row.isCachedSnapshot) || work.processing + work.queued > 0) {
                        timer = setTimeout(() => void load(), 4000);
                    } else {
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
            previewController.abort();
            clearTimeout(timer);
        };
    }, [sessionStatus, session?.user?.email, refreshKey]);

    const filteredItems = useMemo(() => {
        const search = query.trim().toLocaleLowerCase("th");

        return items
        .map(item => {
            const publicationStatus = publicationStatuses[item.tor.projectId || ''] || item.tor.publicationStatus;
            return { ...item, tor: { ...item.tor, publicationStatus,
                deadline: getTorDisplayDeadline(item.tor, publicationStatus) } };
        })
        .filter(({ tor, matching }) => {
            if (!shouldShowMatchingCard(matching)) return false;
            if (
                sourceFilter !== "all" &&
                tor.source !== sourceFilter
            )
            return false;

            if (
                statusFilter !== "all" &&
                !matchesTorStatusFilter(tor, statusFilter, publicationStatuses[tor.projectId || ''])
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
                    <div>
                    <h1>TOR ที่ตรงกับคุณ</h1>
                    <p>
                        ค้นหาและตรวจสอบ TOR ที่ตรงกับคุณสมบัติของคุณ
                    </p>
                    </div>
                    <div className="tm-header-actions">
                        <Link href="/contractor/notifications" className="tm-notification-button header-action-link" aria-label="การแจ้งเตือน">
                            <BellRing size={16} />
                        </Link>
                        <Link href="/contractor/account" className="tm-profile-circle header-action-link" aria-label="บัญชีของฉัน">
                            {initials}
                        </Link>
                    </div>
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
                                { value: 'closed', label: 'ปิดรับสมัคร' },
                                { value: 'comments_closed', label: 'ปิดรับความคิดเห็น' },
                            ]}
                        />
                    </div>

                    <div className="tm-result-heading">
                        <span>
                            <SlidersHorizontal size={16} />
                            {loading ? 'กำลังโหลดรายการ…' : error && items.length === 0 ? 'ยังโหลดรายการไม่สำเร็จ' : `พบ ${filteredItems.length} โครงการ`}
                        </span>

                        {!loading && !error && <MatchingEvaluationStatus
                            activity={activity} checking={checkingSavedResults}
                            sending={retryState === 'sending'} onRetry={requestRetry}
                        />}

                        {!loading && error && items.length > 0 && <div className="tm-evaluation-notice tm-refresh-warning" role="status">
                            <span>แสดงผลที่บันทึกไว้ · อัปเดตล่าสุดยังไม่สำเร็จ</span>
                            <button type="button" className="tm-retry-button" disabled={retryState === 'sending'} onClick={requestRetry}>
                                {retryState === 'sending' ? 'กำลังลองใหม่…' : 'ลองใหม่'}
                            </button>
                        </div>}

                        <small>
                            เรียงตาม Match Percentage:{" "}
                            {sortOrder === "desc"
                                ? "มาก → น้อย"
                                : "น้อย → มาก"}{" "}
                            · แสดงเฉพาะคะแนนมากกว่า 39%
                        </small>
                    </div>

                    {loading && (
                        <div className="tm-message" role="status">
                            <div className="tm-working-heading"><LoaderCircle className="tm-status-spinner" size={22} aria-hidden="true" /> กำลังโหลดผล Matching…</div>
                            <p className="tm-working-description">กำลังดึงผลล่าสุดของคุณ การโหลดครั้งแรกอาจใช้เวลาสักครู่</p>
                        </div>
                    )}



                    {!loading && error && items.length === 0 && (
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
                    publicationStatus={publicationStatuses[activeTor.projectId || '']}
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
