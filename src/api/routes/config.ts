/**
 * Config Routes - Configuration management endpoints
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
import { Router, Request, Response } from "express";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "../utils/response.js";
import {
  ConfigManager,
  validateUrl,
  validatePollingInterval,
} from "../../config/config-manager.js";

export interface ConfigResponse {
  webhookUrl: string;
  pollingInterval: number;
}

export interface ConfigUpdate {
  webhookUrl?: string;
  pollingInterval?: number;
}

export interface ConfigRouteDependencies {
  configManager: ConfigManager;
}

/**
 * Creates the config router with injected dependencies
 */
export function createConfigRouter(deps: ConfigRouteDependencies): Router {
  const router = Router();
  const { configManager } = deps;

  /**
   * GET /api/v1/config
   * Returns current webhook URL and polling interval
   * Requirements: 4.1
   */
  router.get("/", (_req: Request, res: Response) => {
    try {
      const config = configManager.getConfig();

      const response: ConfigResponse = {
        webhookUrl: config.webhookUrl,
        pollingInterval: config.pollingInterval,
      };

      res.json(successResponse(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  /**
   * PATCH /api/v1/config
   * Updates webhook URL and/or polling interval
   * Requirements: 4.2, 4.3, 4.4
   */
  router.patch("/", async (req: Request, res: Response) => {
    try {
      const update: ConfigUpdate = req.body;

      // Validate that at least one field is provided
      if (
        update.webhookUrl === undefined &&
        update.pollingInterval === undefined
      ) {
        res
          .status(400)
          .json(
            errorResponse(
              ErrorCode.VALIDATION_ERROR,
              "At least one of webhookUrl or pollingInterval must be provided"
            )
          );
        return;
      }

      // Validate webhookUrl if provided
      if (update.webhookUrl !== undefined) {
        const urlValidation = validateUrl(update.webhookUrl);
        if (!urlValidation.valid) {
          res
            .status(400)
            .json(
              errorResponse(
                ErrorCode.INVALID_URL,
                urlValidation.errors.join(", ")
              )
            );
          return;
        }
      }

      // Validate pollingInterval if provided
      if (update.pollingInterval !== undefined) {
        const intervalValidation = validatePollingInterval(
          update.pollingInterval
        );
        if (!intervalValidation.valid) {
          res
            .status(400)
            .json(
              errorResponse(
                ErrorCode.INVALID_INTERVAL,
                intervalValidation.errors.join(", ")
              )
            );
          return;
        }
      }

      // Apply updates
      if (update.webhookUrl !== undefined) {
        await configManager.setWebhookUrl(update.webhookUrl);
      }

      if (update.pollingInterval !== undefined) {
        await configManager.setPollingInterval(update.pollingInterval);
      }

      // Return updated config
      const config = configManager.getConfig();
      const response: ConfigResponse = {
        webhookUrl: config.webhookUrl,
        pollingInterval: config.pollingInterval,
      };

      res.json(successResponse(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  return router;
}
