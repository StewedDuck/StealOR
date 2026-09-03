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
import "./saved.css";

export default function CreateTOR() {
    return (
        <div className="saved_layout">
            <Sidebar />

            <main className='saved-main-header'>
                <div>
                    <h1>saved page</h1>
                </div>
            </main>
        </div>
    )
}