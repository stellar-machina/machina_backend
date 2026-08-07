import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import request from "supertest";
import { app } from "./index.js";
import { pauseState } from "./store/state.js";

void describe("liveness and readiness probes", () => {
  afterEach(() => {
    pauseState.paused = false;
  });

  void it("GET /livez returns 200 and status alive", async () => {
    const res = await request(app).get("/livez");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body?.status, "alive");
  });

  void it("GET /readyz returns 200 and status ready when not paused", async () => {
    pauseState.paused = false;
    const res = await request(app).get("/readyz");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body?.status, "ready");
  });

  void it("GET /readyz returns 503 with reason paused while paused", async () => {
    pauseState.paused = true;
    const res = await request(app).get("/readyz");
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.body?.status, "unavailable");
    assert.strictEqual(res.body?.reason, "paused");
  });
});
