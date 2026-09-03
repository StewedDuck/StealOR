"use client";

import {
    X,
    CheckCircle2,
    XCircle,
} from "lucide-react";

type Tor = {
    title: string;
    organization: string;
    budget: string;
    location: string;
    deadline: string;

    matched: boolean;
    match: number;

    description: string;

    requirements: {
        name: string;
        matched: boolean;
    }[];
};

type TorDetailModalProps = {
    tor: Tor;
    onClose: () => void;
};

export default function TorDetailModal({
    tor,
    onClose,
}: TorDetailModalProps) {
    const matchedCount = tor.requirements.filter(
        (requirement) => requirement.matched
    ).length;

    return (
        <div className="tor-modal-overlay" onClick={onClose}>
            <div
                className="tor-modal"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div className="tor-modal-header">

                    <div className="tor-status-row">
                        <span className="tor-status published">
                            ประกาศแล้ว
                        </span>

                        <span className="tor-status closing">
                            ใกล้ปิดรับ
                        </span>
                    </div>

                    <button
                        type="button"
                        className="tor-modal-close"
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>

                    <h2>{tor.title}</h2>

                    <p>
                        {tor.organization} &nbsp;·&nbsp; TOR
                    </p>

                </div>


                {/* Basic Information */}
                <div className="tor-info-grid">

                    <div className="tor-info-card">
                        <span>งบประมาณ</span>
                        <strong>{tor.budget}</strong>
                    </div>

                    <div className="tor-info-card">
                        <span>ปิดรับ</span>
                        <strong>{tor.deadline}</strong>
                    </div>

                    <div className="tor-info-card">
                        <span>สถานที่</span>
                        <strong>{tor.location}</strong>
                    </div>

                </div>


                {/* Match Summary */}
                <div className="tor-match-summary">

                    <div className="match-circle">
                        <span>{tor.match}%</span>
                    </div>

                    <div className="match-summary-text">
                        <h3>การจับคู่คุณสมบัติ</h3>

                        <p>
                            {matchedCount} จาก{" "}
                            {tor.requirements.length}{" "}
                            คุณสมบัติที่ต้องการ ตรงกัน
                        </p>
                    </div>

                </div>


                {/* Scrollable Body */}
                <div className="tor-modal-body">

                    {/* Description */}
                    <section className="tor-section">

                        <h3>ขอบเขตงาน</h3>

                        <p>
                            {tor.description}
                        </p>

                    </section>


                    {/* Qualification */}
                    <section className="tor-section">

                        <h3>
                            คุณสมบัติที่ใช้ในการจับคู่
                        </h3>

                        <div className="qualification-list">

                            {tor.requirements.map(
                                (requirement, index) => (

                                    <div
                                        key={index}
                                        className={`qualification-item ${
                                            requirement.matched
                                                ? "matched"
                                                : "unmatched"
                                        }`}
                                    >

                                        <div className="qualification-icon">

                                            {requirement.matched ? (
                                                <CheckCircle2
                                                    size={19}
                                                />
                                            ) : (
                                                <XCircle
                                                    size={19}
                                                />
                                            )}

                                        </div>


                                        <div className="qualification-name">
                                            <span>
                                                {requirement.name}
                                            </span>
                                        </div>


                                        <span
                                            className={`qualification-status ${
                                                requirement.matched
                                                    ? "status-match"
                                                    : "status-unmatch"
                                            }`}
                                        >
                                            {requirement.matched
                                                ? "MATCH"
                                                : "UNMATCH"}
                                        </span>

                                    </div>

                                )
                            )}

                        </div>

                    </section>

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