"use client";

import {
    useCallback,
    useEffect,
    useState,
} from "react";

import { useSession } from "next-auth/react";

import {
    Check,
    Clock3,
    Eye,
    FileText,
    ShieldCheck,
    X,
} from "lucide-react";

import Sidebar from "@/components/sideBarAdmin";

import {
    AdminVerificationDetail,
    AdminVerificationListItem,
    approveIdentityVerification,
    getAdminVerificationById,
    getAdminVerifications,
    getUserProfile,
    getVerificationDocumentUrl,
    rejectIdentityVerification,
} from "@/lib/torApi";

import "./verification.css";


export default function AdminVerificationPage() {

    const { data: session } = useSession();

    const [adminId, setAdminId] =
        useState("");

    const [pending, setPending] =
        useState<AdminVerificationListItem[]>([]);

    const [history, setHistory] =
        useState<AdminVerificationListItem[]>([]);

    const [selected, setSelected] =
        useState<AdminVerificationDetail | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [detailLoading, setDetailLoading] =
        useState(false);

    const [actionLoading, setActionLoading] =
        useState(false);

    const [error, setError] =
        useState("");

    const [showReject, setShowReject] =
        useState(false);

    const [rejectReason, setRejectReason] =
        useState("");


    const loadRequests = useCallback(
        async (id: string) => {

            try {

                setLoading(true);
                setError("");

                const requests =
                    await getAdminVerifications(id);

                setPending(
                    requests.filter(
                        (item) =>
                            item.status === "pending"
                    )
                );

                setHistory(
                    requests.filter(
                        (item) =>
                            item.status !== "pending"
                    )
                );

            } catch (err) {

                setError(
                    err instanceof Error
                        ? err.message
                        : "ไม่สามารถโหลดคำขอยืนยันตัวตนได้"
                );

            } finally {

                setLoading(false);
            }
        },
        []
    );


    useEffect(() => {

        async function initialize() {

            const email =
                session?.user?.email;

            if (!email) {
                return;
            }

            try {

                const profile =
                    await getUserProfile(email);

                if (
                    profile.accountRole !==
                    "admin"
                ) {
                    setError(
                        "บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ"
                    );

                    setLoading(false);

                    return;
                }

                setAdminId(profile.id);

                await loadRequests(
                    profile.id
                );

            } catch (err) {

                setError(
                    err instanceof Error
                        ? err.message
                        : "ไม่สามารถโหลดข้อมูลผู้ดูแลระบบได้"
                );

                setLoading(false);
            }
        }

        initialize();

    }, [
        session?.user?.email,
        loadRequests,
    ]);


    async function openDetail(
        verificationId: string
    ) {

        if (!adminId) return;

        try {

            setDetailLoading(true);
            setError("");

            const detail =
                await getAdminVerificationById(
                    verificationId,
                    adminId
                );

            setSelected(detail);

            setShowReject(false);
            setRejectReason("");

        } catch (err) {

            setError(
                err instanceof Error
                    ? err.message
                    : "ไม่สามารถโหลดรายละเอียดได้"
            );

        } finally {

            setDetailLoading(false);
        }
    }


    function closeModal() {

        if (actionLoading) return;

        setSelected(null);

        setShowReject(false);

        setRejectReason("");
    }


    async function handleApprove() {

        if (!selected || !adminId) {
            return;
        }

        try {

            setActionLoading(true);
            setError("");

            await approveIdentityVerification(
                selected.id,
                adminId
            );

            closeModal();

            await loadRequests(adminId);

        } catch (err) {

            setError(
                err instanceof Error
                    ? err.message
                    : "ไม่สามารถอนุมัติคำขอได้"
            );

        } finally {

            setActionLoading(false);
        }
    }


    async function handleReject() {

        if (
            !selected ||
            !adminId ||
            !rejectReason.trim()
        ) {
            return;
        }

        try {

            setActionLoading(true);
            setError("");

            await rejectIdentityVerification(
                selected.id,
                adminId,
                rejectReason.trim()
            );

            closeModal();

            await loadRequests(adminId);

        } catch (err) {

            setError(
                err instanceof Error
                    ? err.message
                    : "ไม่สามารถปฏิเสธคำขอได้"
            );

        } finally {

            setActionLoading(false);
        }
    }


    return (
        <div className="admin-layout">

            <aside className="admin-sidebar">
                <Sidebar />
            </aside>

            <main className="admin-main">

                <header className="admin-header">

                    <div className="admin-header-content">

                        <h1>
                            ยืนยันตัวตน
                        </h1>

                        <p>
                            ตรวจสอบและอนุมัติ/ปฏิเสธคำขอยืนยันตัวตนของเจ้าของโครงการ
                        </p>

                    </div>

                </header>


                <div className="admin-content">

                    <div className="verification-notice">

                        <ShieldCheck size={22} />

                        <div>

                            <strong>
                                เฉพาะผู้ดูแลระบบเท่านั้น
                            </strong>

                            <p>
                                ตรวจสอบคำขอยืนยันตัวตนของเจ้าของโครงการ
                                ผู้ดูแลระบบเท่านั้นที่สามารถอนุมัติหรือปฏิเสธได้
                            </p>

                        </div>

                    </div>


                    {error && (
                        <div className="verification-error">
                            {error}
                        </div>
                    )}


                    <section className="verification-card">

                        <div className="verification-card-header">

                            <div>

                                <h2>
                                    ยืนยันตัวตน
                                </h2>

                                <p>
                                    อนุมัติหรือปฏิเสธคำขอยืนยันตัวตนจากเจ้าของโครงการ
                                </p>

                            </div>

                            <span className="pending-count">
                                {pending.length}
                            </span>

                        </div>


                        {loading ? (

                            <div className="verification-empty">
                                กำลังโหลด...
                            </div>

                        ) : pending.length === 0 ? (

                            <div className="verification-empty">

                                <ShieldCheck size={34} />

                                <strong>
                                    ยังไม่มีคำขอยืนยันตัวตนที่รอดำเนินการ
                                </strong>

                            </div>

                        ) : (

                            <div className="verification-list">

                                {pending.map(
                                    (request) => (

                                        <VerificationRow
                                            key={
                                                request.id
                                            }
                                            request={
                                                request
                                            }
                                            onView={
                                                openDetail
                                            }
                                        />

                                    )
                                )}

                            </div>
                        )}

                    </section>


                    <section className="verification-card">

                        <div className="verification-card-header">

                            <div>

                                <h2>
                                    ประวัติการยืนยันตัวตน
                                </h2>

                                <p>
                                    คำขอที่เคยตรวจสอบแล้ว
                                </p>

                            </div>

                        </div>


                        {loading ? (

                            <div className="verification-empty">
                                กำลังโหลด...
                            </div>

                        ) : history.length === 0 ? (

                            <div className="verification-empty">
                                ยังไม่มีประวัติการตรวจสอบ
                            </div>

                        ) : (

                            <div className="verification-list">

                                {history.map(
                                    (request) => (

                                        <VerificationRow
                                            key={
                                                request.id
                                            }
                                            request={
                                                request
                                            }
                                            onView={
                                                openDetail
                                            }
                                        />

                                    )
                                )}

                            </div>
                        )}

                    </section>

                </div>

            </main>


            {detailLoading && (
                <div className="verification-loading-overlay">
                    กำลังโหลดรายละเอียด...
                </div>
            )}


            {selected && (

                <div
                    className="verification-modal-overlay"
                    onMouseDown={closeModal}
                >

                    <div
                        className="verification-modal"
                        onMouseDown={(event) =>
                            event.stopPropagation()
                        }
                    >

                        <div className="verification-modal-header">

                            <div>

                                <h2>
                                    รายละเอียดการยืนยันตัวตน
                                </h2>

                                <p>
                                    ตรวจสอบข้อมูลก่อนอนุมัติหรือปฏิเสธ
                                </p>

                            </div>

                            <button
                                type="button"
                                className="modal-close"
                                onClick={
                                    closeModal
                                }
                            >
                                <X size={20} />
                            </button>

                        </div>


                        <div className="verification-detail-grid">

                            <Detail
                                label="ชื่อ"
                                value={
                                    selected.owner
                                        ?.name ||
                                    "-"
                                }
                            />

                            <Detail
                                label="อีเมล"
                                value={
                                    selected.email
                                }
                            />

                            <Detail
                                label="เบอร์โทรศัพท์"
                                value={
                                    selected.phone
                                }
                            />

                            <Detail
                                label="เลขบัตรประชาชน"
                                value={
                                    selected.citizenId
                                }
                            />

                            <Detail
                                label="Laser Code"
                                value={
                                    selected.laserCode
                                }
                            />

                            <Detail
                                label="วันที่ส่งคำขอ"
                                value={formatDate(
                                    selected.submittedAt
                                )}
                            />

                        </div>


                        <div className="verification-document">

                            <div className="document-info">

                                <FileText
                                    size={22}
                                />

                                <div>

                                    <strong>
                                        {
                                            selected
                                                .document
                                                .fileName
                                        }
                                    </strong>

                                    <span>
                                        {formatFileSize(
                                            selected
                                                .document
                                                .size
                                        )}
                                    </span>

                                </div>

                            </div>

                            <a
                                href={getVerificationDocumentUrl(
                                    selected.document.url
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="document-button"
                            >
                                <Eye size={17} />
                                เปิดเอกสาร
                            </a>

                        </div>


                        {selected.status ===
                            "rejected" &&
                            selected.rejectionReason && (

                                <div className="previous-rejection">

                                    <strong>
                                        เหตุผลที่ปฏิเสธ
                                    </strong>

                                    <p>
                                        {
                                            selected.rejectionReason
                                        }
                                    </p>

                                </div>
                            )}


                        {selected.status ===
                            "pending" && (

                                <>

                                    {showReject && (

                                        <div className="reject-box">

                                            <label>
                                                เหตุผลที่ปฏิเสธ
                                            </label>

                                            <textarea
                                                value={
                                                    rejectReason
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    setRejectReason(
                                                        event
                                                            .target
                                                            .value
                                                    )
                                                }
                                                placeholder="ระบุเหตุผลที่ไม่อนุมัติคำขอนี้"
                                            />

                                        </div>
                                    )}


                                    <div className="verification-actions">

                                        {!showReject ? (

                                            <button
                                                type="button"
                                                className="reject-button"
                                                disabled={
                                                    actionLoading
                                                }
                                                onClick={() =>
                                                    setShowReject(
                                                        true
                                                    )
                                                }
                                            >
                                                <X size={17} />
                                                ปฏิเสธ
                                            </button>

                                        ) : (

                                            <button
                                                type="button"
                                                className="cancel-button"
                                                disabled={
                                                    actionLoading
                                                }
                                                onClick={() => {
                                                    setShowReject(
                                                        false
                                                    );
                                                    setRejectReason(
                                                        ""
                                                    );
                                                }}
                                            >
                                                ยกเลิก
                                            </button>

                                        )}


                                        {showReject ? (

                                            <button
                                                type="button"
                                                className="confirm-reject-button"
                                                disabled={
                                                    actionLoading ||
                                                    !rejectReason.trim()
                                                }
                                                onClick={
                                                    handleReject
                                                }
                                            >
                                                {actionLoading
                                                    ? "กำลังดำเนินการ..."
                                                    : "ยืนยันการปฏิเสธ"}
                                            </button>

                                        ) : (

                                            <button
                                                type="button"
                                                className="approve-button"
                                                disabled={
                                                    actionLoading
                                                }
                                                onClick={
                                                    handleApprove
                                                }
                                            >
                                                <Check size={17} />

                                                {actionLoading
                                                    ? "กำลังดำเนินการ..."
                                                    : "อนุมัติ"}
                                            </button>

                                        )}

                                    </div>

                                </>
                            )}

                    </div>

                </div>
            )}

        </div>
    );
}


function VerificationRow({
    request,
    onView,
}: {
    request: AdminVerificationListItem;

    onView: (
        verificationId: string
    ) => void;
}) {

    return (
        <div className="verification-row">

            <div className="verification-user">

                <div className="verification-avatar">
                    {getInitials(
                        request.owner?.name || "U"
                    )}
                </div>

                <div>

                    <strong>
                        {request.owner?.name ||
                            "ไม่พบผู้ใช้งาน"}
                    </strong>

                    <span>
                        {request.owner?.email ||
                            "-"}
                    </span>

                </div>

            </div>


            <div className="verification-date">

                <Clock3 size={15} />

                {formatDate(
                    request.submittedAt
                )}

            </div>


            <StatusBadge
                status={request.status}
            />


            <button
                type="button"
                className="review-button"
                onClick={() =>
                    onView(request.id)
                }
            >
                <Eye size={16} />
                ตรวจสอบ
            </button>

        </div>
    );
}


function Detail({
    label,
    value,
}: {
    label: string;
    value: string;
}) {

    return (
        <div className="verification-detail">

            <span>{label}</span>

            <strong>{value}</strong>

        </div>
    );
}


function StatusBadge({
    status,
}: {
    status:
        | "pending"
        | "approved"
        | "rejected";
}) {

    const label = {
        pending: "รอตรวจสอบ",
        approved: "ยืนยันแล้ว",
        rejected: "ไม่ผ่าน",
    }[status];

    return (
        <span
            className={`verification-status ${status}`}
        >
            {label}
        </span>
    );
}


function getInitials(name: string) {

    return name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}


function formatDate(value: string) {

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat(
        "th-TH",
        {
            dateStyle: "medium",
            timeStyle: "short",
        }
    ).format(date);
}


function formatFileSize(bytes: number) {

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(
            bytes / 1024
        ).toFixed(1)} KB`;
    }

    return `${(
        bytes /
        (1024 * 1024)
    ).toFixed(1)} MB`;
}