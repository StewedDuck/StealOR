"use client";

import { X } from "lucide-react";
import type { Tor, MarketTorDetail } from "@/types/tor";
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


export default function TorDetailModal({
    tor,
    onClose,
    progressStatus = "unknown",
}: TorDetailModalProps) {

    const isGovernment = "source" in tor && tor.source === "government";

    const deadline = "biddingClosingDate" in tor
        ? tor.biddingClosingDate?.dateTime ?? tor.submissionDeadline
        : tor.submissionDeadline;

    const qualifications = isGovernment
        ? tor.contractorQualifications
        : undefined;

    const generalLegal = qualifications?.generalLegal ?? [];
    const projectSpecific = qualifications?.projectSpecific ?? [];

    const technicalRequirements = isGovernment
        ? tor.technicalRequirements ?? []
        : [];

    const deliverables = isGovernment
        ? tor.deliverables ?? []
        : [];

    const hasAnalyzedQualifications = generalLegal.length > 0 || projectSpecific.length > 0;

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

                    <div className="tor-info-card">
                        <span>ราคากลาง</span>
                        <strong>
                            {tor.referencePriceEstimate == null ? '-' : formatBudget(tor.referencePriceEstimate)}
                        </strong>
                    </div>

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
                            <ol>
                            {tor.objectives.map((item, index) => (
                                <li key={index}>{item}</li>
                            ))}
                            </ol>
                        ) : (
                            <p>ยังไม่มีข้อมูลวัตถุประสงค์</p>
                        )}
                    </section>


                    {/* Scope of Work */}
                    {tor.scopeOfWork.length > 0 && (
                        <section className="tor-section">

                            <h3>ขอบเขตงาน</h3>

                            <ol>
                                {tor.scopeOfWork.map(
                                    (item, index) => (
                                        <li key={index}>
                                            {item}
                                        </li>
                                    )
                                )}
                            </ol>

                        </section>
                    )}

                    {/* Government Contractor Qualifications */}
                    {isGovernment && hasAnalyzedQualifications && (
                        <section className="tor-section">
                            <h3>คุณสมบัติผู้รับจ้าง</h3>

                            {generalLegal.length > 0 && (
                                <div className="tor-analysis-group">
                                    <h4>คุณสมบัติทั่วไปและข้อกำหนดทางกฎหมาย</h4>
                                    <ol>
                                        {generalLegal.map((item, index) => (
                                            <li key={`legal-${index}`}>{item}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            {projectSpecific.length > 0 && (
                                <div className="tor-analysis-group">
                                    <h4>คุณสมบัติเฉพาะโครงการ</h4>
                                    <ol>
                                        {projectSpecific.map((item, index) => (
                                            <li key={`specific-${index}`}>{item}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                        </section>
                    )}

                    {/* Technical Requirements */}
                    {isGovernment && technicalRequirements.length > 0 && (
                        <section className="tor-section">
                            <h3>ข้อกำหนดทางเทคนิค</h3>
                            <ol>
                                {technicalRequirements.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {/* Deliverables */}
                        {isGovernment && deliverables.length > 0 && (
                        <section className="tor-section">
                            <h3>สิ่งที่ต้องส่งมอบ</h3>
                            <ol>
                                {deliverables.map((item, index) => (
                                    <li key={index}>{item}</li>
                                ))}
                            </ol>
                        </section>
                    )}


                    {/* Requirements */}
                    {!hasAnalyzedQualifications &&
                    (tor.requirements?.length ?? 0) > 0 && (
                        <section className="tor-section">

                            <h3>คุณสมบัติที่ต้องการ</h3>

                            <div className="qualification-list">

                                {tor.requirements?.map(
                                    (requirement, index) => (

                                        <div
                                            key={index}
                                            className="qualification-item"
                                        >

                                            <div className="qualification-icon">
                                                <span>{index + 1}.</span>
                                            </div>

                                            <div className="qualification-name">
                                                <span>
                                                    {requirement.description}
                                                </span>
                                            </div>

                                            <span className="qualification-status status-match">
                                                {requirement.mandatory
                                                    ? "บังคับ"
                                                    : `น้ำหนัก ${requirement.weight}%`
                                                }
                                            </span>

                                        </div>

                                    )
                                )}

                            </div>

                        </section>
                    )}


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
