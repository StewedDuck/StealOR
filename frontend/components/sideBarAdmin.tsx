"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Users,
    ShieldCheck,
    RotateCcwClock,
    Siren,
 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

type MenuItem = {
    name: string;
    href: string;
    icon: string;
    badge?: number;
};

type MenuSection = {
    label: string;
    items: MenuItem[];
}


const menuItems: MenuSection[] = [
    {
        label: "ผู้ดูแลระบบ",
        items: [
            {
                name: "แดชบอร์ด",
                href: "/admin/dashboard",
                icon: "LayoutDashboard",
            },
            {
                name: "จัดการผู้ใช้งาน",
                href: "/manageUser",
                icon: "Users",
            },
            {
                name: "ยืนยัดตัวตน",
                href: "/verify_identity",
                icon: "ShieldCheck",
            },
            {
                name: "บันทึกกิจกรรม",
                href: "/activity",
                icon: "RotateCcwClock",
            },
            {
                name: "รายงาน / ร้องเรียน",
                href: "/issue",
                icon: "Siren",
            },
        ],
    },
];

export default function sideBar () {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <aside className = "sidebar">
            {/* Logo */}
            <div className="sidebar-brand">
                <div className="sidebar-Logo">
                    T
                </div>

                <div className="brand-text">
                    <div className="brand-name">
                        sTealORs
                    </div>
                    <div className = "brand-sub">
                        ค้นหา TOR · กรุงเทพฯ
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {menuItems.map((section) => (
                    <div className="nav-section" key={section.label}>
                        <div className="nav-section-title">
                            {section.label}
                        </div>

                        {section.items.map((item) => {
                            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                            return (
                                <Link
                                    key = {item.name}
                                    href = {item.href}
                                    className = {`nav-item ${isActive ? "active" : ""}`}
                                >
                                    <span className="nav-item-icon">
                                        {item.icon === "LayoutDashboard" && <LayoutDashboard size={20}/>}
                                        {item.icon === "Users" && <Users size={20}/>}
                                        {item.icon === "ShieldCheck" && <ShieldCheck size={20}/>}
                                        {item.icon === "RotateCcwClock" && <RotateCcwClock size={20}/>}
                                        {item.icon === "Siren" && <Siren size={20}/>}
                                    </span>

                                    <span className = "nav-item-name">
                                        {item.name}
                                    </span>

                                    {item.badge !== undefined && (
                                        <span className="nav-item-badge">
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

             {/* User */}
             <div className="sidebar-user">
                <div className="user-avatar">CD</div>

                <div className="user-info">
                    <div className="user-name">Cool Dog</div>
                    <div className="user-role">แอดมิน</div>
                </div>

                <button
                    type="button"
                    className="logout-button"
                    onClick={() =>
                        signOut({
                            callbackUrl: "/login",
                        })
                    }
                >
                    ออกจากระบบ
                </button>
             </div>
        </aside>
    );
}