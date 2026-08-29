"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Bookmark,
    Search,
    User,
    FileText,
    CircleCheckBig,
    BellRing,
 } from "lucide-react";
import { useRouter } from "next/navigation";

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
        label: "ภาครวม",
        items: [
            {
                name: "แดชบอร์ด",
                href: "/dashboard",
                icon: "LayoutDashboard",
            },
        ],
    },
    {
        label: "ค้นหา TOR",
        items: [
            {
                name: "ค้นหา TOR",
                href: "/market",
                icon: "Search",
            },
            {
                name: "TORs ที่ตรงกัน",
                href: "/matching",
                icon: "CircleCheckBig",
            },
            {
                name: "บันทึกไว้",
                href: "/saved",
                icon: "Bookmark",
            },
        ],
    },
    {
        label: "การจัดการ",
        items: [
            {
                name: "การแจ้งเตือน",
                href: "/notifications",
                icon: "BellRing",
                badge : 24,
            },
            {
                name: "บัญชีของฉัน",
                href: "/account",
                icon: "User",
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

            {/* Role switch */}
            <div className="role-switch">
                <button 
                    className="role-button active"
                    onClick={() => router.push("/")}
                >
                    ผู้รับจ้าง
                </button>
                <button 
                    className="role-button"
                    onClick={() => router.push("/dashboard-projectOwn")}
                >
                    เจ้าของโครงการ
                </button>
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
                                        {item.icon === "Search" && <Search size={20}/>}
                                        {item.icon === "Bookmark" && <Bookmark size={20}/>}
                                        {item.icon === "User" && <User size={20}/>}
                                        {item.icon === "FileText" && <FileText size={20}/>}
                                        {item.icon === "CircleCheckBig" && <CircleCheckBig size={20}/>}
                                        {item.icon === "BellRing" && <BellRing size={20}/>}
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
                    <div className="user-role">ผู้รับจ้าง</div>
                </div>

                <button className="logout-button">ออกจากระบบ</button>
             </div>
        </aside>
    );
}