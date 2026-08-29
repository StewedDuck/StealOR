import React from "react";

type SummaryCardProps = {
  icon: React.ReactNode;
  title: string;
  value: string;
  footer: string;
  footerType?: "success" | "warning" | "normal";
};

export default function SummaryCard({
  icon,
  title,
  value,
  footer,
  footerType = "normal",
}: SummaryCardProps) {
  return (
    <div className="summary-card">
      <div className="summary-title">
        <span className="summary-icon">{icon}</span>
        <span>{title}</span>
      </div>

      <div className="summary-value">{value}</div>

      <div className={`summary-footer ${footerType}`}>
        {footer}
      </div>
    </div>
  );
}