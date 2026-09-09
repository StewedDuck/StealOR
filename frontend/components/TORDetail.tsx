"use client";

import { X, CheckCircle2 } from "lucide-react";
import type { Tor, MarketTorDetail } from "@/types/tor";
import "./TORDetail.css"

type TorDetailModalProps = {
    tor: Tor | MarketTorDetail;
    onClose: () => void;
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
}: TorDetailModalProps) {
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
                            {formatBudget(tor.budget)}
                        </strong>
                    </div>

                    <div className="tor-info-card">
                        <span>กำหนดส่ง</span>
                        <strong>
                            {formatDate(tor.submissionDeadline)}
                        </strong>
                    </div>

                    <div className="tor-info-card">
                        <span>ผู้ติดต่อ</span>
                        <strong>
                            {tor.contactName || "ไม่ระบุ"}
                        </strong>
                    </div>

                </div>


                {/* Body */}
                <div className="tor-modal-body">

                    {/* Description */}
                    {tor.description && (
                        <section className="tor-section">

                            <h3>รายละเอียดโครงการ</h3>

                            <p>
                                {tor.description}
                            </p>

                        </section>
                    )}


                    {/* Objectives */}
                    {tor.objectives.length > 0 && (
                        <section className="tor-section">

                            <h3>วัตถุประสงค์</h3>

                            <ul>
                                {tor.objectives.map(
                                    (item, index) => (
                                        <li key={index}>
                                            {item}
                                        </li>
                                    )
                                )}
                            </ul>

                        </section>
                    )}


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


                    {/* Requirements */}
                    {tor.requirements.length > 0 && (
                        <section className="tor-section">

                            <h3>คุณสมบัติที่ต้องการ</h3>

                            <div className="qualification-list">

                                {tor.requirements.map(
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