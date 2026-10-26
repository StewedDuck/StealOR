"use client";

import Link from 'next/link';

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
    FileText,
    Clock3,
    Building2,
  } from "lucide-react";

import Sidebar from "@/components/sideBar";
import { useToast } from "@/components/toast/ToastProvider";


import {
    getUserProfile,
    updateUserProfile,
    getBookmarks,
    type UserProfile,
    type PastProject,
    type CertificationDetail,
    type LegalEligibility,
    type TeamQualification,
} from "@/lib/torApi";

import "./account.css";

import FilterDropdown from "@/components/FilterDropdown";

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


const emptyLegalEligibility: LegalEligibility = {
    registrationNumber: "",
    bankruptcyStatus: "unknown",
    debarmentStatus: "unknown",
    evidenceUrl: "",

    legalCapacity: null,
    liquidationStatus: "unknown",
    suspensionStatus: "unknown",

    isJuristicPerson: null,
    isEGPRegistered: null,
    hasConflictOfInterest: null,

    hasCourtImmunity: null,
    hasCourtImmunityWaiver: null,

    hasAntiCorruptionPolicy: null,
    hasSignedIntegrityAgreement: null,
    meetsProcurementCommitteeQualifications: null,

    companyRegistrationDate: null,
    netWorth: null,
};

const emptyPastProject = (): PastProject => ({
    projectName: "",
    projectType: "",
    projectValue: null,
    hasContract: null,
    contractValue: null,
    durationMonths: null,
    clientName: "",
    completedAt: null,
    evidenceUrl: "",
});

const emptyCertification = (): CertificationDetail => ({
    name: "",
    holderType: "individual",
    holderName: "",
    issuedAt: null,
    expiresAt: null,
    evidenceUrl: "",
});

const emptyTeamRole = (): TeamQualification => ({
    role: "",
    memberCount: 1,
    experienceYears: 0,
    educationLevel: "unspecified",
    skills: [],
});

type NullableBooleanField = {
    label: string;
    value: boolean | null | undefined;
    onChange: (value: boolean | null) => void;
};

function BooleanEligibilityField({
    label,
    value,
    onChange,
}: NullableBooleanField) {
    return (
        <div className="profile-field">
            <label>{label}</label>

            <FilterDropdown
                value={
                    value === true
                        ? "yes"
                        : value === false
                        ? "no"
                        : "unknown"
                }
                options={[
                    { value: "unknown", label: "ยังไม่ระบุ" },
                    { value: "yes", label: "ใช่" },
                    { value: "no", label: "ไม่ใช่" },
                ]}
                onChange={(selected) =>
                    onChange(
                        selected === "yes"
                            ? true
                            : selected === "no"
                            ? false
                            : null
                    )
                }
            />
        </div>
    );
}

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

    const [pastProjects, setPastProjects] = useState<PastProject[]>([]);
    const [editingPastProjectIndex, setEditingPastProjectIndex] = useState<number | null>(null);

    const [certificationDetails, setCertificationDetails] = useState<CertificationDetail[]>([]);
    const [editingCertificationIndex, setEditingCertificationIndex] = useState<number | null>(null);

    const [legalEligibility, setLegalEligibility] = useState<LegalEligibility>({ ...emptyLegalEligibility });
    const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);

    const [teamQualifications, setTeamQualifications] = useState<TeamQualification[]>([]);

    function setPastProject(
        index: number,
        changes: Partial<PastProject>
    ) {
        setPastProjects((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, ...changes } : item
            )
        );
    }

    function setCertificationDetail(
        index: number,
        changes: Partial<CertificationDetail>
    ) {
        setCertificationDetails((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, ...changes } : item
            )
        );
    }

    function setTeamQualification(
        index: number,
        changes: Partial<TeamQualification>
    ) {
        setTeamQualifications((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, ...changes } : item
            )
        );
    }
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


            setPastProjects(profileData.pastProjects ?? []);
            setCertificationDetails(profileData.certificationDetails ?? []);
            setLegalEligibility(
                profileData.legalEligibility ?? { ...emptyLegalEligibility }
            );
            setTeamQualifications(profileData.teamQualifications ?? []);

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


        setPastProjects(profile.pastProjects ?? []);
        setCertificationDetails(profile.certificationDetails ?? []);
        setLegalEligibility(
            profile.legalEligibility ?? { ...emptyLegalEligibility }
        );
        setTeamQualifications(profile.teamQualifications ?? []);

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

            console.log("Sending pastProjects:", pastProjects);

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

                    pastProjects,
                    certificationDetails,
                    legalEligibility,
                    teamQualifications,
                });

                console.log("Backend returned pastProjects:", updated.pastProjects);

            setProfile(updated);

            setPastProjects(updated.pastProjects ?? []);
            setCertificationDetails(updated.certificationDetails ?? []);
            setLegalEligibility(
                updated.legalEligibility ?? { ...emptyLegalEligibility }
            );
            setTeamQualifications(updated.teamQualifications ?? []);

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
                        <Link href={'/contractor/notifications'} className="notification-button header-action-link header-notification-link" aria-label="การแจ้งเตือน">
                        <BellRing size={16}/>
                        </Link>

                        <Link href="/contractor/account" className="profile-circle header-action-link" aria-label="บัญชีของฉัน">
                            {initials}
                        </Link>
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

                                <FilterDropdown
                                    value={contractorType}
                                    options={[
                                        { value: "individual", label: "บุคคลทั่วไป" },
                                        { value: "company", label: "บริษัท" },
                                        { value: "freelance_team", label: "ทีมฟรีแลนซ์" },
                                    ]}
                                    onChange={(value) =>
                                        setContractorType(value as ContractorType)
                                    }
                                />
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

                    <div className="profile-full-row">
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

                            <div className="profile-divider" />
                            <div className="profile-list-heading">
                                <h3>ผลงานที่ผ่านมา (Past Projects)</h3>

                                <button
                                    type="button"
                                    className="add-skill-button"
                                    onClick={() => {
                                        const newIndex = pastProjects.length;
                                        setPastProjects((prev) => [
                                            ...prev,
                                            emptyPastProject(),
                                        ]);
                                        setEditingPastProjectIndex(newIndex);
                                    }}
                                >
                                    <Plus size={15} />
                                    เพิ่มผลงาน
                                </button>
                            </div>

                            {pastProjects.map((project, index) => (
                                <div className="profile-entry-card" key={index}>
                                    <div className="profile-entry-header">
                                        <strong>ผลงานที่ {index + 1}</strong>
                                        <button
                                            type="button"
                                            className="profile-remove-button"
                                            onClick={() => {
                                                setPastProjects((prev) =>
                                                    prev.filter((_, i) => i !== index)
                                                );
                                                setEditingPastProjectIndex((current) => {
                                                    if (current === null) return null;
                                                    if (current === index) return null;
                                                    return current > index ? current - 1 : current;
                                                });
                                            }}
                                        >
                                            <X size={15} /> ลบ
                                        </button>
                                    </div>

                                    {editingPastProjectIndex === index ? (
                                        <>
                                            <div className="profile-grid">
                                                <div className="profile-field">
                                                    <label>ชื่อโปรเจกต์</label>
                                                    <input
                                                        value={project.projectName}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                projectName: e.target.value,
                                                            })
                                                        }
                                                        placeholder="Government Web Portal"
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>ประเภทโครงการ</label>
                                                    <FilterDropdown
                                                        value={project.projectType}
                                                        options={[
                                                            { value: "", label: "เลือกประเภท" },
                                                            ...projectOptions.map((type) => ({
                                                                value: type,
                                                                label: type,
                                                            })),
                                                        ]}
                                                        onChange={(value) =>
                                                            setPastProject(index, {
                                                                projectType: value,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>มูลค่าโครงการ (บาท)</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={project.projectValue ?? ""}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                projectValue:
                                                                    e.target.value === ""
                                                                        ? null
                                                                        : Number(e.target.value),
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>มีสัญญาจ้างสำหรับโครงการนี้หรือไม่</label>

                                                    <FilterDropdown
                                                        value={
                                                            project.hasContract === true
                                                                ? "yes"
                                                                : project.hasContract === false
                                                                ? "no"
                                                                : "unknown"
                                                        }
                                                        options={[
                                                            { value: "unknown", label: "ยังไม่ระบุ" },
                                                            { value: "yes", label: "มีสัญญาจ้าง" },
                                                            { value: "no", label: "ไม่มีสัญญาจ้าง" },
                                                        ]}
                                                        onChange={(value) =>
                                                            setPastProject(index, {
                                                                hasContract:
                                                                    value === "yes"
                                                                        ? true
                                                                        : value === "no"
                                                                        ? false
                                                                        : null,
                                                                contractValue:
                                                                    value === "no" ? null : project.contractValue,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>มูลค่าสัญญาจ้าง (บาท)</label>

                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={project.contractValue ?? ""}
                                                        disabled={project.hasContract !== true}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                contractValue:
                                                                    e.target.value === ""
                                                                        ? null
                                                                        : Number(e.target.value),
                                                            })
                                                        }
                                                        placeholder="เช่น 10000000"
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>ระยะเวลา (เดือน)</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={project.durationMonths ?? ""}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                durationMonths:
                                                                    e.target.value === ""
                                                                        ? null
                                                                        : Number(e.target.value),
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>ลูกค้า / หน่วยงาน</label>
                                                    <input
                                                        value={project.clientName}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                clientName: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>วันที่เสร็จสิ้น</label>
                                                    <input
                                                        type="date"
                                                        value={project.completedAt?.slice(0, 10) ?? ""}
                                                        onChange={(e) =>
                                                            setPastProject(index, {
                                                                completedAt: e.target.value || null,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>

                                            <div className="profile-summary-actions">
                                                <button
                                                    type="button"
                                                    className="add-skill-button"
                                                    onClick={() => {
                                                        if (!project.projectName.trim()) {
                                                            alert("กรุณากรอกชื่อโปรเจกต์");
                                                            return;
                                                        }

                                                        setEditingPastProjectIndex(null);
                                                    }}
                                                >
                                                    บันทึกผลงาน
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="past-project-summary">
                                            <div className="past-project-main">
                                                <div className="past-project-icon">
                                                    <FileText size={23} />
                                                </div>

                                                <div className="past-project-title">
                                                    <h4>{project.projectName || "ยังไม่ระบุชื่อโครงการ"}</h4>
                                                    <p>
                                                        ประเภทโครงการ: {project.projectType || "-"}
                                                    </p>
                                                    <p>
                                                        มูลค่าโครงการ:{" "}
                                                        {project.projectValue != null
                                                            ? `${project.projectValue.toLocaleString("th-TH")} บาท`
                                                            : "-"}
                                                    </p>
                                                    <p>
                                                        สัญญาจ้าง:{" "}
                                                        {project.hasContract === true
                                                            ? "มีสัญญาจ้าง"
                                                            : project.hasContract === false
                                                            ? "ไม่มีสัญญาจ้าง"
                                                            : "ยังไม่ระบุ"}
                                                    </p>

                                                    {project.hasContract === true && (
                                                        <p>
                                                            มูลค่าสัญญาจ้าง:{" "}
                                                            {project.contractValue != null
                                                                ? `${project.contractValue.toLocaleString("th-TH")} บาท`
                                                                : "ยังไม่ระบุ"}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="past-project-detail">
                                                <span>ระยะเวลา</span>
                                                <strong>
                                                    <Clock3 size={17} />
                                                    {project.durationMonths != null
                                                        ? `${project.durationMonths} เดือน`
                                                        : "-"}
                                                </strong>
                                            </div>

                                            <div className="past-project-detail">
                                                <span>ลูกค้า / หน่วยงาน</span>
                                                <strong>
                                                    <Building2 size={17} />
                                                    {project.clientName || "-"}
                                                </strong>
                                            </div>

                                            <div className="past-project-detail">
                                                <span>วันที่เสร็จสิ้น</span>
                                                <strong>
                                                    <CalendarDays size={17} />
                                                    {project.completedAt?.slice(0, 10) || "-"}
                                                </strong>
                                            </div>

                                            <div className="past-project-actions">
                                                <button
                                                    type="button"
                                                    className="past-project-edit"
                                                    onClick={() => setEditingPastProjectIndex(index)}
                                                >
                                                    แก้ไข
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </section>
                    </div>

                    {/* Three COLUMN GRID */}
                    <div className="profile-three-column-row">
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
                                        )}
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
                                        )}
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
                    </div>

                    {/* THREE COLUMN GRID */}
                    <div className="profile-vertical-grid">
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

                            <div className="profile-divider" />

                            <div className="profile-list-heading">
                                <h3>รายละเอียดใบรับรอง</h3>
                                <button
                                    type="button"
                                    className="add-skill-button"
                                    onClick={() => {
                                        const newIndex = certificationDetails.length;
                                    
                                        setCertificationDetails((prev) => [
                                            ...prev,
                                            emptyCertification(),
                                        ]);
                                    
                                        setEditingCertificationIndex(newIndex);
                                    }}
                                >
                                    <Plus size={15} />
                                    เพิ่มใบรับรอง
                                </button>
                            </div>
                            
                            {certificationDetails.map((cert, index) => (
                                <div className="profile-entry-card" key={index}>
                                    <div className="profile-entry-header">
                                        <strong>ใบรับรองที่ {index + 1}</strong>

                                        <button
                                            type="button"
                                            className="profile-remove-button"
                                            onClick={() => {
                                                setCertificationDetails((prev) =>
                                                    prev.filter((_, i) => i !== index)
                                                );
                                                setEditingCertificationIndex((current) => {
                                                    if (current === null || current === index) return null;
                                                    return current > index ? current - 1 : current;
                                                });
                                            }}
                                        >
                                            <X size={15} /> ลบ
                                        </button>
                                    </div>

                                    {editingCertificationIndex === index ? (
                                        <>
                                            <div className="profile-grid">
                                                <div className="profile-field profile-full-width">
                                                    <label>ชื่อใบรับรอง</label>
                                                    <input
                                                        list="profile-cert-options"
                                                        value={cert.name}
                                                        onChange={(e) =>
                                                            setCertificationDetail(index, {
                                                                name: e.target.value,
                                                            })
                                                        }
                                                        placeholder="AWS Certification"
                                                    />
                                                    <datalist id="profile-cert-options">
                                                        {certificationOptions.map((option) => (
                                                            <option key={option} value={option} />
                                                        ))}
                                                    </datalist>
                                                </div>

                                                <div className="profile-field">
                                                    <label>ประเภทผู้ถือใบรับรอง</label>
                                                    <FilterDropdown
                                                        value={cert.holderType}
                                                        options={[
                                                            { value: "individual", label: "บุคคล" },
                                                            { value: "company", label: "บริษัท" },
                                                        ]}
                                                        onChange={(value) =>
                                                            setCertificationDetail(index, {
                                                                holderType: value as CertificationDetail["holderType"],
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>ชื่อผู้ถือใบรับรอง</label>
                                                    <input
                                                        value={cert.holderName}
                                                        onChange={(e) =>
                                                            setCertificationDetail(index, {
                                                                holderName: e.target.value,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>วันที่ออก</label>
                                                    <input
                                                        type="date"
                                                        value={cert.issuedAt?.slice(0, 10) ?? ""}
                                                        onChange={(e) =>
                                                            setCertificationDetail(index, {
                                                                issuedAt: e.target.value || null,
                                                            })
                                                        }
                                                    />
                                                </div>

                                                <div className="profile-field">
                                                    <label>วันหมดอายุ</label>
                                                    <input
                                                        type="date"
                                                        value={cert.expiresAt?.slice(0, 10) ?? ""}
                                                        onChange={(e) =>
                                                            setCertificationDetail(index, {
                                                                expiresAt: e.target.value || null,
                                                            })
                                                        }
                                                    />
                                                </div>
                                            </div>

                                            <div className="profile-summary-actions">
                                                <button
                                                    type="button"
                                                    className="add-skill-button"
                                                    onClick={() => {
                                                        if (!cert.name.trim()) {
                                                            showToast("กรุณากรอกชื่อใบรับรอง", "error");
                                                            return;
                                                        }

                                                        setEditingCertificationIndex(null);
                                                    }}
                                                >
                                                    บันทึกใบรับรอง
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="profile-horizontal-summary">
                                            <div className="profile-horizontal-main">
                                                <div className="profile-detail-icon">
                                                    <Award size={22} />
                                                </div>

                                                <div className="profile-horizontal-title">
                                                    <h4>{cert.name || "ยังไม่ระบุชื่อใบรับรอง"}</h4>
                                                    <span>
                                                        {cert.holderType === "company"
                                                            ? "ใบรับรองสำหรับบริษัท"
                                                            : "ใบรับรองสำหรับบุคคล"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="profile-horizontal-field">
                                                <span>ผู้ถือใบรับรอง</span>
                                                <strong>{cert.holderName || "-"}</strong>
                                            </div>

                                            <div className="profile-horizontal-field">
                                                <span>วันที่ออก</span>
                                                <strong>
                                                    {cert.issuedAt
                                                        ? new Date(cert.issuedAt).toLocaleDateString("th-TH", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                        })
                                                        : "-"}
                                                </strong>
                                            </div>

                                            <div className="profile-horizontal-field">
                                                <span>วันหมดอายุ</span>
                                                <strong>
                                                    {cert.expiresAt
                                                        ? new Date(cert.expiresAt).toLocaleDateString("th-TH", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                        })
                                                        : "-"}
                                                </strong>
                                            </div>

                                            <button
                                                type="button"
                                                className="profile-detail-edit"
                                                onClick={() => setEditingCertificationIndex(index)}
                                            >
                                                แก้ไข
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}


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
                                <FilterDropdown
                                    value={preferredProjectDuration}
                                    options={[
                                        { value: "", label: "ไม่ระบุ" },
                                        { value: "less_than_3_months", label: "น้อยกว่า 3 เดือน" },
                                        { value: "3_to_6_months", label: "3–6 เดือน" },
                                        { value: "6_to_12_months", label: "6–12 เดือน" },
                                        { value: "more_than_12_months", label: "มากกว่า 12 เดือน" },
                                    ]}
                                    onChange={(value) => setPreferredProjectDuration(value)}
                                />
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

                    {/* LEGAL ELIGIBILITY */}
                    <section className="profile-form-card profile-section-full">
                        <div className="profile-section-heading">
                            <Award size={19} />
                            <h2>10. คุณสมบัติทางกฎหมาย (Legal & Eligibility)</h2>
                        </div>

                        <p className="profile-section-description">
                            ข้อมูลที่กรอกเป็นการแจ้งด้วยตนเอง
                            ยังไม่ถือว่าผ่านการตรวจสอบหรือมีสิทธิ์ยื่นข้อเสนอโดยอัตโนมัติ
                        </p>

                        <div className="profile-divider" />

                        <div className="profile-grid">
                            <div className="profile-field profile-full-width">
                                <label>เลขทะเบียนนิติบุคคล (กรณีบริษัท)</label>
                                <input
                                    value={legalEligibility.registrationNumber}
                                    onChange={(e) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            registrationNumber: e.target.value,
                                        }))
                                    }
                                    placeholder="เลขทะเบียนบริษัท"
                                    disabled={contractorType !== "company"}
                                />
                            </div>

                            <div className="profile-field">
                                <label>สถานะล้มละลาย</label>
                                <FilterDropdown
                                    value={legalEligibility.bankruptcyStatus}
                                    options={[
                                        { value: "unknown", label: "ยังไม่ยืนยัน" },
                                        { value: "no", label: "ไม่เป็นบุคคลล้มละลาย" },
                                        { value: "yes", label: "เป็นบุคคลล้มละลาย" },
                                    ]}
                                    onChange={(value) => 
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            bankruptcyStatus: value as
                                                LegalEligibility["bankruptcyStatus"],
                                        }))
                                    }
                                />
                            </div>

                            <div className="profile-field">
                                <label>สถานะผู้ทิ้งงาน</label>
                                <FilterDropdown
                                     value={legalEligibility.debarmentStatus}
                                    options={[
                                        { value: "unknown", label: "ยังไม่ยืนยัน" },
                                        { value: "no", label: "ไม่อยู่ในบัญชีผู้ทิ้งงาน" },
                                        { value: "yes", label: "อยู่ในบัญชีผู้ทิ้งงาน" },
                                    ]}
                                    onChange={(value) => 
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            debarmentStatus: value as LegalEligibility["debarmentStatus"],
                                        }))
                                    }
                                />
                            </div>

                            <div className="profile-field">
                                <label>สถานะการชำระบัญชี</label>
                                <FilterDropdown
                                    value={legalEligibility.liquidationStatus ?? "unknown"}
                                    options={[
                                        { value: "unknown", label: "ยังไม่ระบุ" },
                                        { value: "no", label: "ไม่อยู่ระหว่างชำระบัญชี" },
                                        { value: "yes", label: "อยู่ระหว่างชำระบัญชี" },
                                    ]}
                                    onChange={(value) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            liquidationStatus:
                                                value as LegalEligibility["liquidationStatus"],
                                        }))
                                    }
                                />
                            </div>

                            <div className="profile-field">
                                <label>สถานะการระงับสิทธิ์</label>
                                <FilterDropdown
                                    value={legalEligibility.suspensionStatus ?? "unknown"}
                                    options={[
                                        { value: "unknown", label: "ยังไม่ระบุ" },
                                        { value: "no", label: "ไม่ถูกระงับสิทธิ์" },
                                        { value: "yes", label: "ถูกระงับสิทธิ์" },
                                    ]}
                                    onChange={(value) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            suspensionStatus:
                                                value as LegalEligibility["suspensionStatus"],
                                        }))
                                    }
                                />
                            </div>

                            {([
                                ["legalCapacity", "มีความสามารถตามกฎหมาย"],
                                ["isJuristicPerson", "เป็นนิติบุคคล"],
                                ["isEGPRegistered", "ลงทะเบียนในระบบ e-GP แล้ว"],
                                ["hasConflictOfInterest", "มีผลประโยชน์ทับซ้อน"],
                                ["hasCourtImmunity", "ได้รับความคุ้มกันจากศาล"],
                                ["hasCourtImmunityWaiver", "สละความคุ้มกันจากศาลแล้ว"],
                                ["hasAntiCorruptionPolicy", "มีนโยบายต่อต้านการทุจริต"],
                                ["hasSignedIntegrityAgreement", "ลงนามข้อตกลงคุณธรรมแล้ว"],
                                [
                                    "meetsProcurementCommitteeQualifications",
                                    "มีคุณสมบัติตามข้อกำหนดของคณะกรรมการจัดซื้อจัดจ้าง",
                                ],
                            ] as const).map(([field, label]) => (
                                <BooleanEligibilityField
                                    key={field}
                                    label={label}
                                    value={legalEligibility[field]}
                                    onChange={(value) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            [field]: value,
                                        }))
                                    }
                                />
                            ))}

                            <div className="profile-field">
                                <label>วันที่จดทะเบียนบริษัท</label>
                                <input
                                    type="date"
                                    value={
                                        legalEligibility.companyRegistrationDate?.slice(0, 10) ?? ""
                                    }
                                    onChange={(e) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            companyRegistrationDate: e.target.value || null,
                                        }))
                                    }
                                />
                            </div>

                            <div className="profile-field">
                                <label>มูลค่าสินทรัพย์สุทธิ (บาท)</label>
                                <input
                                    type="number"
                                    value={legalEligibility.netWorth ?? ""}
                                    onChange={(e) =>
                                        setLegalEligibility((prev) => ({
                                            ...prev,
                                            netWorth:
                                                e.target.value === ""
                                                    ? null
                                                    : Number(e.target.value),
                                        }))
                                    }
                                    placeholder="ไม่ระบุ"
                                />
                            </div>
                        </div>
                    </section>

                    {/* TEAM QUALIFICATIONS */}
                    <section className="profile-form-card profile-section-full">
                        <div className="profile-section-heading">
                            <Users size={19} />
                            <h2>11. คุณสมบัติทีมงาน (Team Qualifications)</h2>
                        </div>

                        <p className="profile-section-description">
                            ระบุตำแหน่ง จำนวนคน และทักษะของทีม
                            เพื่อใช้เปรียบเทียบกับ TOR
                        </p>

                        <div className="profile-divider" />

                        <div className="profile-list-heading">
                            <h3>ตำแหน่งในทีม</h3>
                            <button
                                type="button"
                                className="add-skill-button"
                                onClick={() => {
                                    const newIndex = teamQualifications.length;
                                
                                    setTeamQualifications((prev) => [
                                        ...prev,
                                        emptyTeamRole(),
                                    ]);
                                
                                    setEditingTeamIndex(newIndex);
                                }}
                            >
                                <Plus size={15} />
                                เพิ่มตำแหน่ง
                            </button>
                        </div>
                        
                        {teamQualifications.map((team, index) => (
                            <div className="profile-entry-card" key={index}>
                                <div className="profile-entry-header">
                                    <strong>ตำแหน่งที่ {index + 1}</strong>

                                    <button
                                        type="button"
                                        className="profile-remove-button"
                                        onClick={() => {
                                            setTeamQualifications((prev) =>
                                                prev.filter((_, i) => i !== index)
                                            );
                                            setEditingTeamIndex((current) => {
                                                if (current === null || current === index) return null;
                                                return current > index ? current - 1 : current;
                                            });
                                        }}
                                    >
                                        <X size={15} /> ลบ
                                    </button>
                                </div>

                                {editingTeamIndex === index ? (
                                    <>
                                        <div className="profile-grid">
                                            <div className="profile-field">
                                                <label>ตำแหน่ง</label>
                                                <input
                                                    value={team.role}
                                                    onChange={(e) =>
                                                        setTeamQualification(index, {
                                                            role: e.target.value,
                                                        })
                                                    }
                                                    placeholder="Software Developer"
                                                />
                                            </div>

                                            <div className="profile-field">
                                                <label>จำนวนคน</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={team.memberCount}
                                                    onChange={(e) =>
                                                        setTeamQualification(index, {
                                                            memberCount: Math.max(
                                                                1,
                                                                Number(e.target.value) || 1
                                                            ),
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div className="profile-field">
                                                <label>ประสบการณ์เฉลี่ย/ขั้นต่ำ (ปี)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={team.experienceYears}
                                                    onChange={(e) =>
                                                        setTeamQualification(index, {
                                                            experienceYears: Math.max(
                                                                0,
                                                                Number(e.target.value) || 0
                                                            ),
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div className="profile-field">
                                                <label>วุฒิการศึกษาขั้นต่ำ</label>
                                                <FilterDropdown
                                                    value={team.educationLevel ?? "unspecified"}
                                                    options={[
                                                        { value: "unspecified", label: "ไม่ระบุ" },
                                                        { value: "vocational", label: "ปวช." },
                                                        { value: "diploma", label: "ปวส." },
                                                        { value: "bachelor", label: "ปริญญาตรี" },
                                                        { value: "master", label: "ปริญญาโท" },
                                                        { value: "doctorate", label: "ปริญญาเอก" },
                                                    ]}
                                                    onChange={(value) =>
                                                        setTeamQualification(index, {
                                                            educationLevel: value as TeamQualification["educationLevel"],
                                                        })
                                                    }
                                                />
                                            </div>

                                            <div className="profile-field">
                                                <label>Skills (คั่นด้วย comma)</label>
                                                <input
                                                    value={team.skills.join(", ")}
                                                    onChange={(e) =>
                                                        setTeamQualification(index, {
                                                            skills: e.target.value.split(","),
                                                        })
                                                    }
                                                    placeholder="React, Node.js, TypeScript"
                                                />
                                            </div>
                                        </div>

                                        <div className="profile-summary-actions">
                                            <button
                                                type="button"
                                                className="add-skill-button"
                                                onClick={() => {
                                                    if (!team.role.trim()) {
                                                        showToast("กรุณากรอกตำแหน่ง", "error");
                                                        return;
                                                    }

                                                    setEditingTeamIndex(null);
                                                }}
                                            >
                                                บันทึกตำแหน่ง
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="profile-horizontal-summary">
                                        <div className="profile-horizontal-main">
                                            <div className="profile-detail-icon">
                                                <Users size={22} />
                                            </div>

                                            <div className="profile-horizontal-title">
                                                <h4>{team.role || "ยังไม่ระบุตำแหน่ง"}</h4>
                                                <span>คุณสมบัติทีมงาน</span>
                                            </div>
                                        </div>

                                        <div className="profile-horizontal-field">
                                            <span>จำนวนสมาชิก</span>
                                            <strong>{team.memberCount} คน</strong>
                                        </div>

                                        <div className="profile-horizontal-field">
                                            <span>ประสบการณ์</span>
                                            <strong>{team.experienceYears} ปี</strong>
                                        </div>

                                        <div className="profile-horizontal-field">
                                            <span>วุฒิการศึกษาขั้นต่ำ</span>
                                            <strong>
                                                {({
                                                    unspecified: "ไม่ระบุ",
                                                    vocational: "ปวช.",
                                                    diploma: "ปวส.",
                                                    bachelor: "ปริญญาตรี",
                                                    master: "ปริญญาโท",
                                                    doctorate: "ปริญญาเอก",
                                                } as Record<string, string>)[
                                                    team.educationLevel ?? "unspecified"
                                                ] ?? "ไม่ระบุ"}
                                            </strong>
                                        </div>

                                        <button
                                            type="button"
                                            className="profile-detail-edit"
                                            onClick={() => setEditingTeamIndex(index)}
                                        >
                                            แก้ไข
                                        </button>

                                        {team.skills.some((skill) => skill.trim()) && (
                                            <div className="profile-horizontal-skills">
                                                <span>ทักษะ:</span>
                                                {team.skills
                                                    .filter((skill) => skill.trim())
                                                    .map((skill, skillIndex) => (
                                                        <span
                                                            className="profile-horizontal-skill"
                                                            key={skillIndex}
                                                        >
                                                            {skill.trim()}
                                                        </span>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
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