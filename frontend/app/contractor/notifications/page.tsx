"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/sideBar";
import {
    CircleCheckBig,
    Clock,
    BellRing,
    TriangleAlert,
} from "lucide-react";
import "./notification.css";

export default function CreateTOR() {
    return (
        <div className="notification_layout">
            <Sidebar />

            <main className='notification-main-header'>
                <div>
                    <h1>notification page</h1>
                </div>
            </main>
        </div>
    )
}