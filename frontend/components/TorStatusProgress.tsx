import "./TorStatusProgress.css";

type TorStatus = "draft" | "open" | "closed" | "unknown";

type Props = {
    status: TorStatus;
};

const steps = [
    { key: "draft", label: "Draft", description: "ฉบับร่าง" },
    { key: "open", label: "Open", description: "เปิดรับข้อเสนอ" },
    { key: "closed", label: "Closed", description: "ปิดรับข้อเสนอ" },
] as const;

export default function TorStatusProgress({ status }: Props) {
    const currentIndex = steps.findIndex((step) => step.key === status);

    return (
        <section className="tor-progress">
            <div className="tor-progress-header">
                <h3>TOR Status</h3>
                <span className={`tor-progress-status tor-progress-status-${status}`}>
                    {status === "unknown" ? "Unknown" : steps[currentIndex].label}
                </span>
            </div>

            <div className="tor-progress-steps">
                {steps.map((step, index) => {
                    const completed = currentIndex >= 0 && index < currentIndex;
                    const current = index === currentIndex;

                    return (
                        <div
                            key={step.key}
                            className={`tor-progress-step tor-progress-${step.key} ${
                                completed ? "completed" : ""
                            } ${current ? "current" : ""}`}
                            aria-current={current ? "step" : undefined}
                        >
                            <div className="tor-progress-node">
                                {completed ? "✓" : current ? "●" : ""}
                            </div>

                            <strong>{step.label}</strong>
                            <small>{step.description}</small>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}