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
import "./matching.css";

export default function CreateTOR() {
    return (
        <div className="matching_layout">
            <Sidebar />

            <main className='matching-main-header'>
                <div>
                    <h1>matching page</h1>
                </div>
            </main>
        </div>
    )
}