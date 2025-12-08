// StateManager - manages processed videos state
// Requirements: 2.2, 2.3, 5.1, 5.2, 5.3
import { promises as fs } from "fs";
import path from "path";

/**
 * Represents a processed video with its webhook delivery status
 * Requirements: 2.2, 5.1, 5.2
 */
export interface ProcessedVideo {
  videoId: string;
  author: string;
  processedAt: Date;
  webhookStatus: "pending" | "sent" | "failed";
  retryCount: number;
}

/**
 * Internal JSON representation for serialization
 */
interface ProcessedVideoJSON {
  videoId: string;
  author: string;
  processedAt: string; // ISO date string
  webhookStatus: "pending" | "sent" | "failed";
  retryCount: number;
}

/**
 * Application state containing processed videos and check times
 * Requirements: 2.2, 5.1, 5.2
 */
export interface State {
  processedVideos: Map<string, ProcessedVideo>;
  lastCheckTimes: Map<string, Date>;
}

/**
 * JSON representation of state for persistence
 */
interface StateJSON {
  processedVideos: Record<string, ProcessedVideoJSON>;
  lastCheckTimes: Record<string, string>;
}

const DEFAULT_HISTORY_LIMIT = 100;

/**
 * StateManager class - manages processed videos state with persistence
 * Requirements: 2.2, 2.3, 5.2, 5.3
 */
export class StateManager {
  private statePath: string;
  private state: State;

  constructor(statePath: string = "state.json") {
    this.statePath = statePath;
    this.state = {
      processedVideos: new Map(),
      lastCheckTimes: new Map(),
    };
  }

  /**
   * Check if a video has already been processed
   * Requirements: 2.2
   */
  isProcessed(videoId: string): boolean {
    return this.state.processedVideos.has(videoId);
  }

  /**
   * Mark a video as processed
   * Requirements: 2.2, 5.3
   */
  async markProcessed(video: ProcessedVideo): Promise<void> {
    this.state.processedVideos.set(video.videoId, {
      ...video,
      processedAt:
        video.processedAt instanceof Date
          ? video.processedAt
          : new Date(video.processedAt),
    });
    await this.save();
  }

  /**
   * Get processing history with limit
   * Requirements: 5.2
   */
  getHistory(limit: number = DEFAULT_HISTORY_LIMIT): ProcessedVideo[] {
    const videos = Array.from(this.state.processedVideos.values());

    // Sort by processedAt descending (most recent first)
    videos.sort((a, b) => {
      const dateA =
        a.processedAt instanceof Date ? a.processedAt : new Date(a.processedAt);
      const dateB =
        b.processedAt instanceof Date ? b.processedAt : new Date(b.processedAt);
      return dateB.getTime() - dateA.getTime();
    });

    // Apply limit (max 100 as per requirements)
    const effectiveLimit = Math.min(limit, DEFAULT_HISTORY_LIMIT);
    return videos.slice(0, effectiveLimit);
  }

  /**
   * Get videos that failed webhook delivery and need retry
   * Requirements: 3.3, 3.4
   */
  getPendingRetries(): ProcessedVideo[] {
    return Array.from(this.state.processedVideos.values()).filter(
      (video) => video.webhookStatus === "failed"
    );
  }

  /**
   * Get the last check time for an author
   * Requirements: 5.1
   */
  getLastCheckTime(author: string): Date | null {
    const time = this.state.lastCheckTimes.get(author);
    return time ?? null;
  }

  /**
   * Update the last check time for an author
   * Requirements: 5.1
   */
  async updateLastCheckTime(author: string): Promise<void> {
    this.state.lastCheckTimes.set(author, new Date());
    await this.save();
  }

  /**
   * Update webhook status for a video
   * Requirements: 3.3, 3.4
   */
  async updateWebhookStatus(
    videoId: string,
    status: "pending" | "sent" | "failed",
    retryCount?: number
  ): Promise<void> {
    const video = this.state.processedVideos.get(videoId);
    if (video) {
      video.webhookStatus = status;
      if (retryCount !== undefined) {
        video.retryCount = retryCount;
      }
      await this.save();
    }
  }

  /**
   * Load state from JSON file
   * Requirements: 2.3
   */
  async load(): Promise<State> {
    try {
      const data = await fs.readFile(this.statePath, "utf-8");
      const parsed: StateJSON = JSON.parse(data);

      // Convert JSON to State with proper types
      this.state = {
        processedVideos: new Map(
          Object.entries(parsed.processedVideos || {}).map(([key, value]) => [
            key,
            {
              ...value,
              processedAt: new Date(value.processedAt),
            },
          ])
        ),
        lastCheckTimes: new Map(
          Object.entries(parsed.lastCheckTimes || {}).map(([key, value]) => [
            key,
            new Date(value),
          ])
        ),
      };

      return this.state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, use empty state
        this.state = {
          processedVideos: new Map(),
          lastCheckTimes: new Map(),
        };
        return this.state;
      }
      throw error;
    }
  }

  /**
   * Save state to JSON file
   * Requirements: 2.3
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.statePath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }

    // Convert State to JSON-serializable format
    const stateJSON: StateJSON = {
      processedVideos: Object.fromEntries(
        Array.from(this.state.processedVideos.entries()).map(([key, value]) => [
          key,
          {
            ...value,
            processedAt: value.processedAt.toISOString(),
          },
        ])
      ),
      lastCheckTimes: Object.fromEntries(
        Array.from(this.state.lastCheckTimes.entries()).map(([key, value]) => [
          key,
          value.toISOString(),
        ])
      ),
    };

    await fs.writeFile(
      this.statePath,
      JSON.stringify(stateJSON, null, 2),
      "utf-8"
    );
  }

  /**
   * Get current state (for testing/debugging)
   */
  getState(): State {
    return {
      processedVideos: new Map(this.state.processedVideos),
      lastCheckTimes: new Map(this.state.lastCheckTimes),
    };
  }

  /**
   * Get all processed video IDs
   */
  getProcessedVideoIds(): string[] {
    return Array.from(this.state.processedVideos.keys());
  }

  /**
   * Clear all state (for testing)
   */
  clear(): void {
    this.state = {
      processedVideos: new Map(),
      lastCheckTimes: new Map(),
    };
  }
}
