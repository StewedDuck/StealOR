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
import "./draft.css";

export default function CreateTOR() {
    return (
        <div className="draft_layout">
            <Sidebar />

            <main className='draft-main-header'>
                <div>
                    <h1>draft page</h1>
                </div>
            </main>
        </div>
    )
}