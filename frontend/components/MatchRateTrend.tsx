"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

import type { MatchRatePoint } from '@/types/dashboard';

export default function MatchRateTrend({ data = [], currentRate = null }: { data?: MatchRatePoint[]; currentRate?: number | null }) {
    return (
        <div className="dashboard-chart-card">

            {/* Header */}
            <div className="chart-header">
                <div>
                    <h2>แนวโน้มอัตราการจับคู่</h2>
                    <p>สัดส่วน TOR คะแนนมากกว่า 39% เทียบกับ TOR ที่มีคะแนน</p>
                </div>

                <div className="chart-current-value">
                    <span>ปัจจุบัน</span>
                    <strong>{currentRate === null ? '—' : `${currentRate}%`}</strong>
                </div>
            </div>

            <p className="dashboard-chart-note">ค่าเฉลี่ยรายวันในแต่ละเดือน · เดือนที่ยังไม่มีประวัติจะเว้นว่าง</p>
            {/* Chart */}
            <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
                        margin={{
                        top: 10,
                        right: 10,
                        left: -10,
                        bottom: 5,
                        }}
                    >
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                        />

                        <XAxis
                            dataKey="month"
                            tick={{ fontSize: 12, fill: "#26323D" }}
                            tickLine={false}
                            axisLine={false}
                        />

                        <YAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 12, fill: "#26323D" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}%`}
                        />

                        <Tooltip
                            formatter={(value) => [`${value}%`, "อัตราการจับคู่"]}
                        />

                        <Line
                            type="monotone"
                            dataKey="rate"
                            connectNulls={false}
                            stroke="#4A6278"
                            strokeWidth={3}
                            dot={{
                                r: 4,
                                fill: "#FCFCFA",
                                stroke: "#4A6278",
                                strokeWidth: 2,
                            }}
                            activeDot={{
                                r: 6,
                            }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

        </div>
    );
}