"use client";

import { X, CheckCircle2 } from "lucide-react";
import { REQUIREMENT_CATEGORIES, type Tor, type MarketTorDetail } from "@/types/tor";
import { normalizeTorRequirements } from "@/lib/torRequirements";
import "./TORDetail.css"
import TorStatusProgress from "@/components/TorStatusProgress";

type TorDetailModalProps = {
    tor: Tor | MarketTorDetail;
    onClose: () => void;
    progressStatus?: "draft" | "open" | "closed" | "unknown";
};

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
});

function formatBudget(budget: number | null) {
    return budget == null
        ? "ไม่ระบุ"
        : `฿${budget.toLocaleString("th-TH")}`;
}

function formatDate(value: string | null) {
    if (!value) return "ไม่ระบุ";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "ไม่ระบุ";
    }

    return dateFormatter.format(date);
}


// แสดงข้อมูลที่เจ้าของกรอกและข้อมูลโครงการรัฐด้วยหัวข้อเดียวกัน
export default function TorDetailModal({
    tor,
    onClose,
    progressStatus = "unknown",
}: TorDetailModalProps) {


    // ข้อมูลรัฐใช้กลุ่มข้อความเดิม ส่วน TOR ภายในจัดหมวดจากรายการที่มีน้ำหนัก
    const isGovernment = "source" in tor && tor.source === "government";
    const qualifications = isGovernment && "contractorQualifications" in tor ? tor.contractorQualifications : undefined;
    const generalLegal = isGovernment ? qualifications?.generalLegal ?? [] : [];
    const projectSpecific = isGovernment ? qualifications?.projectSpecific ?? [] : [];
    const technicalRequirements = isGovernment && "technicalRequirements" in tor ? tor.technicalRequirements ?? [] : [];
    const deliverables = isGovernment && "deliverables" in tor ? tor.deliverables ?? [] : [];
    const hasAnalyzedQualifications = generalLegal.length > 0 || projectSpecific.length > 0;
    const requirements = isGovernment ? tor.requirements ?? [] : normalizeTorRequirements(tor);
    const requirementGroups = Object.entries(REQUIREMENT_CATEGORIES).map(([category, title]) => ({
      category, title, items: requirements.filter((item) => (item.category ?? "projectSpecific") === category),
    })).filter((group) => group.items.length > 0);

    return (
        <div
            className="tor-modal-overlay"
            onClick={onClose}
        >
            <div
                className="tor-modal"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div className="tor-modal-header">

                    <div className="tor-status-row">
                        <span className="tor-status draft">
                            {"source" in tor && tor.source === "government"
                                ? "Government"
                                : "ฉบับร่าง"}
                        </span>

                        <span className="tor-status">
                            {"source" in tor && tor.source === "government"
                                ? tor.status
                                : "ยังไม่เปิดรับสมัคร"}
                        </span>
                    </div>

                    <button
                        type="button"
                        className="tor-modal-close"
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>

                    <h2 style={{color: "#EEF1F3"}}>{tor.projectName}</h2>

                    <p>
                        {tor.agencyName} &nbsp;·&nbsp; TOR
                    </p>

                </div>


                {/* Basic Information */}
                <div className="tor-info-grid">

                    <div className="tor-info-card">
                        <span>งบประมาณ</span>
                        <strong>
                            {formatBudget(
                            "allocatedBudget" in tor
                                ? tor.allocatedBudget ?? tor.budget
                                : tor.budget
                            )}
                        </strong>
                    </div>

                    {tor.referencePriceEstimate != null && (
                        <div className="tor-info-card">
                            <span>ราคากลาง</span>
                            <strong>
                            {formatBudget(tor.referencePriceEstimate ?? null)}
                            </strong>
                        </div>
                    )}

                    <div className="tor-info-card">
                        <span>กำหนดส่ง</span>
                        <strong>
                            {formatDate(tor.submissionDeadline)}
                        </strong>
                    </div>
                </div>


                {/* Body */}
                <div className="tor-modal-body">

                    {/* Progress Bar */}
                    <TorStatusProgress status={progressStatus} />

                    {/* Description */}
                    {tor.description && (
                        <section className="tor-section">
                            <h3>รายละเอียดโครงการ</h3>
                            <p>{tor.description}</p>
                        </section>
                    )}


                    {/* Objectives */}
                    <section className="tor-section">
                        <h3>วัตถุประสงค์</h3>

                        {(tor.objectives?.length ?? 0) > 0 ? (
                            <ul>
                            {tor.objectives.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                            </ul>
                        ) : (
                            <p>ยังไม่มีข้อมูลวัตถุประสงค์</p>
                        )}
                    </section>


                    {/* Scope of Work */}
                    {tor.scopeOfWork.length > 0 && (
                        <section className="tor-section">

                            <h3>ขอบเขตงาน</h3>

                            <ul>
                                {tor.scopeOfWork.map(
                                    (item, index) => (
                                        <li key={index}>
                                            {item}
                                        </li>
                                    )
                                )}
                            </ul>

                        </section>
                    )}

                    {/* Government Contractor Qualifications */}
                    {hasAnalyzedQualifications && (
                        <section className="tor-section">
                            <h3>คุณสมบัติผู้รับจ้าง</h3>

                            {generalLegal.length > 0 && (
                                <div className="tor-analysis-group">
                                    <h4>คุณสมบัติทั่วไปและข้อกำหนดทางกฎหมาย</h4>
                                    <ul>
                                        {generalLegal.map((item, index) => (
                                            <li key={`legal-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {projectSpecific.length > 0 && (
                                <div className="tor-analysis-group">
                                    <h4>คุณสมบัติเฉพาะโครงการ</h4>
                                    <ul>
                                        {projectSpecific.map((item, index) => (
                                            <li key={`specific-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    {/* Technical Requirements */}
                    {technicalRequirements.length > 0 && (
                        <section className="tor-section">
                            <h3>ข้อกำหนดทางเทคนิค</h3>
                            <ul>
                                {technicalRequirements.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Deliverables */}
                        {deliverables.length > 0 && (
                        <section className="tor-section">
                            <h3>สิ่งที่ต้องส่งมอบ</h3>
                            <ul>
                                {deliverables.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ul>
                        </section>
                    )}


                    {/* Requirements */}
                    {requirementGroups.map((group) => (
                        <section className="tor-section" key={group.category}>

                            <h3>{group.title}</h3>

                            <div className="qualification-list">

                                {group.items.map(
                                    (requirement, index) => (

                                        <div
                                            key={index}
                                            className="qualification-item"
                                        >

                                            <div className="qualification-icon">
                                                <CheckCircle2 size={19} />
                                            </div>

                                            <div className="qualification-name">
                                                <span>
                                                    {requirement.description}
                                                </span>
                                            </div>

                                            <span className="qualification-status status-match">
                                                {`น้ำหนัก ${requirement.weight}%${requirement.mandatory ? " · จำเป็นต้องผ่าน" : ""}`}
                                            </span>

                                        </div>

                                    )
                                )}

                            </div>

                        </section>
                    ))}


                    {/* Contact */}
                    {(tor.contactName || tor.contactEmail) && (
                        <section className="tor-section">

                            <h3>ติดต่อ</h3>

                            <p>
                                {tor.contactName || ""}
                                {tor.contactName && tor.contactEmail
                                    ? " · "
                                    : ""}
                                {tor.contactEmail || ""}
                            </p>

                        </section>
                    )}

                </div>


                {/* Footer */}
                <div className="tor-modal-footer">

                    <button
                        type="button"
                        className="tor-close-button"
                        onClick={onClose}
                    >
                        ปิด
                    </button>

                </div>

            </div>
        </div>
    );
}