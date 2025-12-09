/**
 * Status Route - GET /api/v1/status
 * Returns monitoring status, authors count, videos today
 * Requirements: 1.1, 1.2, 1.3
 */
import { Router, Request, Response } from "express";
import { successResponse } from "../utils/response.js";
import { ConfigManager } from "../../config/config-manager.js";
import { StateManager } from "../../state/state-manager.js";
import { PollingScheduler } from "../../scheduler/polling-scheduler.js";

export interface DashboardStatus {
  monitoring: "running" | "stopped";
  authorsCount: number;
  videosToday: number;
  lastCheck: string | null;
}

export interface StatusRouteDependencies {
  configManager: ConfigManager;
  stateManager: StateManager;
  scheduler: PollingScheduler;
}

/**
 * Creates the status router with injected dependencies
 */
export function createStatusRouter(deps: StatusRouteDependencies): Router {
  const router = Router();
  const { configManager, stateManager, scheduler } = deps;

  /**
   * GET /api/v1/status
   * Returns current monitoring status
   * Requirements: 1.1, 1.2, 1.3
   */
  router.get("/", (_req: Request, res: Response) => {
    const authors = configManager.getAuthors();
    const isRunning = scheduler.isRunning();

    // Count videos processed today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const history = stateManager.getHistory(100);
    const videosToday = history.filter((video) => {
      const processedDate = new Date(video.processedAt);
      return processedDate >= today;
    }).length;

    // Get the most recent last check time across all authors
    let lastCheck: string | null = null;
    for (const author of authors) {
      const checkTime = stateManager.getLastCheckTime(author);
      if (checkTime) {
        if (!lastCheck || checkTime.toISOString() > lastCheck) {
          lastCheck = checkTime.toISOString();
        }
      }
    }

    const status: DashboardStatus = {
      monitoring: isRunning ? "running" : "stopped",
      authorsCount: authors.length,
      videosToday,
      lastCheck,
    };

    res.json(successResponse(status));
  });

  return router;
}
