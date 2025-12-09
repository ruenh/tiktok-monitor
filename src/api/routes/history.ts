/**
 * History Routes - Video processing history with pagination and filters
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
import { Router, Request, Response } from "express";
import {
  successResponse,
  errorResponse,
  ErrorCode,
} from "../utils/response.js";
import { StateManager, ProcessedVideo } from "../../state/state-manager.js";

export interface VideoHistoryItem {
  videoId: string;
  author: string;
  processedAt: string;
  webhookStatus: "pending" | "sent" | "failed";
  retryCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HistoryRouteDependencies {
  stateManager: StateManager;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Creates the history router with injected dependencies
 */
export function createHistoryRouter(deps: HistoryRouteDependencies): Router {
  const router = Router();
  const { stateManager } = deps;

  /**
   * GET /api/v1/history
   * Returns paginated video history with optional filters
   * Requirements: 3.1, 3.2, 3.3, 3.4
   *
   * Query params:
   * - page: number (default: 1)
   * - pageSize: number (default: 20, max: 100)
   * - author: string (optional filter)
   * - status: "pending" | "sent" | "failed" (optional filter)
   */
  router.get("/", (_req: Request, res: Response) => {
    try {
      // Parse pagination params
      const page = Math.max(1, parseInt(_req.query.page as string) || 1);
      const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(
          1,
          parseInt(_req.query.pageSize as string) || DEFAULT_PAGE_SIZE
        )
      );

      // Parse filter params
      const authorFilter = _req.query.author as string | undefined;
      const statusFilter = _req.query.status as
        | "pending"
        | "sent"
        | "failed"
        | undefined;

      // Validate status filter if provided
      if (
        statusFilter &&
        !["pending", "sent", "failed"].includes(statusFilter)
      ) {
        res
          .status(400)
          .json(
            errorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Invalid status filter. Must be 'pending', 'sent', or 'failed'"
            )
          );
        return;
      }

      // Get all history (up to 100 items as per StateManager limit)
      const allHistory = stateManager.getHistory(MAX_PAGE_SIZE);

      // Apply filters
      let filteredHistory = allHistory;

      if (authorFilter) {
        filteredHistory = filteredHistory.filter(
          (video) => video.author === authorFilter
        );
      }

      if (statusFilter) {
        filteredHistory = filteredHistory.filter(
          (video) => video.webhookStatus === statusFilter
        );
      }

      // Calculate pagination
      const total = filteredHistory.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      // Get page items
      const pageItems = filteredHistory.slice(startIndex, endIndex);

      // Transform to API response format
      const items: VideoHistoryItem[] = pageItems.map(
        (video: ProcessedVideo) => ({
          videoId: video.videoId,
          author: video.author,
          processedAt:
            video.processedAt instanceof Date
              ? video.processedAt.toISOString()
              : video.processedAt,
          webhookStatus: video.webhookStatus,
          retryCount: video.retryCount,
        })
      );

      const response: PaginatedResponse<VideoHistoryItem> = {
        items,
        total,
        page,
        pageSize,
        totalPages,
      };

      res.json(successResponse(response));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json(errorResponse(ErrorCode.INTERNAL_ERROR, message));
    }
  });

  return router;
}
