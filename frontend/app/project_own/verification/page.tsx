"use client";

import {
    ChangeEvent,
    FormEvent,
    useEffect,
    useState,
} from "react";

import { useSession } from "next-auth/react";

import {
    CheckCircle2,
    Clock3,
    FileText,
    ShieldCheck,
    Upload,
    X,
    XCircle,
} from "lucide-react";

import Sidebar from "@/components/sideBar";

import {
    getMyVerification,
    getUserProfile,
    submitIdentityVerification,
} from "@/lib/torApi";

import type {
    MyVerification,
} from "@/lib/torApi";

import "./verification.css";


export default function VerificationPage() {
    const { data: session } = useSession();
    const [userId, setUserId] = useState("");
    const [verification, setVerification] = useState<MyVerification | null>(null);
    const [citizenId, setCitizenId] = useState("");
    const [laserCode, setLaserCode] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] =  useState("");
    const [document, setDocument] = useState<File | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Load User + Verification
    useEffect(() => {

        async function loadVerification() {

            const sessionEmail = session?.user?.email;

            if (!sessionEmail) {
                return;
            }

            try {
                setLoading(true);
                setError("");

                const profile = await getUserProfile(
                        sessionEmail
                    );

                setUserId(profile.id);
                setEmail(profile.email);
                setPhone(profile.phone || "");

                const verificationData =
                    await getMyVerification(
                        profile.id
                    );

                setVerification(
                    verificationData
                );

            } catch (error) {
                console.error(
                    "Failed to load verification:",
                    error
                );

                setError(
                    error instanceof Error
                        ? error.message
                        : "ไม่สามารถโหลดข้อมูลการยืนยันตัวตนได้"
                );

            } finally {
                setLoading(false);
            }
        }
        loadVerification();
    }, [session?.user?.email]);

    // File
    function handleFileChange(
        event: ChangeEvent<HTMLInputElement>
    ) {
        const file = event.target.files?.[0];
        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "application/pdf",
        ];

        if (!allowedTypes.includes(file.type)) {
            setError(
                "รองรับเฉพาะไฟล์ JPG, PNG และ PDF"
            );
            event.target.value = "";
            return;
        }

        if (
            file.size > 10 * 1024 * 1024
        ) {
            setError(
                "ขนาดไฟล์ต้องไม่เกิน 10 MB"
            );

            event.target.value = "";
            return;
        }
        setError("");
        setDocument(file);
    }

    // Submit
    async function handleSubmit(
        event: FormEvent
    ) {
        event.preventDefault();
        if (!userId) {
            setError(
                "ไม่พบข้อมูลผู้ใช้งาน"
            );
            return;
        }

        if (!document) {
            setError(
                "กรุณาอัปโหลดเอกสารยืนยันตัวตน"
            );
            return;
        }

        try {
            setSubmitting(true);
            setError("");
            setSuccess("");

            await submitIdentityVerification({
                userId,
                citizenId,
                laserCode,
                email,
                phone,
                document,
            });

            const updated =
                await getMyVerification(
                    userId
                );

            setVerification(updated);
            setCitizenId("");
            setLaserCode("");
            setDocument(null);
            setSuccess( "ส่งคำขอยืนยันตัวตนเรียบร้อยแล้ว" );
        } catch (error) {

            console.error(
                "Submit verification failed:",
                error
            );

            setError(
                error instanceof Error
                    ? error.message
                    : "ไม่สามารถส่งคำขอยืนยันตัวตนได้"
            );
        } finally {
            setSubmitting(false);
        }
    }

    const status = verification?.verificationStatus ?? "not_required";
    const canSubmit =
        status === "not_required" ||
        status === "rejected";
    return (
        <div className="verification-layout">
            <Sidebar />
            <main className="verification-main">
                {/* HEADER */}
                <header className="verification-header">
                    <div>
                        <h1>
                            ยืนยันตัวตน
                        </h1>
                        <p>
                            ยืนยันข้อมูลเจ้าของโครงการก่อนเผยแพร่ TOR
                        </p>
                    </div>
                </header>

                <div className="verification-page-content">
                    {loading ? (
                        <div className="verification-loading">
                            กำลังโหลดข้อมูล...
                        </div>
                    ) : (
                        <>
                            {/* STATUS */}
                            <VerificationStatusCard
                                status={status}
                                reason={
                                    verification
                                        ?.verificationReason
                                }
                            />
                            {error && (
                                <div className="verification-message error">
                                    {error}
                                </div>
                            )}
                            {success && (
                                <div className="verification-message success">
                                    {success}
                                </div>
                            )}

                            {/* FORM */}
                            {canSubmit && (
                                <section className="verification-form-card">
                                    <div className="verification-section-heading">
                                        <div className="verification-section-icon">
                                            <ShieldCheck size={20} />
                                        </div>
                                        <div>
                                            <h2>
                                                ข้อมูลยืนยันตัวตน
                                            </h2>
                                            <p>
                                                กรุณากรอกข้อมูลให้ถูกต้องและตรงกับเอกสาร
                                            </p>
                                        </div>
                                    </div>

                                    <form
                                        onSubmit={
                                            handleSubmit
                                        }
                                    >
                                        <div className="verification-form-grid">
                                            <div className="verification-field">
                                                <label>
                                                    เลขบัตรประชาชน
                                                    <span>*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={13}
                                                    value={citizenId}
                                                    onChange={(event) =>
                                                        setCitizenId(
                                                            event.target.value.replace(
                                                                /\D/g,
                                                                ""
                                                            )
                                                        )
                                                    }
                                                    placeholder="กรอกเลขบัตรประชาชน 13 หลัก"
                                                    required
                                                />
                                            </div>

                                            <div className="verification-field">
                                                <label>
                                                    รหัสหลังบัตรประชาชน
                                                    <span>*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={laserCode}
                                                    onChange={(event) =>
                                                        setLaserCode(
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="กรอกรหัสหลังบัตรประชาชน"
                                                    required
                                                />
                                            </div>

                                            <div className="verification-field">
                                                <label>
                                                    Gmail
                                                    <span>*</span>
                                                </label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    readOnly
                                                />
                                                <small>
                                                    ใช้อีเมลเดียวกับบัญชีที่เข้าสู่ระบบ
                                                </small>
                                            </div>

                                            <div className="verification-field">
                                                <label>
                                                    เบอร์โทรศัพท์
                                                    <span>*</span>
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={phone}
                                                    onChange={(event) =>
                                                        setPhone(
                                                            event.target.value.replace(
                                                                /\D/g,
                                                                ""
                                                            )
                                                        )
                                                    }
                                                    placeholder="เช่น 098xxxxxxx"
                                                    maxLength={10}
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* UPLOAD */}
                                        <div className="verification-upload-section">
                                            <label className="verification-upload-label">
                                                เอกสารยืนยันตัวตน
                                                <span>*</span>
                                            </label>
                                            {!document ? (
                                                <label className="verification-upload-box">
                                                    <input
                                                        type="file"
                                                        accept=".jpg,.jpeg,.png,.pdf"
                                                        onChange={
                                                            handleFileChange
                                                        }
                                                    />
                                                    <div className="verification-upload-icon">
                                                        <Upload size={24} />
                                                    </div>
                                                    <strong>
                                                        คลิกเพื่ออัปโหลดเอกสาร
                                                    </strong>
                                                    <p>
                                                        JPG, PNG หรือ PDF ขนาดไม่เกิน 10 MB
                                                    </p>
                                                </label>
                                            ) : (
                                                <div className="verification-file">
                                                    <div className="verification-file-icon">
                                                        <FileText size={21} />
                                                    </div>
                                                    <div className="verification-file-info">
                                                        <strong>
                                                            {document.name}
                                                        </strong>
                                                        <span>
                                                            {formatFileSize(
                                                                document.size
                                                            )}
                                                        </span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="verification-remove-file"
                                                        onClick={() =>
                                                            setDocument(
                                                                null
                                                            )
                                                        }
                                                        aria-label="Remove file"
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="verification-form-actions">
                                            <button
                                                type="submit"
                                                className="verification-submit"
                                                disabled={
                                                    submitting
                                                }
                                            >
                                                {submitting
                                                    ? "กำลังส่ง..."
                                                    : status === "rejected"
                                                    ? "ส่งคำขอใหม่"
                                                    : "ส่งคำขอยืนยันตัวตน"
                                                }
                                            </button>
                                        </div>
                                    </form>
                                </section>
                            )}

                            {/* PENDING INFO */}
                            {status === "pending" && (
                                <section className="verification-waiting-card">
                                    <Clock3 size={28} />
                                    <h2>
                                        กำลังรอผู้ดูแลระบบตรวจสอบ
                                    </h2>
                                    <p>
                                        เราได้รับข้อมูลของคุณเรียบร้อยแล้ว
                                        เมื่อผู้ดูแลระบบตรวจสอบเสร็จ
                                        คุณจะได้รับการแจ้งเตือน
                                    </p>
                                </section>
                            )}

                            {/* APPROVED */}
                            {status === "approved" && (
                                <section className="verification-waiting-card approved">
                                    <CheckCircle2 size={30} />
                                    <h2>
                                        ยืนยันตัวตนเรียบร้อยแล้ว
                                    </h2>
                                    <p>
                                        บัญชี Project Owner ของคุณได้รับการยืนยันแล้ว
                                    </p>
                                </section>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

// Status Card
function VerificationStatusCard({
    status,
    reason,
}: {
    status:
        | "not_required"
        | "pending"
        | "approved"
        | "rejected";

    reason?: string | null;
}) {
    const config = {
        not_required: {
            icon: <ShieldCheck size={21} />,
            title: "ยังไม่ได้ยืนยันตัวตน",
            description: "กรอกข้อมูลและส่งเอกสารเพื่อให้ผู้ดูแลระบบตรวจสอบ",
        },
        pending: {
            icon: <Clock3 size={21} />,
            title: "รอตรวจสอบ",
            description: "คำขอของคุณถูกส่งแล้ว และกำลังรอผู้ดูแลระบบตรวจสอบ",
        },

        approved: {
            icon: <CheckCircle2 size={21} />,
            title: "ยืนยันแล้ว",
            description: "บัญชีของคุณผ่านการยืนยันตัวตนเรียบร้อยแล้ว",
        },

        rejected: {
            icon: <XCircle size={21} />,
            title: "การยืนยันตัวตนไม่ผ่าน",
            description:
                reason
                    ? `เหตุผล: ${reason}`
                    : "กรุณาตรวจสอบข้อมูลและส่งคำขอใหม่",
        },

    }[status];

    return (
        <section
            className={
                `verification-status-card ${status}`
            }
        >
            <div className="verification-status-icon">
                {config.icon}
            </div>

            <div>
                <span>
                    สถานะการยืนยันตัวตน
                </span>
                <h2>
                    {config.title}
                </h2>
                <p>
                    {config.description}
                </p>
            </div>
        </section>
    );
}

function formatFileSize(
    bytes: number
) {
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
