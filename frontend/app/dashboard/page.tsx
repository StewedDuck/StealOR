"use client";

import{
    CircleCheckBig,
    Clock,
    ClockPlus,
    Coins,
    BellRing,
} from 'lucide-react'
import Sidebar from '@/components/sideBar';
import "./dashboard.css";
import SummaryCard from "@/components/SummaryCard";
import MatchRateTrend from "@/components/MatchRateTrend";
import QualificationGapChart from "@/components/QualificationGapChart";
import { useState } from "react";
import TorDetailModal from "@/components/TorDetailModal";

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

export default function DashboardPage() {
    const [selectedTor, setSelectedTor] = useState<Tor | null>(null);

    return (
        <>
            <div className='dashboard-layout'>
                <Sidebar />

                <main className='dashboard-main-header'>

                    {/* Header */}
                    <header className='dashboard-header'>
                        <div>
                            <h1>
                                แดชบอร์ด
                            </h1>

                            <p>
                                ภาพรวมกิจกรรมของ TOR ที่ตรงกับคุณสมบัติของคุณ
                            </p>
                        </div>

                        <div className='dashboard-header-actions'>
                            <button className='notification-buttom'>
                                <BellRing size={16} />
                            </button>

                            <div className='user-avater'>
                                CD
                            </div>
                        </div>
                    </header>

                    <header className='dashboard-main'>

                        <div className='dashboard-content'>

                            {/* Summary */}
                            <section className="summary-grid">
                                <SummaryCard
                                    icon={<CircleCheckBig size={20} />}
                                    title="TORs ที่ตรงกัน"
                                    value="24"
                                    footer="+4 TORs"
                                    footerType="success"
                                />
                                <SummaryCard
                                    icon={<ClockPlus size={20} />}
                                    title="TORs มาใหม่วันนี้"
                                    value="12"
                                    footer="TORs ใหม่วันนี้"
                                    footerType="normal"
                                />
                                <SummaryCard
                                    icon={<Clock size={20} />}
                                    title="TORs ใกล้ปิดรับ"
                                    value="5"
                                    footer="TORs ที่จะปิดภายใน 5 วัน"
                                    footerType="warning"
                                />
                                <SummaryCard
                                    icon={<Coins size={20} />}
                                    title="มูลค่า TORs ที่ตรงกัน"
                                    value="฿18.5M"
                                    footer="มูลค่ารวมของ TORs ที่ตรงกัน"
                                    footerType="normal"
                                />
                            </section>

                            {/* Charts */}
                            <section className="dashboard-charts">

                                {/* Match Rate Trend */}
                                <MatchRateTrend />

                                {/* Qualification Gap Analysis */}
                                <QualificationGapChart />

                            </section>

                            {/* Bottom Row */}
                            <div className="dashboard-bottom-grid">

                                {/* Almost Closing */}
                                <div className="dashboard-card closing-card">

                                    <div className="card-heading">
                                        <div>
                                            <h2>ใกล้ปิดรับ</h2>
                                            <p>TORs ที่ตรงกันและใกล้ปิดรับ</p>
                                        </div>

                                        <button className="view-all">
                                            ดูทั้งหมด
                                        </button>
                                    </div>


                                    <div className="closing-list">

                                        <button
                                            type="button"
                                            className="closing-item"
                                            onClick={() =>
                                                setSelectedTor({
                                                    title: "จ้างเหมาพัฒนาแอปพลิเคชันมือถือสำหรับให้บริการประชาชน",
                                                    organization: "สำนักงานเขตรางรัก",
                                                    budget: "25,000,000 บาท",
                                                    location: "กรุงเทพมหานคร",
                                                    deadline: "4 วัน",
                                                    matched: true,
                                                    match: 74,
                                                    description:
                                                        "โครงการจ้างเหมาพัฒนาแอปพลิเคชันมือถือสำหรับให้บริการประชาชน",
                                                    requirements: [
                                                        {
                                                            name: "มีประสบการณ์พัฒนา Mobile Application",
                                                            matched: true,
                                                        },
                                                        {
                                                            name: "มีประสบการณ์พัฒนาระบบสำหรับหน่วยงานภาครัฐ",
                                                            matched: true,
                                                        },
                                                        {
                                                            name: "มีใบรับรอง ISO 27001",
                                                            matched: false,
                                                        },
                                                    ],
                                                })
                                            }
                                        >

                                            <div className="closing-info">

                                                <div className="closing-title">
                                                    จ้างเหมาพัฒนาแอปพลิเคชันมือถือสำหรับให้บริการประชาชน
                                                </div>

                                                <div className="closing-organization">
                                                    สำนักงานเขตรางรัก
                                                </div>

                                            </div>


                                            <div className="closing-meta">

                                                <span className="closing-match">
                                                    74%
                                                </span>

                                                <span className="closing-days">
                                                    4d left
                                                </span>

                                            </div>

                                        </button>


                                        <button
                                            type="button"
                                            className="closing-item"
                                            onClick={() =>
                                                setSelectedTor({
                                                    title: "โครงการพัฒนาเว็บไซต์และระบบสมาชิกออนไลน์",
                                                    organization: "ธนาคารออมสิน",
                                                    budget: "50,000,000 บาท",
                                                    location: "กรุงเทพมหานคร",
                                                    deadline: "5 วัน",
                                                    matched: true,
                                                    match: 68,
                                                    description: "โครงการพัฒนาเว็บไซต์และระบบสมาชิกออนไลน์",
                                                    requirements: [
                                                        {
                                                            name: "มีประสบการณ์พัฒนาเว็บไซต์",
                                                            matched: true,
                                                        },
                                                        {
                                                            name: "มีประสบการณ์ระบบสมาชิกออนไลน์",
                                                            matched: true,
                                                        },
                                                        {
                                                            name: "มีใบรับรอง ISO 27001",
                                                            matched: false,
                                                        },
                                                    ],
                                                })
                                            }
                                        >

                                            <div className="closing-info">

                                                <div className="closing-title">
                                                    โครงการพัฒนาเว็บไซต์และระบบสมาชิกออนไลน์
                                                </div>

                                                <div className="closing-organization">
                                                ธนาคารออมสิน
                                                </div>

                                            </div>


                                            <div className="closing-meta">

                                                <span className="closing-match">
                                                    68%
                                                </span>

                                                <span className="closing-days">
                                                    5d left
                                                </span>
                                            </div>
                                        </button>
                                    </div> 
                                </div>


                                {/* Software Type */}
                                <div className="dashboard-card software-card">

                                    <div className="card-heading">

                                        <div>
                                            <h2>แยกตามประเภทซอฟต์แวร์</h2>

                                            <p>
                                                TOR ที่เปิดรับจากหน่วยงานในกรุงเทพฯ
                                            </p>
                                        </div>

                                    </div>


                                    <div className="software-chart">

                                        <SoftwareBar
                                            name="Web App"
                                            value={7}
                                            max={7}
                                        />

                                        <SoftwareBar
                                            name="ERP"
                                            value={4}
                                            max={7}
                                        />

                                        <SoftwareBar
                                            name="Mobile"
                                            value={3}
                                            max={7}
                                        />

                                        <SoftwareBar
                                            name="Cloud"
                                            value={3}
                                            max={7}
                                        />

                                        <SoftwareBar
                                        name="Data/AI"
                                        value={3}
                                        max={7}
                                        />

                                        <SoftwareBar
                                            name="Cyber"
                                            value={2}
                                            max={7}
                                        />

                                        <SoftwareBar
                                            name="Network"
                                            value={2}
                                            max={7}
                                        />

                                    </div>

                                </div>

                            </div>


                            {/* TOR Detail Modal */}

                            {selectedTor && (
                                <TorDetailModal
                                    tor={selectedTor}
                                    onClose={() => setSelectedTor(null)}
                                />
                            )}
                        </div>
                    </header>
                </main>
            </div>
        </>
    );
}

function SoftwareBar({
    name,
    value,
    max,
}: {
    name: string;
    value: number;
    max: number;
}) {

    const width = `${(value / max) * 100}%`;

    return (
        <div className="software-row">

            <span className="software-name">
                {name}
            </span>

            <div className="software-track">
                <div
                    className="software-fill"
                    style={{ width }}
                />
            </div>

            <span className="software-value">
                {value}
            </span>

        </div>
    );
}

function ClosingItem({
    title,
    organization,
    match,
    days,
}: {
    title: string;
    organization: string;
    match: string;
    days: string;
}) {
    return (
        <div className="closing-item">

            <div className="closing-info">
                <div className="closing-title">
                    {title}
                </div>

                <div className="closing-organization">
                    {organization}
                </div>
            </div>

            <div className="closing-meta">
                <span className="closing-match">
                    {match}
                </span>

                <span className="closing-days">
                    {days}
                </span>
            </div>

        </div>
    );
}
