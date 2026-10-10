export type DeadlineStatus = "open" | "closed" | "unknown";

export type DeadlineInfo = {
    status: DeadlineStatus;
    daysLeft: number | null;
    label: string | null;
};

export function getDeadlineInfo(
    deadline?: string | null,
    now: Date = new Date()
): DeadlineInfo {
    if (!deadline) {
        return {
        status: "unknown",
        daysLeft: null,
        label: null,
        };
    }

    const target = new Date(deadline);

    if (Number.isNaN(target.getTime())) {
        return {
        status: "unknown",
        daysLeft: null,
        label: null,
        };
    }

    const todayDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const deadlineDate = new Date(
        target.getFullYear(),
        target.getMonth(),
        target.getDate()
    );

    const todayUTC = Date.UTC(
        todayDate.getFullYear(),
        todayDate.getMonth(),
        todayDate.getDate()
    );

    const deadlineUTC = Date.UTC(
        deadlineDate.getFullYear(),
        deadlineDate.getMonth(),
        deadlineDate.getDate()
    );

    const daysLeft = Math.round(
        (deadlineUTC - todayUTC) / 86_400_000
    );

    if (daysLeft < 0) {
        return {
        status: "closed",
        daysLeft,
        label: "ปิดรับแล้ว",
        };
    }

    if (daysLeft === 0) {
        return {
        status: "open",
        daysLeft: 0,
        label: "ปิดวันนี้",
        };
    }

    return {
        status: "open",
        daysLeft,
        label: `${daysLeft} วันคงเหลือ`,
    };
}