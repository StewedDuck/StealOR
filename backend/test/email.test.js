const test = require("node:test");
const assert = require("node:assert/strict");

const {
    newMatch,
    deadlineReminder,
    draftPublished,
    draftUpdated,
} = require("../src/email/Contractor");

const { sendEmail } = require("../src/email/Mailer");

const mockTOR = {
    name: "Test User",
    torTitle: "Website Development",
    agencyName: "Bangkok Office",
    scope: "Develop a website",
    matchPercent: 90,
    closeDate: "2026-10-22",
    torUrl: "http://localhost:3000/contractor/saved",
    daysLeft: 5,
};

test("Email Templates", async (t) => {

    await t.test("should generate a new match email", () => {
        const email = newMatch(mockTOR);

        assert.ok(email.subject);
        assert.ok(email.text);
        assert.match(email.subject, /Website Development/);
        assert.match(email.text, /90%/);
    });

    await t.test("should generate a 5-day deadline reminder", () => {
        const email = deadlineReminder(mockTOR);

        assert.match(email.subject, /5 วัน/);
        assert.match(email.text, /Website Development/);
        assert.ok(email.html);
    });

    await t.test("should generate a 1-day deadline reminder", () => {
        const email = deadlineReminder({
            ...mockTOR,
            daysLeft: 1,
        });

        assert.match(email.subject, /1 วัน/);
        assert.match(email.html, /Website Development/);
    });

    await t.test("should include agency name in HTML", () => {
        const email = deadlineReminder(mockTOR);

        assert.match(email.html, /Bangkok Office/);
    });

    await t.test("should include TOR link in HTML", () => {
        const email = deadlineReminder(mockTOR);

        assert.match(
            email.html,
            /http:\/\/localhost:3000\/contractor\/saved/
        );
    });

    await t.test("should use sTealORs HTML design", () => {
        const email = deadlineReminder(mockTOR);

        assert.match(email.html, /sTealORs/);
        assert.match(email.html, /#1F2933/i);
        assert.match(email.html, /#FCFCFA/i);
    });

    await t.test("should generate a draft updated email", () => {
        const email = draftUpdated(mockTOR);

        assert.match(email.subject, /Website Development/);
        assert.ok(email.text);
        assert.ok(email.html);
    });

    await t.test("should generate a draft published email", () => {
        const email = draftPublished(mockTOR);

        assert.ok(email.subject);
        assert.ok(email.text);
    });
});

test("Email Validation", async (t) => {

    await t.test("should reject email without recipient", async () => {
        await assert.rejects(
            sendEmail({
                to: "",
                subject: "Test Email",
                text: "Hello",
            }),
            /Email recipient is required/
        );
    });

    await t.test("should generate email with missing agency", () => {
        const email = deadlineReminder({
            ...mockTOR,
            agencyName: undefined,
        });

        assert.match(email.html, /ไม่ระบุหน่วยงาน/);
    });
});