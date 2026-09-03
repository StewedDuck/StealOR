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
import "./account.css";

export default function CreateTOR() {
    return (
        <div className="account_layout">
            <Sidebar />

            <main className='account-main-header'>
                <div>
                    <h1>account page</h1>
                </div>
            </main>
        </div>
    )
}