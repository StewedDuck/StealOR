"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
    BellRing,
    Plus,
    X,
    BriefcaseBusiness,
    MapPin,
    Code2,
    Award,
    CalendarDays,
    Wallet,
    Users,
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

type ContractorType = "individual" | "company" | "freelance_team";
type WorkMode = "onsite" | "remote" | "hybrid";

const skillGroups: Record<string, string[]> = {
  "Programming Languages": [
    "Python", "JavaScript", "TypeScript", "Java",
    "C", "C++", "C#", "Go", "Rust", "PHP", "Kotlin", "Swift"
  ],
  "Frontend & Mobile": [
    "HTML", "CSS", "React", "Next.js", "Vue.js",
    "Angular", "Tailwind CSS", "Flutter", "React Native"
  ],
  "Backend & APIs": [
    "Node.js", "Express.js", "NestJS", "FastAPI",
    "Django", "Flask", "Spring Boot", "REST API", "GraphQL"
  ],
  "Database": [
    "PostgreSQL", "MySQL", "MongoDB", "Redis",
    "SQL Server", "Firebase"
  ],
  "Cloud & DevOps": [
    "AWS", "Azure", "Google Cloud", "Docker",
    "Kubernetes", "GitHub Actions", "Linux"
  ],
  "AI, Data & Security": [
    "Machine Learning", "Deep Learning", "LLM",
    "Computer Vision", "Data Engineering",
    "Cybersecurity", "OWASP", "Automated Testing"
  ],
};

const projectOptions = [
  "Web Application",
  "Mobile Application",
  "ERP",
  "CRM",
  "E-Commerce",
  "Government Systems",
  "AI / Machine Learning",
  "Data Analytics",
  "Cybersecurity",
  "IoT",
  "System Integration",
];

const areaOptions = [
  "ทั่วประเทศไทย",
  "กรุงเทพมหานคร",
  "นนทบุรี",
  "ปทุมธานี",
  "สมุทรปราการ",
  "นครปฐม",
  "ชลบุรี",
  "เชียงใหม่",
];

const certificationOptions = [
  "AWS Certification",
  "Microsoft Certification",
  "Google Cloud Certification",
  "ISO 9001",
  "ISO/IEC 27001",
  "PMP",
  "Scrum Master",
  "CompTIA Security+",
];

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
    const [contractorType, setContractorType] = useState<ContractorType>("individual");

    const [occupation, setOccupation] = useState("");
    const [teamSize, setTeamSize] = useState(1);

    const [projectTypes, setProjectTypes] = useState<string[]>([]);
    const [serviceAreas, setServiceAreas] = useState<string[]>([]);
    const [workModes, setWorkModes] = useState<WorkMode[]>([]);
    const [certifications, setCertifications] = useState<string[]>([]);

    const [minProjectBudget, setMinProjectBudget] = useState<number | null>(null);

    const [maxProjectBudget, setMaxProjectBudget] = useState<number | null>(null);

    const [availableFrom, setAvailableFrom] = useState<string | null>(null);
    const [preferredProjectDuration, setPreferredProjectDuration] = useState("");
    const [additionalInfo, setAdditionalInfo] = useState("");

    const [registeredCapital, setRegisteredCapital] = useState<number | null>(null);
    const [maxPastProjectValue, setMaxPastProjectValue] = useState<number | null>(null);
    const [hasGovernmentExperience, setHasGovernmentExperience] = useState<boolean | null>(null);

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

            setContractorType(profileData.contractorType ?? "individual");
            setOccupation(profileData.occupation ?? "");
            setTeamSize(profileData.teamSize ?? 1);

            setProjectTypes(profileData.projectTypes ?? []);
            setServiceAreas(profileData.serviceAreas ?? []);
            setWorkModes(profileData.workModes ?? []);
            setCertifications(profileData.certifications ?? []);

            setMinProjectBudget(profileData.minProjectBudget ?? null);
            setMaxProjectBudget(profileData.maxProjectBudget ?? null);

            setAvailableFrom(
            profileData.availableFrom
                ? profileData.availableFrom.slice(0, 10)
                : null
            );

            setPreferredProjectDuration(profileData.preferredProjectDuration ?? "");
            setAdditionalInfo(profileData.additionalInfo ?? "");

            setRegisteredCapital(profileData.registeredCapital ?? null);
            setMaxPastProjectValue(profileData.maxPastProjectValue ?? null);
            setHasGovernmentExperience(
                profileData.hasGovernmentExperience ?? null
            );
    
            setSavedTorCount(bookmarks.length);
    
        } catch (error) {
            console.error("Failed to load profile:", error);
        } finally {
            setLoading(false);
        }
        };
    
        loadProfile();
    }, [session?.user?.email]);

    function toggleSelection(
        value: string,
        selected: string[],
        setSelected: (values: string[]) => void
    ) {
        if (selected.includes(value)) {
          setSelected(selected.filter((item) => item !== value));
        } else {
          setSelected([...selected, value]);
        }
    }

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
        setContractorType(profile.contractorType ?? "individual");
        setOccupation(profile.occupation ?? "");
        setTeamSize(profile.teamSize ?? 1);

        setProjectTypes(profile.projectTypes ?? []);
        setServiceAreas(profile.serviceAreas ?? []);
        setWorkModes(profile.workModes ?? []);
        setCertifications(profile.certifications ?? []);

        setMinProjectBudget(profile.minProjectBudget ?? null);
        setMaxProjectBudget(profile.maxProjectBudget ?? null);

        setAvailableFrom(
        profile.availableFrom
            ? profile.availableFrom.slice(0, 10)
            : null
        );

        setPreferredProjectDuration(profile.preferredProjectDuration ?? "");
        setAdditionalInfo(profile.additionalInfo ?? "");
        setRegisteredCapital(profile.registeredCapital ?? null);
        setMaxPastProjectValue(profile.maxPastProjectValue ?? null);
        setHasGovernmentExperience(
            profile.hasGovernmentExperience ?? null
        );
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
                    profileSummary: profileSummary.trim(),
                    experienceYears,
                    experienceSummary: experienceSummary.trim(),
                    skills,

                    contractorType,
                    occupation: occupation.trim(),
                    teamSize,

                    projectTypes,
                    serviceAreas,
                    workModes,
                    certifications,

                    minProjectBudget,
                    maxProjectBudget,

                    availableFrom,
                    preferredProjectDuration: preferredProjectDuration.trim(),
                    additionalInfo: additionalInfo.trim(),

                    registeredCapital,
                    maxPastProjectValue,
                    hasGovernmentExperience,
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

            setContractorType(updated.contractorType ?? "individual");
            setOccupation(updated.occupation ?? "");
            setTeamSize(updated.teamSize ?? 1);

            setProjectTypes(updated.projectTypes ?? []);
            setServiceAreas(updated.serviceAreas ?? []);
            setWorkModes(updated.workModes ?? []);
            setCertifications(updated.certifications ?? []);

            setMinProjectBudget(updated.minProjectBudget ?? null);
            setMaxProjectBudget(updated.maxProjectBudget ?? null);

            setAvailableFrom(
            updated.availableFrom
                ? updated.availableFrom.slice(0, 10)
                : null
            );

            setPreferredProjectDuration(updated.preferredProjectDuration ?? "");
            setAdditionalInfo(updated.additionalInfo ?? "");

            setRegisteredCapital(updated.registeredCapital ?? null);
            setMaxPastProjectValue(updated.maxPastProjectValue ?? null);
            setHasGovernmentExperience(
                updated.hasGovernmentExperience ?? null
            );

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

                    {/* PROFILE SUMMARY */}
                    <section className="profile-summary-card">
                        <div className="profile-summary-identity">
                            <div className="profile-avatar profile-avatar-fallback">
                                {initials}
                            </div>

                            <div>
                                <h2>
                                    {name || "User"}
                                </h2>

                                <p>
                                    {occupation || "ยังไม่ได้ระบุอาชีพ"}
                                </p>

                                <span className="profile-summary-description">
                                    {profileSummary || "เพิ่มข้อมูลโปรไฟล์เพื่อช่วยในการจับคู่ TOR"}
                                </span>
                            </div>
                        </div>

                        <div className="profile-summary-stats">
                            <div>
                                <strong>{savedTorCount}</strong>
                                <span>TOR ที่บันทึก</span>
                            </div>

                            <div>
                                <strong>{skills.length}</strong>
                                <span>ทักษะที่เลือก</span>
                            </div>

                            <div>
                                <strong>{experienceYears}</strong>
                                <span>ปีประสบการณ์</span>
                            </div>
                        </div>
                    </section>

                    {/* BASIC INFORMATION */}
                    <section className="profile-form-card profile-section-full">
                        <div className="profile-section-heading">
                            <Users size={19} />
                            <h2>1. ข้อมูลพื้นฐาน</h2>
                        </div>

                        <div className="profile-divider" />

                        <div className="profile-grid">
                            <div className="profile-field">
                                <label>
                                    ชื่อ - นามสกุล
                                </label>

                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="ชื่อ - นามสกุล"
                                />
                            </div>

                            <div className="profile-field">
                                <label>
                                    อีเมล
                                </label>

                                <input
                                    value={email || ""}
                                    readOnly
                                    className="profile-readonly"
                                />
                            </div>

                            <div className="profile-field">
                                <label>
                                    เบอร์โทรศัพท์
                                </label>

                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="เบอร์โทรศัพท์"
                                />
                            </div>

                            <div className="profile-field">
                                <label>
                                    บริษัท / นิติบุคคล
                                </label>

                                <input
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                    placeholder="ชื่อบริษัท (ถ้ามี)"
                                />
                            </div>

                            <div className="profile-field">
                                <label>
                                    อาชีพ / ตำแหน่งงาน
                                </label>

                                <input
                                    value={occupation}
                                    onChange={(e) => setOccupation(e.target.value)}
                                    placeholder="เช่น Full Stack Developer"
                                />
                            </div>

                            <div className="profile-field">
                                <label>
                                    ประเภทผู้รับจ้าง
                                </label>

                                <select
                                    value={contractorType}
                                    onChange={(e) =>
                                    setContractorType(e.target.value as ContractorType)
                                    }
                                >
                                    <option value="individual">บุคคลทั่วไป</option>
                                    <option value="company">บริษัท</option>
                                    <option value="freelance_team">ทีมฟรีแลนซ์</option>
                                </select>
                            </div>

                            <div className="profile-field">
                                <label>จำนวนสมาชิกในทีม</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={teamSize}
                                    onChange={(e) =>
                                    setTeamSize(Math.max(1, Number(e.target.value) || 1))
                                    }
                                />
                            </div>

                            <div className="profile-field profile-full-width">
                                <label>คำอธิบายโปรไฟล์</label>
                                <textarea
                                    rows={3}
                                    maxLength={200}
                                    value={profileSummary}
                                    onChange={(e) => setProfileSummary(e.target.value)}
                                    placeholder="แนะนำตัวและความเชี่ยวชาญของคุณ"
                                />
                            </div>
                        </div>
                    </section>

                    {/* SKILLS */}
                    <section className="profile-form-card profile-section-full">
                        <div className="profile-section-heading">
                            <Code2 size={19} />
                            <h2>2. ทักษะ Software Engineering</h2>
                        </div>

                        <p className="profile-section-description">
                            เลือกทักษะที่คุณมี เพื่อช่วยให้ระบบจับคู่กับ TOR ได้แม่นยำขึ้น
                        </p>

                        <div className="profile-divider" />

                            {Object.entries(skillGroups).map(([category, options]) => (
                                <div className="profile-option-group" key={category}>
                                    <h3>{category}</h3>

                                    <div className="profile-chip-list">
                                        {options.map((skill) => (
                                        <button
                                            key={skill}
                                            type="button"
                                            aria-pressed={skills.includes(skill)}
                                            className={`profile-chip ${
                                            skills.includes(skill) ? "selected" : ""
                                            }`}
                                            onClick={() =>
                                            toggleSelection(skill, skills, setSkills)
                                            }
                                        >
                                            {skills.includes(skill) && "✓ "}
                                            {skill}
                                        </button>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <div className="profile-option-group">
                                <h3>ทักษะอื่น ๆ</h3>

                                <div className="add-skill-row">
                                    <input
                                        type="text"
                                        value={newSkill}
                                        onChange={(e) => setNewSkill(e.target.value)}
                                        onKeyDown={handleSkillKeyDown}
                                        placeholder="เพิ่มทักษะที่ไม่มีในรายการ"
                                    />

                                    <button
                                        type="button"
                                        className="add-skill-button"
                                        onClick={handleAddSkill}
                                    >
                                        <Plus size={15} />
                                        เพิ่ม
                                    </button>
                                </div>

                                {skills.filter(
                                (skill) =>
                                    !Object.values(skillGroups).flat().includes(skill)
                                ).length > 0 && (
                                <div className="profile-chip-list profile-custom-skills">
                                    {skills
                                    .filter(
                                        (skill) =>
                                        !Object.values(skillGroups).flat().includes(skill)
                                    )
                                    .map((skill) => (
                                        <span className="skill-tag" key={skill}>
                                            {skill}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveSkill(skill)}
                                                aria-label={`ลบ ${skill}`}
                                            >
                                                <X size={13} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                )}
                            </div>
                    </section>

                    {/* TWO COLUMN GRID */}
                    <div className="profile-details-grid">

                    {/* EXPERIENCE */}
                    <section className="profile-form-card">
                            <div className="profile-section-heading">
                            <BriefcaseBusiness size={19} />
                            <h2>3. ประสบการณ์ทำงาน</h2>
                        </div>

                        <div className="profile-divider" />

                        <div className="profile-field">
                            <label>จำนวนปีประสบการณ์</label>
                            <input
                                type="number"
                                min={0}
                                value={experienceYears}
                                onChange={(e) =>
                                setExperienceYears(Math.max(0, Number(e.target.value) || 0))
                                }
                            />
                        </div>

                        <div className="profile-field">
                            <label>สรุปประสบการณ์</label>
                            <textarea
                                rows={4}
                                value={experienceSummary}
                                onChange={(e) => setExperienceSummary(e.target.value)}
                                placeholder="อธิบายประสบการณ์ที่ผ่านมา"
                            />
                        </div>

                        <div className="profile-option-group">
                            <h3>ประเภทโครงการที่เคยทำ</h3>
                            <div className="profile-chip-list">
                                {projectOptions.map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    aria-pressed={projectTypes.includes(item)}
                                    className={`profile-chip ${
                                    projectTypes.includes(item) ? "selected" : ""
                                    }`}
                                    onClick={() =>
                                    toggleSelection(item, projectTypes, setProjectTypes)
                                    }
                                >
                                    {item}
                                </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <div className="profile-details-stack">

                        {/* BUDGET */}
                        <section className="profile-form-card">
                            <div className="profile-section-heading">
                                <Wallet size={19} />
                                <h2>4. งบประมาณโครงการที่รับได้</h2>
                            </div>

                            <div className="profile-divider" />

                            <div className="profile-grid">
                                <div className="profile-field">
                                    <label>งบประมาณขั้นต่ำ (บาท)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={minProjectBudget ?? ""}
                                        onChange={(e) =>
                                        setMinProjectBudget(
                                            e.target.value === "" ? null : Number(e.target.value)
                                        )
                                        }
                                        placeholder="ไม่ระบุ"
                                    />
                                </div>

                                <div className="profile-field">
                                    <label>งบประมาณสูงสุด (บาท)</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={maxProjectBudget ?? ""}
                                        onChange={(e) =>
                                        setMaxProjectBudget(
                                            e.target.value === "" ? null : Number(e.target.value)
                                        )
                                        }
                                        placeholder="ไม่ระบุ"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* SERVICE AREAS */}
                        <section className="profile-form-card">
                            <div className="profile-section-heading">
                                <MapPin size={19} />
                                <h2>5. พื้นที่ให้บริการ</h2>
                            </div>

                            <div className="profile-divider" />

                            <div className="profile-chip-list">
                                {areaOptions.map((area) => (
                                <button
                                    key={area}
                                    type="button"
                                    aria-pressed={serviceAreas.includes(area)}
                                    className={`profile-chip ${
                                    serviceAreas.includes(area) ? "selected" : ""
                                    }`}
                                    onClick={() =>
                                    toggleSelection(area, serviceAreas, setServiceAreas)
                                    }
                                >
                                    {area}
                                </button>
                                ))}
                            </div>
                        </section>
                    </div>
                    </div>

                    {/* THREE COLUMN GRID */}
                    <div className="profile-triple-grid">

                        {/* WORK MODE */}
                        <section className="profile-form-card">
                            <div className="profile-section-heading">
                                <BriefcaseBusiness size={19} />
                                <h2>6. รูปแบบการทำงาน</h2>
                            </div>

                            <div className="profile-divider" />

                            <div className="profile-chip-list">
                                {([
                                    ["onsite", "On-site"],
                                    ["remote", "Remote"],
                                    ["hybrid", "Hybrid"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={workModes.includes(value)}
                                        className={`profile-chip ${
                                            workModes.includes(value) ? "selected" : ""
                                        }`}
                                        onClick={() =>
                                            toggleSelection(
                                            value,
                                            workModes,
                                            (values) => setWorkModes(values as WorkMode[])
                                            )
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* CERTIFICATIONS */}
                        <section className="profile-form-card">
                            <div className="profile-section-heading">
                                <Award size={19} />
                                <h2>7. ใบรับรอง</h2>
                            </div>

                            <div className="profile-divider" />

                            <div className="profile-chip-list">
                                {certificationOptions.map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        aria-pressed={certifications.includes(item)}
                                        className={`profile-chip ${
                                            certifications.includes(item) ? "selected" : ""
                                        }`}
                                        onClick={() =>
                                            toggleSelection(item, certifications, setCertifications)
                                        }
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* AVAILABILITY */}
                        <section className="profile-form-card">
                            <div className="profile-section-heading">
                                <CalendarDays size={19} />
                                <h2>8. ความพร้อมรับงาน</h2>
                            </div>

                            <div className="profile-divider" />

                            <div className="profile-field">
                                <label>วันที่พร้อมเริ่มงาน</label>
                                <input
                                    type="date"
                                    value={availableFrom ?? ""}
                                    onChange={(e) => setAvailableFrom(e.target.value || null)}
                                />
                            </div>

                            <div className="profile-field">
                                <label>ระยะเวลาโครงการที่ต้องการ</label>
                                <select
                                    value={preferredProjectDuration}
                                    onChange={(e) => setPreferredProjectDuration(e.target.value)}
                                >
                                    <option value="">ไม่ระบุ</option>
                                    <option value="less_than_3_months">น้อยกว่า 3 เดือน</option>
                                    <option value="3_to_6_months">3–6 เดือน</option>
                                    <option value="6_to_12_months">6–12 เดือน</option>
                                    <option value="more_than_12_months">มากกว่า 12 เดือน</option>
                                </select>
                            </div>
                        </section>
                    </div>

                    {/* ADDITIONAL INFO */}
                    <section className="profile-form-card profile-section-full">
                        <div className="profile-section-heading">
                            <Award size={19} />
                            <h2>9. คุณสมบัติสำหรับการรับงานภาครัฐ</h2>
                        </div>

                        <div className="profile-divider" />

                        <div className="profile-grid">
                            <div className="profile-field">
                                <label>ทุนจดทะเบียนบริษัท (บาท)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={registeredCapital ?? ""}
                                    onChange={(e) =>
                                        setRegisteredCapital(
                                            e.target.value === ""
                                                ? null
                                                : Number(e.target.value)
                                        )
                                    }
                                    placeholder="เช่น 2000000"
                                />
                            </div>

                            <div className="profile-field">
                                <label>มูลค่าผลงานสูงสุดที่ผ่านมา (บาท)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={maxPastProjectValue ?? ""}
                                    onChange={(e) =>
                                        setMaxPastProjectValue(
                                            e.target.value === ""
                                                ? null
                                                : Number(e.target.value)
                                        )
                                    }
                                    placeholder="เช่น 3000000"
                                />
                            </div>

                            <div className="profile-field profile-full-width">
                                <label>ประสบการณ์งานภาครัฐ</label>

                                <div className="profile-chip-list">
                                    <button
                                        type="button"
                                        className={`profile-chip ${
                                            hasGovernmentExperience === true
                                                ? "selected"
                                                : ""
                                        }`}
                                        aria-pressed={hasGovernmentExperience === true}
                                        onClick={() => setHasGovernmentExperience(true)}
                                    >
                                        เคยทำงานภาครัฐ
                                    </button>

                                    <button
                                        type="button"
                                        className={`profile-chip ${
                                            hasGovernmentExperience === false
                                                ? "selected"
                                                : ""
                                        }`}
                                        aria-pressed={hasGovernmentExperience === false}
                                        onClick={() => setHasGovernmentExperience(false)}
                                    >
                                        ไม่เคยทำงานภาครัฐ
                                    </button>

                                    <button
                                        type="button"
                                        className={`profile-chip ${
                                            hasGovernmentExperience === null
                                                ? "selected"
                                                : ""
                                        }`}
                                        aria-pressed={hasGovernmentExperience === null}
                                        onClick={() => setHasGovernmentExperience(null)}
                                    >
                                        ยังไม่ระบุ
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="profile-field">
                            <label>ข้อมูลหรือคุณสมบัติเพิ่มเติม</label>
                            <textarea
                                rows={4}
                                maxLength={2000}
                                value={additionalInfo}
                                onChange={(e) => setAdditionalInfo(e.target.value)}
                                placeholder="เช่น ประสบการณ์งานภาครัฐ หรือรายละเอียดอื่น ๆ"
                            />
                        </div>
                    </section>

                    {/* ACTIONS */}
                    <div className="profile-actions profile-actions-bottom">
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
                            {saving ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}