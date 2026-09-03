"use client";

import {
    PieChart,
    Pie,
    Cell,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

const userDistributionData = [
    {
        name: "ผู้รับจ้าง",
        value: 201,
    },
    {
        name: "เจ้าของโครงการที่ยืนยันแล้ว",
        value: 44,
    },
    {
        name: "ผู้ดูแลระบบ",
        value: 3,
    },
];

const COLORS = [
    "#4E82BD",
    "#9FB8D3",
    "#26323D",
];


export default function UserDistributionChart() {
    return (
        <div className="admin-chart-card">
            <div className="chart-header">
                <div>
                    <h2>สัดส่วนผู้ใช้งาน</h2>
                    <p>จำนวนผู้ใช้งานแยกตามประเภทบัญชี</p>
                </div>
            </div>

            <div className="user-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={userDistributionData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            innerRadius={65}
                            outerRadius={100}
                            paddingAngle={3}
                            labelLine={false}
                        >
                            {userDistributionData.map((entry, index) => (
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
                </ResponsiveContainer>
            </div>
        </div>
    );
}