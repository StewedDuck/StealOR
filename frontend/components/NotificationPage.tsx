"use client";

import Link from 'next/link';

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sideBar";
import AdminSidebar from "@/components/sideBarAdmin";

import {
    ContractorNotification,
    getContractorNotifications,
    markContractorNotificationAsRead,
    getUserProfile,
} from "@/lib/torApi";

import {
    Clock,
    FileText,
    BellRing,
} from "lucide-react";

import "@/app/contractor/notifications/notification.css";


function formatNotificationDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}


function getNotificationIcon(
    type: ContractorNotification["type"]
) {
    if (
        type === "deadline_5_days" ||
        type === "deadline_1_day"
    ) {
        return <Clock size={20} />;
    }

    if ((type === "draft_updated" || type === "saved_tor_updated")) {
        return <FileText size={20} />;
    }

    return <BellRing size={20} />;
}


function getNotificationClass(
    type: ContractorNotification["type"]
) {
    if (
        type === "deadline_5_days" ||
        type === "deadline_1_day"
    ) {
        return "deadline";
    }

    if ((type === "draft_updated" || type === "saved_tor_updated")) {
        return "draft";
    }

    return "";
}

function getNotificationTitle(
    notification: ContractorNotification
) {
    // Notification ใหม่มี title จริงจาก backend
    if (notification.title) {
        return notification.title;
    }

    // Fallback สำหรับ notification เก่า
    if (notification.type === "deadline_5_days") {
        return "TOR ที่บันทึกไว้ใกล้ปิดรับ";
    }

    if (notification.type === "deadline_1_day") {
        return "TOR ที่บันทึกไว้จะปิดรับพรุ่งนี้";
    }

    if (notification.type === "draft_updated" || notification.type === "saved_tor_updated") {
        return "TOR ที่บันทึกไว้มีการอัปเดต";
    }

    return "การแจ้งเตือน";
}


function getNotificationMessage(
    notification: ContractorNotification
) {
    // Notification ใหม่มี message จริงจาก backend
    if (notification.message) {
        return notification.message;
    }

    // Fallback สำหรับ notification เก่า
    if (notification.type === "deadline_5_days") {
        return notification.projectId
            ? `รหัส TOR: ${notification.projectId}`
            : "TOR ที่คุณบันทึกไว้จะปิดรับในอีก 5 วัน";
    }

    if (notification.type === "deadline_1_day") {
        return notification.projectId
            ? `รหัส TOR: ${notification.projectId}`
            : "TOR ที่คุณบันทึกไว้จะปิดรับในอีก 1 วัน";
    }

    return "";
}


export default function NotificationPage({ audience = 'contractor' }: { audience?: 'contractor' | 'project_owner' | 'admin' }) {
    const { user, ready } = useAuth();
    const { data: session } = useSession();
    const [notifications, setNotifications] = useState<ContractorNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [displayName, setDisplayName] = useState("");
    const router = useRouter();


    /* Load notifications */
    useEffect(() => {
        if (!ready) {
            return;
        }

        if (!user?.email) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        const userId = user.email;

        let cancelled = false;
        async function loadNotifications() {
            try {
                setError("");

                const data =
                    await getContractorNotifications(
                        userId
                    );



                if (!cancelled) setNotifications(data);

            } catch (error) {
                console.warn(
                    "Load notifications error:",
                    error
                );

                setNotifications([]);

                setError(
                    error instanceof Error
                        ? error.message
                        : "โหลดการแจ้งเตือนไม่สำเร็จ"
                );

            } finally {
                setLoading(false);
            }
        }

        void loadNotifications();
        const timer = setInterval(() => void loadNotifications(), 30000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [ready, user?.email]);


    /* Load user display name */
    useEffect(() => {
        const email =
            session?.user?.email;

        if (!email) {
            return;
        }

        getUserProfile(email)
            .then((profile) => {
                setDisplayName(
                    profile.name
                );
            })
            .catch((error) => {
                console.warn(
                    "Failed to load notification profile:",
                    error
                );

                setDisplayName(
                    session?.user?.name ?? ""
                );
            });

    }, [
        session?.user?.email,
        session?.user?.name,
    ]);

    /* Mark notification as read */
    async function handleNotificationClick(
        notification: ContractorNotification
    ) {
        try {
            if (!notification.read) {
                const updated =
                    await markContractorNotificationAsRead(
                        notification._id
                    );
    
                setNotifications((current) =>
                    current.map((item) =>
                        item._id === notification._id
                            ? updated
                            : item
                    )
                );
            }
    
            if (audience === 'admin') {
                router.push('/admin/verification');
                return;
            }
            if (audience === 'project_owner' || notification.source === 'verification') {
                router.push(notification.source === 'verification' ? '/project_own/verification' : notification.type === 'owner_draft_ready' ? '/project_own/draft_TOR' : '/project_own/my_TOR');
                return;
            }
            if (notification.type === 'new_matching') {
                router.push('/contractor/matching');
                return;
            }
            const savedId =
                notification.source === "government"
                    ? notification.projectId
                    : notification.torId;
    
            if (savedId) {
                router.push(
                    `/contractor/saved?tor=${encodeURIComponent(savedId)}`
                );
                return;
            }
    
            router.push("/contractor/saved");
    
        } catch (error) {
            console.warn(
                "Open notification error:",
                error
            );
        }
    }


    /* Number of unread notifications */
    const unreadCount =
        notifications.filter(
            (notification) =>
                !notification.read
        ).length;


    /* Profile initials */
    const userName =
        displayName ||
        session?.user?.name ||
        user?.email ||
        "ผู้ใช้";


    const initials = userName
        .split(" ")
        .map((word) => word[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);


    return (
        <div className="notification-layout">

            {audience === 'admin' ? <AdminSidebar /> : <Sidebar />}


            <main className="notification-main">

                {/* Header */}

                <header className="notification-header">

                    <div>
                        <h1>
                            การแจ้งเตือน
                        </h1>

                        <p>
                            {audience === 'admin' ? 'คำขอยืนยันตัวตนและรายการรอตรวจสอบ' : audience === 'project_owner' ? 'การยืนยันตัวตนและกำหนดเวลาของ TOR' : 'TOR ที่ตรงกับคุณและ TOR ที่บันทึกไว้'}
                        </p>
                    </div>


                    <div className="profile-header-actions">

                        <div className="notification-header-icon">

                            <Link href={audience === 'admin' ? '/admin/notifications' : audience === 'project_owner' ? '/project_own/notifications' : '/contractor/notifications'} className="notification-button header-action-link header-notification-link" aria-label="การแจ้งเตือน">
                                <BellRing size={18} />
                            </Link>
                        </div>


                        <Link href="/contractor/account" className="profile-circle header-action-link" aria-label="บัญชีของฉัน">
                            {initials}
                        </Link>

                    </div>

                </header>


                {/* Content */}

                <div className="notification-content">

                    {/* Loading */}

                    {loading && (
                        <div className="notification-message">
                            กำลังโหลดการแจ้งเตือน...
                        </div>
                    )}


                    {/* Error */}

                    {!loading && error && (
                        <div className="notification-message error">
                            {error}
                        </div>
                    )}


                    {/* Empty */}

                    {!loading &&
                        !error &&
                        notifications.length === 0 && (

                            <div className="notification-empty">

                                <BellRing size={32} />

                                <h2>
                                    ยังไม่มีการแจ้งเตือน
                                </h2>

                                <p>
                                    เมื่อ TOR ที่คุณบันทึกไว้ใกล้ปิดรับ
                                    หรือ TOR ร่างมีการอัปเดต
                                    การแจ้งเตือนจะแสดงที่นี่
                                </p>

                            </div>
                        )}


                    {/* Notification list */}

                    {!loading &&
                        !error &&
                        notifications.length > 0 && (

                            <div className="notification-list">

                                {notifications.map(
                                    (notification) => (

                                        <button
                                            key={notification._id}
                                            type="button"

                                            className={`
                                                notification-card
                                                ${
                                                    !notification.read
                                                        ? "unread"
                                                        : ""
                                                }
                                            `}

                                            onClick={() =>
                                                handleNotificationClick(
                                                    notification
                                                )
                                            }
                                        >

                                            {/* Icon */}

                                            <div
                                                className={`
                                                    notification-icon
                                                    ${getNotificationClass(
                                                        notification.type
                                                    )}
                                                `}
                                            >
                                                {getNotificationIcon(
                                                    notification.type
                                                )}
                                            </div>


                                            {/* Notification body */}

                                            <div className="notification-body">

                                                <div className="notification-title-row">

                                                    <h2>
                                                        {getNotificationTitle(
                                                            notification
                                                        )}
                                                    </h2>


                                                    {!notification.read && (
                                                        <span className="unread-dot" />
                                                    )}

                                                </div>


                                                <p>
                                                    {getNotificationMessage(
                                                        notification
                                                    )}
                                                </p>


                                                <span className="notification-date">
                                                    {formatNotificationDate(
                                                        notification.sentAt
                                                    )}
                                                </span>

                                            </div>

                                        </button>

                                    )
                                )}

                            </div>
                        )}

                </div>

            </main>

        </div>
    );
}