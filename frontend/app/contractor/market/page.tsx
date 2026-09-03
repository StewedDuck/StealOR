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
import "./market.css";

export default function CreateTOR() {
    return (
        <div className="market_layout">
            <Sidebar />

            <main className='market-main-header'>
                <div>
                    <h1>market page</h1>
                </div>
            </main>
        </div>
    )
}