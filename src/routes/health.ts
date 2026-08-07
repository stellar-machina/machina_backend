import { Router, type Request, type Response } from "express";
import { pauseState } from "../store/state.js";

/**
 * Liveness and readiness probes for orchestrators (Docker, Kubernetes, load
 * balancers).
 *
 * These routes are intentionally registered before the request-state middleware
 * so they are exempt from authentication and rate limiting, and they perform no
 * dependency work beyond a readiness/pause check:
 *
 *   - `GET /livez`  — the process is up and able to serve. Always 200 unless the
 *     process itself is unresponsive (in which case nothing answers).
 *   - `GET /readyz` — whether the service should receive traffic right now.
 *     Returns 503 while the backend is paused, 200 otherwise.
 */
export function createHealthRouter(): Router {
  const router = Router();

  router.get("/livez", (_req: Request, res: Response) => {
    res.json({ status: "alive" });
  });

  router.get("/readyz", (_req: Request, res: Response) => {
    if (pauseState.paused) {
      res.status(503).json({ status: "unavailable", reason: "paused" });
      return;
    }
    res.json({ status: "ready" });
  });

  return router;
}
