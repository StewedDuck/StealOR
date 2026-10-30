"use client";
import { useState } from 'react';
import type { MarketTor } from '@/types/tor';
import type { MatchingData, MatchedTor, ResultStatus, RelevanceResult } from '@/types/matching';
import { getMatchingRefreshLabel } from "@/lib/matchingStatus";
import { getEgpAnnouncementUrl } from '@/lib/torApi';
import { Bookmark, ExternalLink, FileText, CalendarDays, Wallet, CheckCircle2, XCircle, CircleHelp, X, Building2 } from 'lucide-react';
import { getTorProgressLabel, isTorCommentClosed, type TorProgressStatus } from '@/lib/torPublicationStatus';
import TorCommentClosedBadge from '@/components/TorCommentClosedBadge';
import { getTorDisplayDeadline } from '@/lib/torDeadline';
import '@/app/contractor/matching/matching.css';

const formatMoney = (value: number | null | undefined) =>
    typeof value === "number"
        ? `฿${value.toLocaleString("th-TH")}`
        : "ไม่ระบุ";

const formatDate = (value?: string | null) => {
    if (!value) return "ไม่ระบุ";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "ไม่ระบุ"
        : new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            day: "numeric",
            month: "short",
            year: "numeric",
        }
    ).format(date);
};





const statusLabel = (status: ResultStatus) =>
    status === "pass"
        ? "ผ่าน"
        : status === "fail"
        ? "ไม่ผ่าน"
        : "ข้อมูลไม่เพียงพอ";

const statusIcon = (status: ResultStatus) =>
    status === "pass" ? (
        <CheckCircle2 size={17} />
    ) : status === "fail" ? (
        <XCircle size={17} />
    ) : (
        <CircleHelp size={17} />
    );

const eligibilityLabel = (value: MatchingData["eligibility"]) =>
        value === "eligible"
            ? "ผ่านคุณสมบัติบังคับ"
            : value === "ineligible"
            ? "ไม่ผ่านคุณสมบัติบังคับ"
            : "ข้อมูลคุณสมบัติไม่เพียงพอ";

function PercentageBar({ percentage }: { percentage: number | null }) {
    const value = percentage !== null && Number.isFinite(percentage)
        ? Math.max(0, Math.min(100, percentage)) : null;
    return (
        <div className="tm-percentage-bar">
            <div className="tm-percentage-value">
                {value === null ? 'N/A' : <>{value}<span>%</span></>}
            </div>
            <span className="tm-percentage-label">ความตรงกัน</span>
            {value === null ? (
                <div className="tm-percentage-track" aria-hidden="true" />
            ) : (
                <div className="tm-percentage-track" role="progressbar"
                    aria-label="เปอร์เซ็นต์ความตรงกัน" aria-valuemin={0}
                    aria-valuemax={100} aria-valuenow={value}>
                    <span style={{ width: `${value}%` }} />
                </div>
            )}
        </div>
    );
}

function CriterionProgress({ criterion, criteriaCount }: { criterion: RelevanceResult; criteriaCount: number }) {
    // OR alternatives count as one group; partial group coverage earns partial credit.
    const total = criterion.skillGroups?.filter(group => group.length > 0).length ||
        (criterion.matchedGroups?.length || 0) + (criterion.missingGroups?.length || 0);
    const matched = Math.min(total, criterion.matchedGroups?.length || 0);
    const percentage = total > 0 ? Math.round(matched / total * 10000) / 100 : null;
    const share = criterion.appliedWeight ?? (criteriaCount > 0 ? 100 / criteriaCount : 0);
    const earned = criterion.earnedWeight ?? (total > 0 ? share * matched / total : criterion.status === 'pass' ? share : 0);
    const format = (value: number) => Number(value.toFixed(2)).toLocaleString('th-TH');
    return (
        <div className="tm-criterion-progress">
            <div className="tm-criterion-progress-heading">
                <span>กลุ่มทักษะที่ยืนยันได้ {matched} / {total} กลุ่ม</span>
                {percentage === null
                    ? <span className="tm-result-badge tm-unknown">ข้อมูลไม่เพียงพอ</span>
                    : <b>{`${format(percentage)}%`}</b>}
            </div>
            {percentage !== null && (
                <div className="tm-criterion-progress-track" role="progressbar"
                    aria-label={`ความครบถ้วนของทักษะ: ${criterion.text}`}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}
                    aria-valuetext={`ยืนยันได้ ${matched} จาก ${total} กลุ่ม คิดเป็น ${format(percentage)}%`}
                >
                    <span style={{ width: `${percentage}%` }} />
                </div>
            )}
            <p className="tm-criterion-share">
                สัดส่วนคะแนนรวมข้อนี้ {format(share)}% · คะแนนที่ได้เข้าคะแนนรวม {format(earned)}%
            </p>
            {percentage !== null && percentage < 100 && (
                <p className="tm-criterion-explanation">
                    ได้คะแนนตามสัดส่วนกลุ่มที่ยืนยันแล้ว ส่วนที่ยังขาดหลักฐานยังไม่เพิ่มคะแนน รายละเอียดอยู่ด้านล่าง
                </p>
            )}
            {criterion.semanticMatchingStatus === 'unavailable' && (
                <p className="tm-criterion-explanation">แถบนี้แสดงหลักฐานที่ยืนยันได้ขณะนี้ การวิเคราะห์เพิ่มเติมด้วย AI ยังไม่พร้อม</p>
            )}
        </div>
    );
}

export function MatchingModal({item, onClose,}: {item: MatchedTor; onClose: () => void;}) {
    const { tor, matching } = item;
    const [tab, setTab] = useState<"all" | ResultStatus>("all");

    if (matching.isCachedSnapshot) return (
        <div className="tm-modal-overlay" role="presentation" onClick={onClose}>
            <div className="tm-modal" role="dialog" aria-modal="true" aria-label="รายละเอียดการแมตช์" onClick={event => event.stopPropagation()}>
                <header className="tm-modal-header">
                    <button className="tm-modal-x" type="button" onClick={onClose} aria-label="ปิด"><X size={20} /></button>
                    <h2>{tor.projectName}</h2>
                </header>
                <div className="tm-modal-body" role="status">กำลังโหลดรายละเอียดผลที่บันทึกไว้ ระบบจะแสดงข้อมูลล่าสุดให้อัตโนมัติ</div>
            </div>
        </div>
    );

    const mandatory = matching.mandatoryResults.filter(
        (r) => tab === "all" || r.status === tab
    );

    return (
        <div
            className="tm-modal-overlay"
            onClick={onClose}
            role="presentation"
        >
            <div
                className="tm-modal"
                role="dialog"
                aria-modal="true"
                aria-label="รายละเอียดการแมตช์"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="tm-modal-header">
                    <button
                        className="tm-modal-x"
                        type="button"
                        onClick={onClose}
                        aria-label="ปิด"
                    >
                        <X size={21} />
                    </button>
                    <span className="tm-modal-eyebrow">
                        TOR MATCHING ANALYSIS
                    </span>
                    <h2>รายละเอียดการแมตช์</h2>
                    <p>{tor.projectName}</p>
                </header>

                <div className="tm-modal-body">
                    <section className="tm-summary">
                        <PercentageBar
                            percentage={matching.matchingPercentage}
                        />
                        <div>
                            <span
                                className={`tm-status tm-eligibility-${matching.eligibility}`}
                            >
                                {eligibilityLabel(matching.eligibility)}
                            </span>

                            {matching.isProvisional && (
                                <span
                                    className="tm-status"
                                    title="ผล Matching คำนวณจากเกณฑ์ที่ผ่านการตรวจสอบแล้วเท่านั้น"
                                >
                                    ผล Matching เบื้องต้น
                                </span>
                            )}

                            {getMatchingRefreshLabel(matching) && <p role="status">{getMatchingRefreshLabel(matching)}</p>}
                            <h3>
                                คะแนนความตรงกัน:{" "}
                                {matching.matchingPercentage === null
                                ? "ยังคำนวณไม่ได้"
                                : `${matching.matchingPercentage}%`}
                            </h3>
                            {matching.isProvisional && (
                                <p className="tm-hint">
                                    ⚠️ ผล Matching เบื้องต้น:
                                    คะแนนนี้คำนวณจากเกณฑ์ที่ผ่านการตรวจสอบหลักฐานแล้วเท่านั้น
                                    ยังมีบางเกณฑ์ที่ต้องตรวจสอบเพิ่มเติม
                                    คะแนนอาจเปลี่ยนแปลงได้
                                </p>
                            )}
                            <p>
                                เปอร์เซ็นต์คิดจากสัดส่วนกลุ่มทักษะที่ยืนยันได้ในแต่ละข้อ
                                ไม่ได้นำคุณสมบัติบังคับมารวม
                            </p>
                            {matching.matchingPercentage === null && (
                                <p className="tm-hint">
                                    สถานะการคิดคะแนน:{" "}
                                    {matching.scoringStatus === "not_available"
                                        ? "ไม่มีเกณฑ์ที่คิดเป็นคะแนน"
                                        : matching.scoringStatus === "needs_profile_data"
                                        ? "ข้อมูลโปรไฟล์ยังไม่ครบ"
                                        : matching.scoringStatus === "needs_weights"
                                            ? "น้ำหนักคะแนนยังไม่ครบหรือไม่ถูกต้อง"
                                            : matching.scoringStatus}
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="tm-section">
                        <h3>คุณสมบัติบังคับที่ต้องผ่านทุกข้อ</h3>
                        <p className="tm-section-description">
                            หากมีข้อใดไม่ผ่าน จะถือว่าไม่ผ่านคุณสมบัติบังคับ
                            แม้เปอร์เซ็นต์ Matching จะสูงก็ตาม
                        </p>

                        <div className="tm-stat-grid">
                            <div className="tm-stat tm-pass">
                                <strong>
                                    {matching.mandatorySummary.passed}
                                </strong>
                                <span>ผ่าน</span>
                            </div>

                            <div className="tm-stat tm-fail">
                                <strong>
                                    {matching.mandatorySummary.failed}
                                </strong>
                                <span>ไม่ผ่าน</span>
                            </div>

                            <div className="tm-stat tm-unknown">
                                <strong>
                                    {matching.mandatorySummary.unknown}
                                </strong>
                                <span>ข้อมูลไม่เพียงพอ</span>
                            </div>
                        </div>

                        <div className="tm-tabs">
                            {(["all", "pass", "fail", "unknown"] as const).map(
                                (value) => (
                                <button
                                    key={value}
                                    className={tab === value ? "active" : ""}
                                    type="button"
                                    onClick={() => setTab(value)}
                                >
                                    {value === "all"
                                    ? `ทั้งหมด (${matching.mandatorySummary.total})`
                                    : `${statusLabel(value)} (${matching.mandatoryResults.filter((r) => r.status === value).length})`}
                                </button>
                                )
                            )}
                        </div>

                        <div className="tm-requirement-list">
                            {mandatory.length === 0 && (
                                <p className="tm-empty-inline">
                                    ไม่มีรายการในหมวดนี้
                                </p>
                            )}

                            {mandatory.map((r, index) => (
                                <article
                                    key={r.requirementId ?? index}
                                    className="tm-requirement"
                                >
                                    <div className={`tm-requirement-icon tm-${r.status}`}>
                                        {statusIcon(r.status)}
                                    </div>
                                    <div className="tm-requirement-content">
                                        <strong>
                                            {r.sourceText || r.text}
                                        </strong>

                                        {r.sourceText &&
                                        r.text !== r.sourceText && (
                                            <p className="tm-translation">{r.text}</p>
                                        )}

                                        {r.conditionDetails && r.conditionDetails.length > 0 && (
                                            <div className="tm-condition-details">
                                                {r.conditionDetails.map((condition, i) => (
                                                    <div key={condition.field || i} className="tm-condition-detail">
                                                        <strong>{condition.label}</strong>
                                                        <span className={`tm-result-badge tm-${condition.status}`}>{statusLabel(condition.status)}</span>
                                                        <p>ข้อมูลในโปรไฟล์: {condition.actual} · TOR กำหนด: {condition.expected}</p>
                                                        <p>{condition.reason}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {r.reason && (
                                            <p>
                                                <b>เหตุผล:</b> {r.reason}
                                            </p>
                                        )}
                                    </div>
                                    
                                    <span
                                        className={`tm-result-badge tm-${r.status}`}
                                    >
                                        {statusLabel(r.status)}
                                    </span>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="tm-section">
                        <h3>คุณสมบัติที่ใช้คิด Match %</h3>

                        <p className="tm-section-description">
                            แถบแสดงสัดส่วนกลุ่มทักษะที่มีหลักฐานยืนยันในแต่ละข้อ โดยทักษะที่เป็นทางเลือกนับเป็นกลุ่มเดียวกัน
                            {matching.weightingMethod === 'documented' ? 'แต่ละข้อถ่วงตามน้ำหนักที่เจ้าของโครงการกำหนด' : 'แต่ละข้อมีน้ำหนักเท่ากัน'} และได้คะแนนตามสัดส่วนกลุ่มทักษะที่ยืนยันได้ แม้ยังไม่ครบทุกกลุ่ม
                        </p>

                        {matching.relevanceResults.length === 0 ? (
                            <div className="tm-empty-inline">
                                {getMatchingRefreshLabel(matching) || 'TOR นี้ยังไม่มีเกณฑ์สำหรับคำนวณ Match %'}
                            </div>
                        ) : (
                            <div className="tm-requirement-list">
                                {matching.relevanceResults.map((r, index) => (
                                    <article
                                        key={r.criterionId ?? `${r.text}-${index}`}
                                        className="tm-requirement tm-relevance-requirement"
                                    >
                                        <div className="tm-requirement-content">
                                            <strong>
                                                {r.sourceText || r.text}
                                            </strong>

                                            {r.sourceText && r.sourceText !== r.text && (
                                                <p className="tm-translation">
                                                    {r.text}
                                                </p>
                                            )}

                                            <CriterionProgress criterion={r} criteriaCount={matching.relevanceResults.length} />

                                            {/* Show exact and AI semantic matching details */}
                                            {r.matchDetails && r.matchDetails.length > 0 ? (
                                                <div className="tm-match-details">
                                                    {r.matchDetails.map((detail, index) => (
                                                        <div
                                                            key={`${detail.groupIndex}-${index}`}
                                                            className="tm-match-detail"
                                                        >
                                                            <p className="tm-pass">
                                                                <b>กลุ่มทักษะที่ตรงกัน:</b>{" "}{detail.skillGroup.join(" หรือ ")}
                                                            </p>
                                                            <p>
                                                                <b>หลักฐานจากโปรไฟล์:</b>{" "}{detail.evidence}
                                                            </p>

                                                            <p>
                                                                <b>วิธีการจับคู่:</b>{" "}
                                                                {detail.matchType === "exact"
                                                                    ? "จับคู่ทักษะตรงกัน"
                                                                    : "AI วิเคราะห์ความสัมพันธ์ของทักษะ"}
                                                            </p>

                                                            <p>
                                                                <b>เหตุผล:</b>{" "}
                                                                {detail.reason}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <>
                                                    {/* Fallback for older API responses */}
                                                    {r.reason && (
                                                        <p>
                                                            <b>เหตุผล:</b> {r.reason}
                                                        </p>
                                                    )}

                                                    {r.matchedGroups?.length > 0 && (
                                                        <p className="tm-pass">
                                                            <b>กลุ่มทักษะที่ตรงกัน:</b>{" "}
                                                            {r.matchedGroups
                                                                .map((group) => group.join(" หรือ "))
                                                                .join("; ")}
                                                        </p>
                                                    )}
                                                </>
                                            )}

                                            {/* Missing skill groups */}
                                            {r.missingGroups?.length > 0 && (
                                                <div className="tm-missing-skills">
                                                    <p className="tm-unknown">
                                                        <b>ทักษะที่ยังไม่พบหลักฐาน:</b>{" "}
                                                        {r.missingGroups
                                                            .map((group) => group.join(" หรือ "))
                                                            .join("; ")}
                                                    </p>

                                                    <p>
                                                        ยังไม่พบข้อมูลยืนยันว่าผู้รับเหมา
                                                        มีทักษะตรงตามความต้องการในกลุ่มนี้
                                                    </p>
                                                </div>
                                            )}

                                            {/* AI service unavailable */}
                                            {r.semanticMatchingStatus === "unavailable" && (
                                                <p className="tm-unknown">
                                                    ไม่สามารถใช้ AI วิเคราะห์ทักษะเพิ่มเติม
                                                    ได้ในขณะนี้
                                                </p>
                                            )}
                                        </div>

                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <footer className="tm-modal-footer">
                    <button type="button" onClick={onClose}>
                        ปิด
                    </button>
                </footer>
            </div>
        </div>
    );
}


export function TorMatchingCard({ tor, matching, saved, bookmarkLoading = false, detailLoading = false, progressStatus, onViewDetails, onMatchingDetails, onBookmark, onDocuments }: {
    tor: MarketTor;
    matching: MatchingData;
    saved: boolean;
    bookmarkLoading?: boolean;
    detailLoading?: boolean;
    progressStatus: TorProgressStatus;
    onViewDetails: () => void;
    onMatchingDetails: () => void;
    onBookmark: () => void;
    onDocuments: () => void;
}) {
    const progressLabel = getTorProgressLabel(progressStatus);
    const pass = matching.relevanceResults.filter(r => r.status === 'pass' || r.matchedGroups?.length > 0);
    const fail = matching.relevanceResults.filter(r => r.status === 'fail');
    const unknown = matching.relevanceResults.filter(r => r.status === 'unknown');
    const unavailable = unknown.filter(r => r.semanticMatchingStatus === 'unavailable').length;
    return (
                                <article
                                    className="tm-card"
                                    
                                >
                                    <div className="tm-card-body">
                                        <div className="tm-card-badges">
                                            <span className="tm-source">
                                                {tor.source === "government"
                                                ? "TOR ราชการ"
                                                : "TOR ภายใน"}
                                            </span>

                                            <span className={`tm-open tm-publication-${progressStatus}`}>
                                                {progressLabel}
                                            </span>
                                            {isTorCommentClosed(tor, progressStatus === 'draft' ? 'draft' : tor.publicationStatus) && <TorCommentClosedBadge />}

                                            <small>
                                                {tor.projectId
                                                ? `TOR-${tor.projectId}`
                                                : tor.id}
                                            </small>
                                        </div>

                                        <p className="tm-agency">
                                            <Building2 size={14} />
                                            {tor.agencyName || "ไม่ระบุหน่วยงาน"}
                                        </p>

                                        <h2>
                                            {tor.projectName || "ไม่ระบุชื่อโครงการ"}
                                        </h2>

                                        <div className="tm-meta">
                                            <span>
                                                <Wallet size={15} />
                                                {formatMoney(tor.budget)}
                                            </span>
                                            <span>Software Project</span>
                                            <span>
                                                <CalendarDays size={15} />
                                                ปิดรับ {formatDate(getTorDisplayDeadline(tor, progressStatus === 'draft' ? 'draft' : tor.publicationStatus))}
                                            </span>
                                        </div>

                                        {matching.isCachedSnapshot ? (
                                            <p className="tm-pipeline-message">แสดงคะแนนที่บันทึกไว้ กำลังโหลดรายละเอียดทักษะล่าสุด</p>
                                        ) : matching.matchingPercentage === null && matching.relevanceResults.length === 0 ? (
                                            <p className="tm-pipeline-message">{getMatchingRefreshLabel(matching) || 'รอประเมินผล Matching'} — ยังไม่แสดงคะแนนจนกว่าจะมีข้อมูลเพียงพอ</p>
                                        ) : (<>
                                        <div className="tm-requirements-preview">
                                            <div>
                                                <h3 className="tm-pass">
                                                    <CheckCircle2 size={16} />
                                                    พบทักษะตรงกัน ({pass.length})
                                                </h3>

                                                {pass.slice(0, 4).map((r, i) => (
                                                    <p key={r.criterionId ?? i}>
                                                        ✓ {r.sourceText || r.text}
                                                    </p>
                                                ))}

                                                {pass.length === 0 && (
                                                    <p className="tm-muted">
                                                        ยังไม่พบทักษะที่ยืนยันได้
                                                    </p>
                                                )}

                                                {pass.length > 4 && (
                                                    <small>
                                                        และอีก {pass.length - 4} ข้อ
                                                    </small>
                                                )}
                                            </div>

                                            <div>
                                                <h3 className="tm-fail">
                                                    <XCircle size={16} />
                                                    ไม่ตรงกัน ({fail.length})
                                                </h3>

                                                {fail.slice(0, 4).map((r, i) => (
                                                    <p key={r.criterionId ?? i}>
                                                        ✕ {r.sourceText || r.text}
                                                    </p>
                                                ))}

                                                {fail.length === 0 && (
                                                    <p className="tm-muted">
                                                        ไม่มีข้อที่ยืนยันว่าไม่ผ่าน
                                                    </p>
                                                )}

                                                {fail.length > 4 && (
                                                    <small>
                                                        และอีก {fail.length - 4} ข้อ
                                                    </small>
                                                )}
                                            </div>
                                        </div>

                                        </>)}
                                        {unknown.length > 0 && (
                                            <p className="tm-unknown-note">
                                                <CircleHelp size={15} />
                                                ยังยืนยันไม่ได้ {unknown.length} ข้อ
                                                {unavailable > 0 ? ` (AI ไม่พร้อม ${unavailable} ข้อ)` : ""} — ดูรายละเอียดการแมตช์
                                            </p>
                                        )}
                                    </div>

                                    <aside className="tm-card-aside">
                                        {getMatchingRefreshLabel(matching) && <small role="status">{getMatchingRefreshLabel(matching)}</small>}
                                        <PercentageBar
                                            percentage={
                                                matching.matchingPercentage
                                            }
                                        />

                                        <span  className={`tm-status tm-eligibility-${matching.eligibility}`}>
                                            {eligibilityLabel(matching.eligibility)}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={onViewDetails}
                                            disabled={detailLoading}
                                        >
                                            ดูรายละเอียด
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                onMatchingDetails()
                                            }
                                        >
                                            รายละเอียดการแมตช์
                                        </button>

                                        <button
                                            type="button"
                                            onClick={onBookmark}
                                            disabled={bookmarkLoading}
                                        >
                                            <Bookmark
                                                size={15}
                                                fill={
                                                saved
                                                    ? "currentColor"
                                                    : "none"
                                                }
                                            />
                                            {bookmarkLoading
                                                ? "กำลังบันทึก..."
                                                : saved
                                                ? "บันทึกแล้ว"
                                                : "บันทึก"}
                                        </button>

                                        {tor.source === "government" && tor.projectId && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        window.open(
                                                            getEgpAnnouncementUrl(
                                                            tor.projectId!
                                                            ),
                                                            "_blank",
                                                            "noopener,noreferrer"
                                                        )
                                                    }
                                                >
                                                    <ExternalLink size={15} />
                                                    ไปยังหน้า TOR
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onDocuments()
                                                    }
                                                >
                                                    <FileText size={15} />
                                                    เอกสาร TOR
                                                </button>
                                            </>
                                        )}
                                    </aside>
                                </article>
    );
}
