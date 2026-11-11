"use client";

import type { UserDistribution } from "@/types/adminDashboard";

import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

const COLORS = [
    "#4E82BD",
    "#9FB8D3",
    "#26323D",
];


export default function UserDistributionChart({ data }: { data: UserDistribution[] }) {
    return (
        <div className="admin-chart-card">
            <div className="chart-header">
                <div>
                    <h2>สัดส่วนผู้ใช้งาน</h2>
                    <p>จำนวนผู้ใช้งานแยกตามประเภทบัญชี</p>
                </div>
            </div>

            <div className="user-chart-container">
                {data.every(row => row.value === 0) ? <p>ยังไม่มีบัญชีผู้ใช้</p> : <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            innerRadius={65}
                            outerRadius={100}
                            paddingAngle={3}
                            labelLine={false}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={COLORS[index]}
                                />
                            ))}
                        </Pie>

                        <Tooltip />

                        <Legend
                            verticalAlign="bottom"
                            height={50}
                        />
                    </PieChart>
                </ResponsiveContainer>}
            </div>
        </div>
    );
}