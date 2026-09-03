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

const matchRateData = [
    { month: "มี.ต.", rate: 68 },
    { month: "เม.ย.", rate: 72 },
    { month: "พ.ค.", rate: 76 },
    { month: "มิ.ย.", rate: 79 },
    { month: "ก.ค.", rate: 84 },
    { month: "ส.ค.", rate: 88 },
];

export default function MatchRateTrend() {
    return (
        <div className="dashboard-chart-card">

            {/* Header */}
            <div className="chart-header">
                <div>
                    <h2>แนวโน้มอัตราการจับคู่</h2>
                    <p>อัตราการจับคู่เฉลี่ย: 6 เดือนที่ผ่านมา</p>
                </div>

                <div className="chart-current-value">
                    <span>ปัจจุบัน</span>
                    <strong>88%</strong>
                </div>
            </div>

            {/* Chart */}
            <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={matchRateData}
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