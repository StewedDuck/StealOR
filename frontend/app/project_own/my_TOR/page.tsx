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
import "./my_TOR.css";

export default function CreateTOR() {
    return (
        <div className="myTOR_layout">
            <Sidebar />

            <main className='myTOR-main-header'>
                <div>
                    <h1>My TORs</h1>
                </div>
            </main>
        </div>
    )
}