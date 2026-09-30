"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
    Bookmark,
    Camera,
    BellRing,
    Plus,
    X,
} from "lucide-react";

import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";

import {
    getUserProfile,
    updateUserProfile,
    getBookmarks,
    type UserProfile,
} from "@/lib/torApi";

import "./account.css";

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const { showToast } = useToast();

    const [profile, setProfile] =
        useState<UserProfile | null>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [company, setCompany] = useState("");
    const [profileSummary, setProfileSummary] = useState("");
    const [experienceYears, setExperienceYears] = useState(0);
    const [ experienceSummary, setExperienceSummary, ] = useState("");

    const [skills, setSkills] = useState<string[]>([]);

    const [newSkill, setNewSkill] = useState("");
    const [savedTorCount, setSavedTorCount] = useState(0);

    const email = session?.user?.email;

    // LOAD PROFILE
    useEffect(() => {
        const email = session?.user?.email;
    
        if (!email) return;
    
        const loadProfile = async () => {
        try {
            setLoading(true);
    
            const [profileData, bookmarks] = await Promise.all([
            getUserProfile(email),
            getBookmarks(email),
            ]);
    
            setProfile(profileData);
    
            setName(profileData.name);
            setPhone(profileData.phone);
            setCompany(profileData.company);
            setProfileSummary(profileData.profileSummary);
            setExperienceYears(profileData.experienceYears);
            setExperienceSummary(profileData.experienceSummary);
            setSkills(profileData.skills);
    
            setSavedTorCount(bookmarks.length);
    
        } catch (error) {
            console.error("Failed to load profile:", error);
        } finally {
            setLoading(false);
        }
        };
    
        loadProfile();
    }, [session?.user?.email]);

    // SKILLS
    function handleAddSkill() {
        const skill = newSkill.trim();

        if (!skill) return;

        const alreadyExists = skills.some(
        (item) =>
            item.toLowerCase() === skill.toLowerCase()
        );

        if (alreadyExists) {
        showToast(
            "มีคุณสมบัตินี้อยู่แล้ว",
            "error"
        );
        return;
        }

        setSkills((prev) => [...prev, skill]);
        setNewSkill("");
    }

    function handleRemoveSkill(skill: string) {
        setSkills((prev) =>
        prev.filter((item) => item !== skill)
        );
    }

    function handleSkillKeyDown(
        event: React.KeyboardEvent<HTMLInputElement>
    ) {
        if (event.key === "Enter") {
            event.preventDefault();
            handleAddSkill();
        }
    }

    // CANCEL
    function handleCancel() {
        if (!profile) return;

        setName(profile.name || "");
        setPhone(profile.phone || "");
        setCompany(profile.company || "");
        setProfileSummary( profile.profileSummary || "" );
        setExperienceYears( profile.experienceYears || 0 );
        setExperienceSummary( profile.experienceSummary || "" );
        setSkills(profile.skills || []);
        setNewSkill("");
    }

    // SAVE
    async function handleSave() {
        if (!email) {
            showToast(
                "ไม่พบข้อมูลผู้ใช้",
                "error"
            );
            return;
        }

        if (!name.trim()) {
            showToast(
                "กรุณากรอกชื่อ",
                "error"
            );
            return;
        }

        try {
            setSaving(true);

            const updated =
                await updateUserProfile(email, {
                name: name.trim(),
                phone: phone.trim(),
                company: company.trim(),
                profileSummary:
                    profileSummary.trim(),
                experienceYears,
                experienceSummary:
                    experienceSummary.trim(),
                skills,
                });

            setProfile(updated);

            setName(updated.name || "");
            setPhone(updated.phone || "");
            setCompany(updated.company || "");
            setProfileSummary(
                updated.profileSummary || ""
            );
            setExperienceYears(
                updated.experienceYears || 0
            );
            setExperienceSummary(
                updated.experienceSummary || ""
            );
            setSkills(updated.skills || []);

            showToast("บันทึกโปรไฟล์แล้ว");
        } catch (error) {
            console.error(
                "Save profile error:",
                error
            );

            showToast(
                error instanceof Error
                ? error.message
                : "บันทึกโปรไฟล์ไม่สำเร็จ",
                "error"
            );
        } finally {
            setSaving(false);
        }
    }

    if (status === "loading" || loading) {
        return (
            <div className="account-layout">
                <Sidebar />

                <main className="account-main">
                    <div className="profile-loading">
                        กำลังโหลดข้อมูล...
                    </div>
                </main>
            </div>
        );
    }

    const initials =
        name
            .split(" ")
            .filter(Boolean)
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "U";

    return (
        <div className="account-layout">
            <Sidebar />

            <main className="account-main">
                {/* HEADER */}

                <header className="profile-header">
                    <div>
                        <h1>โปรไฟล์</h1>
                        <p>
                            ปรับปรุงข้อมูลคุณสมบัติของคุณให้เป็นปัจจุบันเพื่อให้การจับคู่ข้อมูลมีความแม่นยำ
                        </p>
                    </div>

                    <div className="profile-header-actions">
                        <button className="notification-button">
                        <BellRing size={16}/>
                        </button>

                        <div className="profile-circle">
                            {initials}
                        </div>
                    </div>
                </header>

                <div className="profile-content">

                    {/* LEFT PROFILE CARD */}
                    <section className="profile-card">
                        <div className="profile-avatar-wrapper">
                            <div className="profile-avatar profile-avatar-fallback">
                                {initials}
                            </div>
                        </div>

                        <h2>{name || "User"}</h2>

                        <p className="profile-role">
                            {profileSummary || "ยังไม่ได้เพิ่มคำอธิบายโปรไฟล์"}
                        </p>

                        {/* MOCKUP STATS */}
                        <div className="profile-stats">
                            <div>
                                <strong>8</strong>
                                <span>ตรงกัน</span>
                            </div>

                            <div>
                                <strong>73%</strong>
                                    <span>
                                    ความตรงกันเฉลี่ย
                                    </span>
                            </div>

                            <div>
                                <strong>{savedTorCount}</strong>
                                <span>บันทึกไว้</span>
                            </div>
                        </div>
                    </section>

                    {/* RIGHT FORM */}
                    <section className="profile-form-card">
                        <h2>ข้อมูลพื้นฐาน</h2>

                        <div className="profile-divider" />

                        <div className="profile-grid">
                            {/* NAME */}
                            <div className="profile-field">
                                <label>ชื่อ - นามสกุล</label>

                                <input
                                    type="text"
                                    value={name}
                                    onChange={(event) =>
                                        setName(
                                        event.target.value
                                        )
                                    }
                                    placeholder="ชื่อ - นามสกุล"
                                />
                            </div>

                            {/* EMAIL */}
                            <div className="profile-field">
                                <label>อีเมล</label>

                                <input
                                    type="email"
                                    value={email || ""}
                                    readOnly
                                    className="profile-readonly"
                                />
                            </div>

                            {/* PHONE */}
                            <div className="profile-field">
                                <label>
                                    เบอร์โทรศัพท์
                                </label>

                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(event) =>
                                        setPhone(
                                        event.target.value
                                        )
                                    }
                                    placeholder="+66"
                                />
                            </div>

                            {/* COMPANY */}
                            <div className="profile-field">
                                <label>
                                    บริษัท / นิติบุคคล
                                </label>

                                <input
                                    type="text"
                                    value={company}
                                    onChange={(event) =>
                                        setCompany(
                                        event.target.value
                                        )
                                    }
                                    placeholder="ชื่อบริษัท"
                                />
                            </div>

                            {/* PROFILE SUMMARY */}
                            <div className="profile-field profile-full-width">
                                <label>
                                    คำอธิบายโปรไฟล์
                                </label>

                                <input
                                    type="text"
                                    value={profileSummary}
                                    onChange={(event) =>
                                        setProfileSummary(
                                        event.target.value
                                        )
                                    }
                                    placeholder="เช่น ผู้รับจ้างพัฒนาระบบแบบฟูลสแต็ก"
                                    maxLength={200}
                                />
                            </div>
                        </div>

                        {/* EXPERIENCE */}
                        <h2 className="profile-section-title">
                            ประสบการณ์ & คุณสมบัติ
                        </h2>

                        <div className="profile-divider" />

                        <div className="profile-field">
                            <label>
                                ปีที่มีประสบการณ์
                            </label>

                            <input
                                type="number"
                                min="0"
                                value={experienceYears}
                                onChange={(event) =>
                                setExperienceYears(
                                    Math.max(
                                    0,
                                    Number(
                                        event.target.value
                                    )
                                    )
                                )
                                }
                            />
                        </div>

                        <div className="profile-field">
                            <label>
                                สรุปประสบการณ์
                            </label>

                            <textarea
                                rows={4}
                                value={experienceSummary}
                                onChange={(event) =>
                                setExperienceSummary(
                                    event.target.value
                                )
                                }
                                placeholder="อธิบายประสบการณ์ของคุณ"
                            />
                        </div>

                        {/* SKILLS */}
                        <div className="profile-field">
                            <label>
                                ทักษะ & คุณสมบัติ
                            </label>

                            <div className="skills-box">
                                {skills.length > 0 && (
                                    <div className="skills-list">
                                        {skills.map((skill) => (
                                            <span
                                                key={skill}
                                                className="skill-tag"
                                            >
                                                {skill}

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveSkill(
                                                        skill
                                                        )
                                                    }
                                                    aria-label={`ลบ ${skill}`}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                <div className="add-skill-row">
                                    <input
                                        type="text"
                                        value={newSkill}
                                        onChange={(event) =>
                                            setNewSkill(
                                                event.target.value
                                            )
                                        }
                                        onKeyDown={
                                            handleSkillKeyDown
                                        }
                                        placeholder="เช่น React, Node.js, AWS"
                                    />

                                    <button
                                        type="button"
                                        className="add-skill-button"
                                        onClick={handleAddSkill}
                                    >
                                        <Plus size={15} />
                                        เพิ่มคุณสมบัติ
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ACTIONS */}
                        <div className="profile-actions">
                            <button
                                type="button"
                                className="profile-cancel-button"
                                onClick={handleCancel}
                                disabled={saving}
                            >
                                ยกเลิก
                            </button>

                            <button
                                type="button"
                                className="profile-save-button"
                                onClick={handleSave}
                                disabled={saving}
                            >
                                {saving
                                ? "กำลังบันทึก..."
                                : "บันทึกโปรไฟล์"}
                            </button>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}