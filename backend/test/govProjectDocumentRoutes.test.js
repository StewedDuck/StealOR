const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("../src/routes/govProjectRoutes");

test("government project routes expose all three ZIP download endpoints", () => {
  const getPaths = router.stack
    .filter((layer) => layer.route?.methods?.get)
    .map((layer) => layer.route.path);

  assert.ok(getPaths.includes("/:projectId/document/download"));
  assert.ok(getPaths.includes("/:projectId/documents/invitation/download"));
  assert.ok(getPaths.includes("/:projectId/documents/draft-ebidding/download"));
});
