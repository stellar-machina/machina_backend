import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import type { Request, Response, NextFunction } from "express";
import { rateLimitMiddleware } from "./index.js";
import {
  rateBuckets,
  RATE_LIMIT_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
} from "../store/state.js";

type Captured = {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
};

/** Builds a minimal Express req/res pair for driving the middleware directly. */
function invoke(ip: string): { nextCalled: boolean; captured: Captured } {
  const captured: Captured = { headers: {} };
  const req = {
    ip,
    socket: { remoteAddress: ip },
    id: "test-request-id",
  } as unknown as Request;
  const res = {
    setHeader(key: string, value: string) {
      captured.headers[key] = value;
    },
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;

  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  rateLimitMiddleware(req, res, next);
  return { nextCalled, captured };
}

void describe("rateLimitMiddleware sliding window", () => {
  const originalEnv = process.env.NODE_ENV;
  const realNow = Date.now;
  let clock = 1_000_000;

  beforeEach(() => {
    rateBuckets.clear();
    // The middleware short-circuits when NODE_ENV === "test"; switch it off so
    // the real limiting logic runs under assertion.
    process.env.NODE_ENV = "development";
    clock = 1_000_000;
    Date.now = () => clock;
  });

  afterEach(() => {
    Date.now = realNow;
    process.env.NODE_ENV = originalEnv;
    rateBuckets.clear();
  });

  void it("allows requests up to the per-window limit", () => {
    for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) {
      const { nextCalled, captured } = invoke("1.1.1.1");
      assert.strictEqual(nextCalled, true, `request ${i + 1} should be allowed`);
      assert.strictEqual(captured.statusCode, undefined);
    }
  });

  void it("blocks the request past the limit with 429 and Retry-After", () => {
    for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) invoke("2.2.2.2");

    const { nextCalled, captured } = invoke("2.2.2.2");
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(captured.statusCode, 429);
    assert.strictEqual(captured.headers["Retry-After"], "60");
    assert.strictEqual((captured.body as { error?: string }).error, "rate_limited");
  });

  void it("allows requests again once the window has elapsed", () => {
    for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) invoke("3.3.3.3");
    // Still blocked while inside the window.
    assert.strictEqual(invoke("3.3.3.3").nextCalled, false);

    // Advance past the window so the old timestamps are pruned.
    clock += RATE_LIMIT_WINDOW_MS + 1;
    assert.strictEqual(invoke("3.3.3.3").nextCalled, true);
  });

  void it("tracks callers independently", () => {
    for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) invoke("4.4.4.4");
    // Caller A is now over the limit.
    assert.strictEqual(invoke("4.4.4.4").nextCalled, false);
    // Caller B is unaffected.
    assert.strictEqual(invoke("5.5.5.5").nextCalled, true);
  });
});
