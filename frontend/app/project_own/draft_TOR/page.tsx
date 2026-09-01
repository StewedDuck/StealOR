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
import "./draft_TOR.css";

export default function CreateTOR() {
    return (
        <div className="draftTOR_layout">
            <Sidebar />

            <main className='draftTOR-main-header'>
                <div>
                    <h1>Draft TORs</h1>
                </div>
            </main>
        </div>
    )
}