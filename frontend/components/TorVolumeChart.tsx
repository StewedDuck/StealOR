"use client";

import type { TorMonth } from "@/types/adminDashboard";
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

export default function TorVolumeChart({ data }: { data: TorMonth[] }) {
    return (
        <div className="admin-chart-card">
            <div className="chart-header">
                <div>
                    <h2>ปริมาณ TOR รายเดือน</h2>
                    <p>TOR ที่สร้างในแต่ละเดือน แยกตามสถานะปัจจุบัน · 6 เดือนล่าสุด </p>
                </div>
            </div>

            <div className="admin-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={data}
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

                        <Line type="monotone" dataKey="pending" name="รอเผยแพร่ / ยืนยัน" stroke="#C28B36" strokeWidth={3} />
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