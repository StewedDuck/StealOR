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

const qualificationGapData = [
  {
    qualification: "ISO 27001",
    missed: 5,
  },
  {
    qualification: "HL7/FHIR",
    missed: 3,
  },
  {
    qualification: "AWS",
    missed: 3,
  },
  {
    qualification: "Python",
    missed: 2,
  },
  {
    qualification: "Docker",
    missed: 2,
  },
  {
    qualification: "Kubernetes",
    missed: 1,
  },
  {
    qualification: "React",
    missed: 1,
  },
];

export default function QualificationGapChart() {
  return (
    <div className="dashboard-chart-card">

        {/* Header */}
        <div className="chart-header">
            <div>
                <h2>การวิเคราะห์ช่องว่างคุณสมบัติ</h2>

                <p>
                    คุณสมบัติที่ทำให้คุณพลาดเกณฑ์ TOR
                </p>
            </div>

            <span className="top-seven">
                Top 7
            </span>
        </div>

        {/* Chart */}
        <div className="chart-container qualification-chart">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={qualificationGapData}
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
                            value: "TORs Missed",
                            angle: -90,
                            position: "insideLeft",
                        }}
                    />

                    <Tooltip
                        formatter={(value) => [
                            value,
                            "TORs missed",
                        ]}
                    />

                    <Bar
                        dataKey="missed"
                        fill="#97B8DE"
                        radius={[5, 5, 0, 0]}
                        barSize={38}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
}