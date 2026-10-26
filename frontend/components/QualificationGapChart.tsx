"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import type { QualificationGap } from '@/types/dashboard';

export default function QualificationGapChart({ data = [] }: { data?: QualificationGap[] }) {
  return (
    <div className="dashboard-chart-card">

        {/* Header */}
        <div className="chart-header">
            <div>
                <h2>การวิเคราะห์ช่องว่างคุณสมบัติ</h2>

                <p>
                    ข้อมูลหรือทักษะที่ยังยืนยันไม่ได้ แยกตามจำนวน TOR
                </p>
            </div>

            <span className="top-seven">
                Top 7
            </span>
        </div>

        {/* Chart */}
        <div className="chart-container qualification-chart">
            {data.length === 0 ? <p className="dashboard-empty">ยังไม่มีข้อมูลช่องว่างคุณสมบัติจากผลประเมิน</p> : <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                    top: 10,
                    right: 10,
                    left: -10,
                    bottom: 45,
                    }}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                    />

                    <XAxis
                        dataKey="qualification"
                        tickFormatter={(value: string) => value.length > 22 ? `${value.slice(0, 22)}…` : value}
                        tick={{ fontSize: 12, fill: "#26323D" }}
                        tickLine={false}
                        axisLine={false}
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                    />

                    <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#26323D" }}
                        tickLine={false}
                        axisLine={false}
                        label={{
                            value: "จำนวน TOR",
                            angle: -90,
                            position: "insideLeft",
                        }}
                    />

                    <Tooltip
                        formatter={(value) => [
                            value,
                            "TOR ที่ยังยืนยันข้อมูลนี้ไม่ได้",
                        ]}
                    />

                    <Bar
                        dataKey="missed"
                        fill="#97B8DE"
                        radius={[5, 5, 0, 0]}
                        barSize={38}
                    />
                </BarChart>
            </ResponsiveContainer>}
        </div>
    </div>
  );
}