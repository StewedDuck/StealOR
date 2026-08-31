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
    Plus,
    File,
    ShieldCheck,
    FileCheckCorner,
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

// contractor section
const contractorMenuItems: MenuSection[] = [
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

// project own section
const projectOwnerMenuItems: MenuSection[] = [
    {
        label: "เจ้าของโครงการ",
        items: [
            {
                name: "สร้าง TOR",
                href: "/project_own/create_TOR",
                icon: "Plus",
            },
            {
                name: "TOR ของฉัน",
                href: "/project_own/my_TOR",
                icon: "FileCheckCorner",
            },
            {
                name: "TOR ร่างของฉัน",
                href: "/project_own/draft_TOR",
                icon: "File",
            },
        ],
    },

    {
        label: "บัญชีผู้ใช้",
        items: [
            {
                name: "การยืนยันตัวตน",
                href: "/project_own/verification",
                icon: "ShieldCheck",
            },
        ],
    },
];

function MenuIcon({
    icon,
}: {
    icon: string;
}) {
    if (icon === "LayoutDashboard") {
        return <LayoutDashboard size={20} />;
    }

    if (icon === "Search") {
        return <Search size={20} />;
    }

    if (icon === "Bookmark") {
        return <Bookmark size={20} />;
    }

    if (icon === "User") {
        return <User size={20} />;
    }

    if (icon === "FileText") {
        return <FileText size={20} />;
    }

    if (icon === "CircleCheckBig") {
        return <CircleCheckBig size={20} />;
    }

    if (icon === "BellRing") {
        return <BellRing size={20} />;
    }

    if (icon === "CircleCheckBig") {
        return <CircleCheckBig size={20} />;
    }

    if (icon === "Plus") {
        return <Plus size={20} />;
    }

    if (icon === "ShieldCheck") {
        return <ShieldCheck size={20} />;
    }
    
    if (icon === "FileCheckCorner") {
        return <FileCheckCorner size={20} />;
    }

    if (icon === "File") {
        return <File size={20} />;
    }

    return null;
}


export default function sideBar () {
    const pathname = usePathname();
    const router = useRouter();

    const isProjectOwner =
    pathname.startsWith("/project_own/create_TOR") ||
    pathname.startsWith("/project_own/my-tor") ||
    pathname.startsWith("/project_own/draft_TOR") ||
    pathname.startsWith("/project_own/verification");

    const menuItems = isProjectOwner
    ? projectOwnerMenuItems
    : contractorMenuItems;

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
                    type="button"
                    className={`role-button ${
                        !isProjectOwner ? "active" : ""
                    }`}
                    onClick={() => router.push("/dashboard")}
                >
                    ผู้รับจ้าง
                </button>


                <button
                    type="button"
                    className={`role-button ${
                        isProjectOwner ? "active" : ""
                    }`}
                    onClick={() => router.push("/project_own/create_TOR")}
                >
                    เจ้าของโครงการ
                </button>

            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {menuItems.map((section) => (
                    <div
                        className="nav-section"
                        key={section.label}
                    >
                        <div className="nav-section-title">
                            {section.label}
                        </div>
                        {section.items.map((item) => {

                            const isActive =
                                pathname === item.href ||
                                pathname.startsWith(
                                    `${item.href}/`
                                );
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`nav-item ${
                                        isActive
                                            ? "active"
                                            : ""
                                    }`}
                                >
                                    <span className="nav-item-icon">
                                        <MenuIcon
                                            icon={item.icon}
                                        />
                                    </span>
                                    <span className="nav-item-name">
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
                    <div className="user-role">
                        {isProjectOwner
                            ? "เจ้าของโครงการ"
                            : "ผู้รับจ้าง"
                        }
                    </div>
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