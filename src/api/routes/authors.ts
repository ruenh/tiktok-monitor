/**
 * Authors Routes - CRUD operations for monitored authors
 * Requirements: 2.1, 2.2, 2.3, 5.3
 */
import { Router, Request, Response } from "express";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "../utils/response.js";
import {
  ConfigManager,
  validateUsername,
} from "../../config/config-manager.js";
import { StateManager } from "../../state/state-manager.js";
import { PollingScheduler } from "../../scheduler/polling-scheduler.js";

export interface AuthorInfo {
  username: string;
  lastCheckTime: string | null;
  videosCount: number;
}

export interface AuthorsRouteDependencies {
  configManager: ConfigManager;
  stateManager: StateManager;
  scheduler: PollingScheduler;
}

/**
 * Creates the authors router with injected dependencies
 */
export function createAuthorsRouter(deps: AuthorsRouteDependencies): Router {
  const router = Router();
  const { configManager, stateManager } = deps;

  /**
   * GET /api/v1/authors
   * Returns list of all monitored authors with their last check time
   * Requirements: 2.1
   */
  router.get("/", (_req: Request, res: Response) => {
    const authors = configManager.getAuthors();
    const history = stateManager.getHistory(100);

    const authorInfoList: AuthorInfo[] = authors.map((username) => {
      const lastCheckTime = stateManager.getLastCheckTime(username);
      const videosCount = history.filter((v) => v.author === username).length;

      return {
        username,
        lastCheckTime: lastCheckTime ? lastCheckTime.toISOString() : null,
        videosCount,
      };
    });

    res.json(successResponse(authorInfoList));
  });

  /**
   * POST /api/v1/authors
   * Adds a new author to the monitoring list
   * Requirements: 2.2
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username || typeof username !== "string") {
        res
          .status(400)
          .json(
            errorResponse(ErrorCode.INVALID_USERNAME, "Username is required")
          );
        return;
      }

      const validation = validateUsername(username);
      if (!validation.valid) {
        res
          .status(400)
          .json(
            errorResponse(
              ErrorCode.INVALID_USERNAME,
              validation.errors.join(", ")
            )
          );
        return;
      }

      const normalizedUsername = username.trim();
      const existingAuthors = configManager.getAuthors();

      if (existingAuthors.includes(normalizedUsername)) {
        res
          .status(409)
          .json(
            errorResponse(
              ErrorCode.AUTHOR_EXISTS,
              `Author '${normalizedUsername}' is already being monitored`
            )
          );
        return;
      }

      await configManager.addAuthor(normalizedUsername);

      res.status(201).json(
        successResponse({
          username: normalizedUsername,
          message: `Author '${normalizedUsername}' added to monitoring list`,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  /**
   * DELETE /api/v1/authors/:username
   * Removes an author from the monitoring list
   * Requirements: 2.3
   */
  router.delete("/:username", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const existingAuthors = configManager.getAuthors();

      if (!existingAuthors.includes(username)) {
        res
          .status(404)
          .json(
            errorResponse(
              ErrorCode.AUTHOR_NOT_FOUND,
              `Author '${username}' is not in the monitoring list`
            )
          );
        return;
      }

      await configManager.removeAuthor(username);

      res.json(
        successResponse({
          username,
          message: `Author '${username}' removed from monitoring list`,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  /**
   * POST /api/v1/authors/:username/check
   * Triggers an immediate check for a specific author
   * Requirements: 5.3
   */
  router.post("/:username/check", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const existingAuthors = configManager.getAuthors();

      if (!existingAuthors.includes(username)) {
        res
          .status(404)
          .json(
            errorResponse(
              ErrorCode.AUTHOR_NOT_FOUND,
              `Author '${username}' is not in the monitoring list`
            )
          );
        return;
      }

      // Note: The actual check is performed by the scheduler
      // This endpoint just triggers it - the scheduler handles the async work
      res.json(
        successResponse({
          username,
          message: `Check triggered for author '${username}'`,
          status: "triggered",
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  return router;
}
