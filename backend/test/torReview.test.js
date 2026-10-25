const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

// จำลองฐานข้อมูลเพื่อทดสอบสิทธิ์และเงื่อนไข atomic โดยไม่แก้ข้อมูลจริง
function setup() {
  const state = { current: { _id: "507f1f77bcf86cd799439011", status: "draft" }, updated: { _id: "tor" }, owner: { email: "owner@example.com" }, calls: [] };
  const model = {
    findOne(query) { state.read = query; return { lean: async () => state.current }; },
    async findOneAndUpdate(...args) { state.calls.push(args); return state.updated; },
  };
  function load(name) {
    const mod = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/controllers", name), "utf8"), {
      module: mod, console,
      require(dep) {
        if (dep === "mongoose") return require("mongoose");
        if (dep === "../models/Tor") return model;
        if (dep === "../models/User") return {
          findOne(query) { state.ownerQuery = query; return { lean: async () => state.owner }; },
        };
        if (dep === "./torReviewController") return review;
        if (dep === "../models/Bookmark") return { find: () => ({ lean: async () => [] }) };
        return {};
      },
    });
    return mod.exports;
  }
  const review = load("torReviewController.js");
  const owner = load("torController.js");
  const req = { params: { id: "507f1f77bcf86cd799439011" }, ownerId: "owner@example.com", adminEmail: "admin@example.com", body: {} };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { state, review, owner, req, res };
}

test("ส่งร่างเดิมตรวจโดยใช้เลขฉบับ 1 และจำกัดเจ้าของ", async () => {
  const {state, review, req, res} = setup();
  await review.submitTorReview(req, res);
  assert.equal(res.code, 200);
  assert.equal(state.read.ownerId, req.ownerId);
  assert.equal(state.calls[0][0].ownerId, req.ownerId);
  assert.equal(state.calls[0][1].$set.reviewStatus, "pending");
  assert.equal(state.calls[0][1].$set.submittedVersion, 1);
  assert.ok(state.calls[0][0].$and);
});

test("ขอแก้ไขต้องมีเหตุผลและเลขฉบับ", async () => {
  const {state, review, req, res} = setup();
  req.body = {decision: "changes_requested", version: 1, comment: "  "};
  await review.reviewTor(req, res);
  assert.equal(res.code, 400);
  assert.equal(state.calls.length, 0);
});

test("อนุมัติเฉพาะร่าง pending ฉบับเดียวกับที่อ่านและเก็บตัวตนแอดมิน", async () => {
  const {state, review, req, res} = setup();
  req.body = {decision: "approved", version: 2, comment: " OK "};
  await review.reviewTor(req, res);
  const [filter, update] = state.calls[0];
  assert.equal(filter.status, "draft");
  assert.equal(filter.reviewStatus, "pending");
  assert.equal(filter.contentVersion, 2);
  assert.equal(filter.submittedVersion, 2);
  assert.equal(update.$push.reviewHistory.reviewedBy, req.adminEmail);
  assert.equal(update.$push.reviewHistory.comment, "OK");
});

test("ตรวจรายการที่เปลี่ยนแล้วคืน conflict", async () => {
  const {state, review, req, res} = setup();
  state.updated = null;
  req.body = {decision: "approved", version: 1};
  await review.reviewTor(req, res);
  assert.equal(res.code, 409);
});

test("ร่างรอตรวจแก้ไขไม่ได้", async () => {
  const {state, owner, req, res} = setup();
  state.current.reviewStatus = "pending";
  await owner.updateTor(req, res);
  assert.equal(res.code, 409);
  assert.equal(state.calls.length, 0);
});

test("แก้ไขหลังอนุมัติล้างการอนุมัติและเพิ่มเลขฉบับ ไม่ให้ body ปลอมสถานะ", async () => {
  const {state, owner, req, res} = setup();
  state.current.reviewStatus = "approved";
  state.current.contentVersion = 2;
  req.body = {projectName: "Changed", reviewStatus: "approved", contentVersion: 99};
  await owner.updateTor(req, res);
  const [filter, update] = state.calls[0];
  assert.equal(filter.contentVersion, 2);
  assert.equal(update.$set.contentVersion, 3);
  assert.equal(update.$set.reviewStatus, "not_submitted");
  assert.equal(update.$set.submittedVersion, null);
  assert.equal(update.$push, undefined);
});

test("เผยแพร่ต้องอนุมัติฉบับปัจจุบัน รวมถึงร่างเก่าที่ไม่มี approval", async () => {
  const {state, owner, req, res} = setup();
  req.body = {applicationDeadline: "2099-01-01T00:00:00Z"};
  state.updated = null;
  await owner.publishTor(req, res);
  const filter = state.calls[0][0];
  assert.equal(filter.ownerId, req.ownerId);
  assert.equal(filter.reviewStatus, "approved");
  assert.equal(filter.submittedVersion.$ne, null);
  assert.equal(JSON.stringify(filter.$expr), JSON.stringify({$eq: ["$contentVersion", "$submittedVersion"]}));
  assert.equal(res.code, 409);
});

test("ขอแก้ไขแล้วส่งฉบับเดิมซ้ำไม่ได้", async () => {
  const {state, review, req, res} = setup();
  state.current.reviewStatus = "changes_requested";
  await review.submitTorReview(req, res);
  assert.equal(res.code, 409);
  assert.equal(state.calls.length, 0);
});

test("บันทึกเนื้อหาเดิมไม่เพิ่มฉบับหรือปลดล็อกส่งตรวจ", async () => {
  const {state, owner, req, res} = setup();
  state.current.reviewStatus = "changes_requested";
  state.current.projectName = "Same";
  req.body = {projectName: "Same"};
  await owner.updateTor(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.data.reviewStatus, "changes_requested");
  assert.equal(state.calls.length, 0);
});

test("แก้ไขจริงหลังขอแก้ไขแล้วกลับเป็นยังไม่ส่งตรวจ", async () => {
  const {state, owner, req, res} = setup();
  state.current.reviewStatus = "changes_requested";
  state.current.contentVersion = 2;
  state.current.projectName = "Old";
  req.body = {projectName: "Revised"};
  await owner.updateTor(req, res);
  assert.equal(res.code, 200);
  assert.equal(state.calls[0][1].$set.contentVersion, 3);
  assert.equal(state.calls[0][1].$set.reviewStatus, "not_submitted");
});


test("บัญชีที่ยังไม่ยืนยันตัวตนเผยแพร่ TOR ไม่ได้", async () => {
  const {state, owner, req, res} = setup();
  state.owner = null;
  req.body = {applicationDeadline: "2099-01-01T00:00:00Z"};
  await owner.publishTor(req, res);
  assert.equal(res.code, 403);
  assert.equal(state.calls.length, 0);
  assert.equal(state.ownerQuery.email, req.ownerId);
  assert.equal(state.ownerQuery.accountRole, "project_owner");
  assert.equal(state.ownerQuery.verificationStatus, "approved");
});
