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
import "./create_TOR.css";

export default function CreateTOR() {
    return (
        <div className="createTOR_layout">
            <Sidebar />

            <main className='createTOR-main-header'>
                <div>
                    <h1>project own page</h1>
                </div>
            </main>
        </div>
    )
}