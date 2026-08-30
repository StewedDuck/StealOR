"use client";

import Yandex from "next-auth/providers/yandex";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

const torMonthlyData = [
    {
        month: "มี.ค.",
        published: 8,
        draft: 2,
    },
    {
        month: "เม.ย.",
        published: 10,
        draft: 3,
    },
    {
        month: "พ.ค.",
        published: 12,
        draft: 2,
    },
    {
        month: "มิ.ย.",
        published: 14,
        draft: 4,
    },
    {
        month: "ก.ค.",
        published: 15,
        draft: 3,
    },
    {
        month: "ส.ค.",
        published: 16,
        draft: 3,
    },
];


export default function TorVolumeChart() {
    return (
        <div className="admin-chart-card">
            <div className="chart-header">
                <div>
                    <h2>ปริมาณ TOR รายเดือน</h2>
                    <p>จำนวน TOR ที่ประกาศแล้วและร่างย้อนหลัง 6 เดือน</p>
                </div>
            </div>

            <div className="admin-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={torMonthlyData}
                        margin={{
                            top: 10,
                            right: 20,
                            left: 0,
                            bottom: 0,
                        }}
                    >
                        <CartesianGrid
                            strokeDasharray= '3 3'
                            vertical={false}
                        />

                        <XAxis
                            dataKey="month"
                            tick={{
                                fontSize: 12,
                                fill: "#26323D",
                            }}
                            tickLine={false}
                            axisLine={false}
                        />

                        <YAxis
                            allowDecimals={false}
                            tick={{
                                fontSize: 12,
                                fill: "#26323D",
                            }}
                            tickLine={false}
                            axisLine={false}
                        />

                        <Tooltip />
                        <Legend />

                        {/* ประกาศแล้ว */}
                        <Line
                            type="monotone"
                            dataKey="published"
                            name="ประกาศแล้ว"
                            stroke="#3E5A7D"
                            strokeWidth={3}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                        />

                        {/* ร่าง */}
                        <Line
                            type="monotone"
                            dataKey="draft"
                            name="ร่าง"
                            stroke="#97B8DE"
                            strokeWidth={3}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}