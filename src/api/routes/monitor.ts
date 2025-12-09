/**
 * Monitor Control Routes - POST /api/v1/monitor/start, POST /api/v1/monitor/stop
 * Controls the monitoring service start/stop
 * Requirements: 5.1, 5.2
 */
import { Router, Request, Response } from "express";
import { successResponse } from "../utils/response.js";
import { PollingScheduler } from "../../scheduler/polling-scheduler.js";

export interface MonitorRouteDependencies {
  scheduler: PollingScheduler;
}

/**
 * Creates the monitor control router with injected dependencies
 */
export function createMonitorRouter(deps: MonitorRouteDependencies): Router {
  const router = Router();
  const { scheduler } = deps;

  /**
   * POST /api/v1/monitor/start
   * Starts the monitoring service
   * Requirements: 5.1
   */
  router.post("/start", (_req: Request, res: Response) => {
    const wasRunning = scheduler.isRunning();

    if (!wasRunning) {
      scheduler.start();
    }

    res.json(
      successResponse({
        monitoring: "running",
        message: wasRunning
          ? "Monitoring was already running"
          : "Monitoring started",
      })
    );
  });

  /**
   * POST /api/v1/monitor/stop
   * Stops the monitoring service
   * Requirements: 5.2
   */
  router.post("/stop", (_req: Request, res: Response) => {
    const wasRunning = scheduler.isRunning();

    if (wasRunning) {
      scheduler.stop();
    }

    res.json(
      successResponse({
        monitoring: "stopped",
        message: wasRunning
          ? "Monitoring stopped"
          : "Monitoring was already stopped",
      })
    );
  });

  return router;
}
