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
import "./verification.css";

export default function CreateTOR() {
    return (
        <div className="verification_layout">
            <Sidebar />

            <main className='verification-main-header'>
                <div>
                    <h1>verification page</h1>
                </div>
            </main>
        </div>
    )
}