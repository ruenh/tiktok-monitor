/**
 * Logs Routes - Log viewing endpoints
 * Requirements: 6.1, 6.3
 */
import { Router, Request, Response } from "express";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "../utils/response.js";
import { Logger, LogLevel, LogEntry } from "../services/logger.js";

export interface LogsRouteDependencies {
  logger: Logger;
}

// Valid log levels for filtering
const VALID_LOG_LEVELS: LogLevel[] = ["info", "warn", "error"];

/**
 * Creates the logs router with injected dependencies
 */
export function createLogsRouter(deps: LogsRouteDependencies): Router {
  const router = Router();
  const { logger } = deps;

  /**
   * GET /api/v1/logs
   * Returns log entries, optionally filtered by level
   * Query params:
   *   - level: "info" | "warn" | "error" (optional)
   * Requirements: 6.1, 6.3
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      const levelParam = req.query.level as string | undefined;

      // Validate level parameter if provided
      if (levelParam !== undefined) {
        if (!VALID_LOG_LEVELS.includes(levelParam as LogLevel)) {
          res
            .status(400)
            .json(
              errorResponse(
                ErrorCode.VALIDATION_ERROR,
                `Invalid log level. Must be one of: ${VALID_LOG_LEVELS.join(
                  ", "
                )}`
              )
            );
          return;
        }
      }

      const level = levelParam as LogLevel | undefined;
      const entries: LogEntry[] = logger.getEntries(level);

      res.json(successResponse(entries));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  return router;
}

export type { LogEntry, LogLevel };
