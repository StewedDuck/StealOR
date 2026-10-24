const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// จำลองฐานข้อมูลเพื่อทดสอบเส้นทางรับและส่งข้อมูล โดยไม่เขียนข้อมูลจริง
function setup() {
  let saved;
  const torModel = {
    create: async (data) => { saved = { _id: "tor-id", ...data }; return saved; },
    findOne: async () => saved,
    findOneAndUpdate: async (_query, update) => { saved = { ...saved, ...update.$set }; return saved; },
  };
  const moduleStub = { exports: {} };
  const controller = path.join(process.cwd(), "src/controllers/torController.js");
  vm.runInNewContext(fs.readFileSync(controller, "utf8"), {
    module: moduleStub, console,
    require: (name) => {
      if (name === "mongoose") return require("mongoose");
      if (name === "../models/Tor") return torModel;
      if (name === "../models/Bookmark") return { find: () => ({ lean: async () => [] }) };
      return {};
    },
  });
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; },
  });
  return { api: moduleStub.exports, response };
}

test("เก็บข้อมูลรายละเอียดใหม่และส่งกลับในรายละเอียดตลาด TOR", async () => {
  const { api, response } = setup();
  const created = response();
  await api.createTor({ ownerId: "owner@example.com", body: {
    projectName: "Test", agencyName: "Agency",
    requirements: [
      { category: "generalLegal", description: "  Legal  ", weight: 80, mandatory: true },
      { category: "projectSpecific", description: "Experience", weight: 10, mandatory: false },
      { category: "technicalRequirements", description: "Technical", weight: 0, mandatory: true },
      { category: "deliverables", description: "Delivery", weight: 10, mandatory: false },
    ],
    // ฟิลด์ที่เลิกใช้ต้องไม่ถูกบันทึก แม้ client ยังส่งมา
    contractorQualifications: { generalLegal: ["Ignore"] },
    technicalRequirements: ["Ignore"], deliverables: ["Ignore"],
    referencePriceEstimate: 500,
    status: "published", ownerId: "another@example.com",
  } }, created);
  assert.equal(created.statusCode, 201);
  for (const field of ["contractorQualifications", "technicalRequirements", "deliverables"]) {
    assert.equal(Object.hasOwn(created.body.data, field), false);
  }
  assert.equal(created.body.data.requirements[0].description, "Legal");
  assert.deepEqual(created.body.data.requirements.map((item) => item.category),
    ["generalLegal", "projectSpecific", "technicalRequirements", "deliverables"]);
  assert.equal(created.body.data.status, "draft");
  assert.equal(created.body.data.ownerId, "owner@example.com");
  const detail = response();
  await api.getMarketTorDetail({ params: { projectId: "507f1f77bcf86cd799439011" } }, detail);
  assert.equal(detail.body.data.requirements[2].description, "Technical");
  assert.equal(detail.body.data.requirements[3].description, "Delivery");
  assert.equal(detail.body.data.referencePriceEstimate, 500);
});

test("ปฏิเสธข้อมูลรายการและราคากลางที่ผิดรูปแบบ", async () => {
  for (const body of [{ requirements: "wrong" }, { referencePriceEstimate: -1 },
    { requirements: [{ description: "X", category: "invalid" }] },
    { requirements: [{ description: "X", weight: 101 }] },
    { requirements: [{ description: "X", mandatory: "false" }] }]) {
    const { api, response } = setup();
    const res = response();
    await api.createTor({ body, ownerId: "owner@example.com" }, res);
    assert.equal(res.statusCode, 400);
  }
});

test("ร่างเก่าที่ไม่มีฟิลด์ใหม่ยังสร้างได้", async () => {
  const { api, response } = setup();
  const res = response();
  await api.createTor({ body: { projectName: "Old", agencyName: "Agency" }, ownerId: "owner@example.com" }, res);
  assert.equal(res.statusCode, 201);
});

// ทดสอบแก้ไขและลบรายการ โดยไม่สร้างช่องแยกกลับมา
test("แก้ไขและลบรายการโดยรักษาคะแนนกับข้อบังคับ", async () => {
  const { api, response } = setup();
  await api.createTor({ ownerId: "owner@example.com", body: {
    projectName: "Test", agencyName: "Agency", requirements: [{ description: "Old" }],
  } }, response());
  const res = response();
  await api.updateTor({ ownerId: "owner@example.com", params: { id: "507f1f77bcf86cd799439011" }, body: {
    requirements: [{ category: "deliverables", description: "New", weight: 40, mandatory: true }],
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.requirements, [{ category: "deliverables", description: "New", weight: 40, mandatory: true }]);
  for (const field of ["contractorQualifications", "technicalRequirements", "deliverables"]) {
    assert.equal(Object.hasOwn(res.body.data, field), false);
  }
  const removed = response();
  await api.updateTor({ ownerId: "owner@example.com", params: { id: "507f1f77bcf86cd799439011" }, body: { requirements: [] } }, removed);
  assert.deepEqual(removed.body.data.requirements, []);
});

// ตรวจ model จริงด้วยโดยไม่เชื่อม MongoDB เพื่อยืนยันว่า default ไม่สร้างช่องเก่า
test("schema ไม่สร้างสามฟิลด์ที่เลิกใช้ และยังเก็บราคากลาง", () => {
  const Tor = require(path.join(process.cwd(), "src/models/Tor"));
  const document = new Tor({ ownerId: "owner@example.com", projectName: "Test", agencyName: "Agency", referencePriceEstimate: 500,
    requirements: [{ description: "Tech", category: "technicalRequirements", weight: 10, mandatory: true }],
    technicalRequirements: ["Ignore"], deliverables: ["Ignore"], contractorQualifications: { generalLegal: ["Ignore"] },
  });
  assert.equal(document.validateSync(), undefined);
  const data = document.toObject();
  for (const field of ["contractorQualifications", "technicalRequirements", "deliverables"]) {
    assert.equal(Object.hasOwn(data, field), false);
  }
  assert.equal(data.referencePriceEstimate, 500);
  assert.equal(data.requirements[0].category, "technicalRequirements");
});
