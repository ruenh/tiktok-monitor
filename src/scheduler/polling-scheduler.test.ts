// Unit tests for PollingScheduler
// Requirements: 2.1

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PollingScheduler } from "./polling-scheduler.js";
import { ConfigManager } from "../config/config-manager.js";
import { StateManager } from "../state/state-manager.js";
import { TikTokScraper, VideoMetadata } from "../scraper/tiktok-scraper.js";
import {
  WebhookClient,
  WebhookPayload,
  WebhookResult,
} from "../webhook/webhook-client.js";

// Mock implementations
function createMockConfigManager(
  config = {
    webhookUrl: "https://example.com/webhook",
    pollingInterval: 60,
    authors: ["testauthor"],
    maxRetries: 3,
  }
): ConfigManager {
  const manager = {
    getConfig: vi.fn().mockReturnValue(config),
    load: vi.fn().mockResolvedValue(config),
    save: vi.fn().mockResolvedValue(undefined),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [] }),
    addAuthor: vi.fn().mockResolvedValue(undefined),
    removeAuthor: vi.fn().mockResolvedValue(undefined),
    getAuthors: vi.fn().mockReturnValue(config.authors),
    setWebhookUrl: vi.fn().mockResolvedValue(undefined),
    setPollingInterval: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfigManager;
  return manager;
}

function createMockStateManager(): StateManager {
  const processedVideos = new Set<string>();
  const manager = {
    isProcessed: vi.fn((videoId: string) => processedVideos.has(videoId)),
    markProcessed: vi.fn(async (video) => {
      processedVideos.add(video.videoId);
    }),
    updateLastCheckTime: vi.fn().mockResolvedValue(undefined),
    updateWebhookStatus: vi.fn().mockResolvedValue(undefined),
    getPendingRetries: vi.fn().mockReturnValue([]),
    getLastCheckTime: vi.fn().mockReturnValue(null),
    load: vi.fn().mockResolvedValue({
      processedVideos: new Map(),
      lastCheckTimes: new Map(),
    }),
    save: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockReturnValue([]),
    getState: vi.fn().mockReturnValue({
      processedVideos: new Map(),
      lastCheckTimes: new Map(),
    }),
    getProcessedVideoIds: vi.fn().mockReturnValue([]),
    clear: vi.fn(),
  } as unknown as StateManager;
  return manager;
}

function createMockScraper(videos: VideoMetadata[] = []): TikTokScraper {
  const scraper = {
    getLatestVideos: vi.fn().mockResolvedValue(videos),
    getVideoById: vi.fn().mockResolvedValue(null),
    isValidUsername: vi.fn().mockReturnValue(true),
  } as unknown as TikTokScraper;
  return scraper;
}

function createMockWebhookClient(successResult = true): WebhookClient {
  const result: WebhookResult = {
    success: successResult,
    statusCode: successResult ? 200 : 500,
    attempts: 1,
    error: successResult ? undefined : "Mock error",
  };
  const client = {
    send: vi.fn().mockResolvedValue(result),
    sendWithRetry: vi.fn().mockResolvedValue(result),
    createPayload: vi.fn(
      (video: VideoMetadata): WebhookPayload => ({
        videoId: video.id,
        videoUrl: video.url,
        description: video.description,
        author: video.author,
        publishedAt: video.publishedAt.toISOString(),
        thumbnailUrl: video.thumbnailUrl,
      })
    ),
    setWebhookUrl: vi.fn(),
    getWebhookUrl: vi.fn().mockReturnValue("https://example.com/webhook"),
  } as unknown as WebhookClient;
  return client;
}

function createTestVideo(id: string, author: string): VideoMetadata {
  return {
    id,
    url: `https://tiktok.com/@${author}/video/${id}`,
    downloadUrl: `https://download.com/${id}`,
    description: `Test video ${id}`,
    author,
    publishedAt: new Date(),
    thumbnailUrl: `https://thumb.com/${id}`,
    duration: 30,
  };
}

describe("PollingScheduler", () => {
  let scheduler: PollingScheduler;
  let mockConfigManager: ConfigManager;
  let mockStateManager: StateManager;
  let mockScraper: TikTokScraper;
  let mockWebhookClient: WebhookClient;
  let logMessages: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    logMessages = [];
    mockConfigManager = createMockConfigManager();
    mockStateManager = createMockStateManager();
    mockScraper = createMockScraper();
    mockWebhookClient = createMockWebhookClient();

    scheduler = new PollingScheduler({
      configManager: mockConfigManager,
      stateManager: mockStateManager,
      scraper: mockScraper,
      webhookClient: mockWebhookClient,
      logger: (msg) => logMessages.push(msg),
    });
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe("start/stop behavior", () => {
    it("should start polling and set running state to true", () => {
      expect(scheduler.isRunning()).toBe(false);
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
    });

    it("should stop polling and set running state to false", () => {
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);
      scheduler.stop();
      expect(scheduler.isRunning()).toBe(false);
    });

    it("should not start twice if already running", () => {
      scheduler.start();
      scheduler.start();
      expect(logMessages[logMessages.length - 1]).toContain("already running");
    });

    it("should not stop if not running", () => {
      scheduler.stop();
      expect(logMessages[logMessages.length - 1]).toContain("not running");
    });

    it("should call scraper when runOnce is called", async () => {
      const videos = [createTestVideo("video1", "testauthor")];
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(videos);

      await scheduler.runOnce();

      expect(mockScraper.getLatestVideos).toHaveBeenCalled();
    });
  });

  describe("runOnce", () => {
    it("should log message when no authors configured", async () => {
      mockConfigManager = createMockConfigManager({
        webhookUrl: "https://example.com/webhook",
        pollingInterval: 60,
        authors: [],
        maxRetries: 3,
      });
      scheduler = new PollingScheduler({
        configManager: mockConfigManager,
        stateManager: mockStateManager,
        scraper: mockScraper,
        webhookClient: mockWebhookClient,
        logger: (msg) => logMessages.push(msg),
      });

      await scheduler.runOnce();
      expect(logMessages.some((m) => m.includes("No authors configured"))).toBe(
        true
      );
    });

    it("should check each configured author", async () => {
      vi.useRealTimers(); // Use real timers for this test due to delay between authors
      mockConfigManager = createMockConfigManager({
        webhookUrl: "https://example.com/webhook",
        pollingInterval: 60,
        authors: ["author1", "author2"],
        maxRetries: 3,
      });
      scheduler = new PollingScheduler({
        configManager: mockConfigManager,
        stateManager: mockStateManager,
        scraper: mockScraper,
        webhookClient: mockWebhookClient,
        logger: (msg) => logMessages.push(msg),
      });

      await scheduler.runOnce();

      expect(mockScraper.getLatestVideos).toHaveBeenCalledWith("author1", 10);
      expect(mockScraper.getLatestVideos).toHaveBeenCalledWith("author2", 10);
    }, 10000);

    it("should skip already processed videos", async () => {
      const videos = [
        createTestVideo("video1", "testauthor"),
        createTestVideo("video2", "testauthor"),
      ];
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(videos);
      (
        mockStateManager.isProcessed as ReturnType<typeof vi.fn>
      ).mockImplementation((id: string) => id === "video1");

      await scheduler.runOnce();

      // Only video2 should be processed
      expect(mockStateManager.markProcessed).toHaveBeenCalledTimes(1);
      expect(mockStateManager.markProcessed).toHaveBeenCalledWith(
        expect.objectContaining({ videoId: "video2" })
      );
    });

    it("should send webhook for new videos", async () => {
      const videos = [createTestVideo("video1", "testauthor")];
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(videos);

      await scheduler.runOnce();

      expect(mockWebhookClient.createPayload).toHaveBeenCalledWith(videos[0]);
      expect(mockWebhookClient.sendWithRetry).toHaveBeenCalled();
    });

    it("should update webhook status to sent on success", async () => {
      const videos = [createTestVideo("video1", "testauthor")];
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(videos);

      await scheduler.runOnce();

      expect(mockStateManager.updateWebhookStatus).toHaveBeenCalledWith(
        "video1",
        "sent",
        expect.any(Number)
      );
    });

    it("should update webhook status to failed on failure", async () => {
      const videos = [createTestVideo("video1", "testauthor")];
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockResolvedValue(videos);
      mockWebhookClient = createMockWebhookClient(false);
      scheduler = new PollingScheduler({
        configManager: mockConfigManager,
        stateManager: mockStateManager,
        scraper: mockScraper,
        webhookClient: mockWebhookClient,
        logger: (msg) => logMessages.push(msg),
      });

      await scheduler.runOnce();

      expect(mockStateManager.updateWebhookStatus).toHaveBeenCalledWith(
        "video1",
        "failed",
        expect.any(Number)
      );
    });

    it("should update last check time after checking author", async () => {
      await scheduler.runOnce();

      expect(mockStateManager.updateLastCheckTime).toHaveBeenCalledWith(
        "testauthor"
      );
    });

    it("should handle scraper errors gracefully", async () => {
      (
        mockScraper.getLatestVideos as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error("Network error"));

      await scheduler.runOnce();

      expect(logMessages.some((m) => m.includes("Error checking author"))).toBe(
        true
      );
    });
  });

  describe("setInterval", () => {
    it("should update the polling interval", () => {
      scheduler.setInterval(120);
      expect(scheduler.getInterval()).toBe(120);
    });

    it("should restart scheduler with new interval if running", async () => {
      vi.useRealTimers(); // Use real timers for this test
      scheduler.start();
      expect(scheduler.isRunning()).toBe(true);

      scheduler.setInterval(120);

      // Give time for restart
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(scheduler.isRunning()).toBe(true);
      expect(scheduler.getInterval()).toBe(120);
    });
  });
});
