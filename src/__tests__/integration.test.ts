// Integration tests for TikTok Monitor
// Requirements: 2.3

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { ConfigManager } from "../config/config-manager.js";
import { StateManager, ProcessedVideo } from "../state/state-manager.js";
import { TikTokScraper, VideoMetadata } from "../scraper/tiktok-scraper.js";
import {
  WebhookClient,
  WebhookPayload,
  WebhookResult,
} from "../webhook/webhook-client.js";
import { PollingScheduler } from "../scheduler/polling-scheduler.js";

// Test directory for temporary files
let testDir: string;

// Helper to create a unique test directory
async function createTestDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `tiktok-monitor-test-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Helper to clean up test directory
async function cleanupTestDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// Create a mock video
function createTestVideo(
  id: string,
  author: string,
  publishedAt?: Date
): VideoMetadata {
  return {
    id,
    url: `https://tiktok.com/@${author}/video/${id}`,
    downloadUrl: `https://download.com/${id}`,
    description: `Test video ${id}`,
    author,
    publishedAt: publishedAt || new Date(),
    thumbnailUrl: `https://thumb.com/${id}`,
    duration: 30,
  };
}

describe("Integration Tests", () => {
  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  describe("Full flow: add author → poll → detect video → send webhook", () => {
    it("should process new videos and send webhooks", async () => {
      // Set up paths
      const configPath = path.join(testDir, "config.json");
      const statePath = path.join(testDir, "state.json");

      // Initialize components
      const configManager = new ConfigManager(configPath);
      const stateManager = new StateManager(statePath);

      // Load initial state
      await configManager.load();
      await stateManager.load();

      // Add author and configure webhook
      await configManager.addAuthor("testauthor");
      await configManager.setWebhookUrl("https://example.com/webhook");

      // Verify author was added
      const authors = configManager.getAuthors();
      expect(authors).toContain("testauthor");

      // Create mock scraper that returns test videos
      const testVideos = [
        createTestVideo("video1", "testauthor"),
        createTestVideo("video2", "testauthor"),
      ];

      const mockScraper = {
        getLatestVideos: vi.fn().mockResolvedValue(testVideos),
        getVideoById: vi.fn().mockResolvedValue(null),
        isValidUsername: vi.fn().mockReturnValue(true),
      } as unknown as TikTokScraper;

      // Create mock webhook client that tracks calls
      const webhookCalls: WebhookPayload[] = [];
      const mockWebhookClient = {
        send: vi
          .fn()
          .mockResolvedValue({ success: true, statusCode: 200, attempts: 1 }),
        sendWithRetry: vi
          .fn()
          .mockImplementation(async (payload: WebhookPayload) => {
            webhookCalls.push(payload);
            return {
              success: true,
              statusCode: 200,
              attempts: 1,
            } as WebhookResult;
          }),
        createPayload: vi.fn(
          (video: VideoMetadata): WebhookPayload => ({
            videoId: video.id,
            videoUrl: video.url,
            downloadUrl: video.downloadUrl,
            description: video.description,
            author: video.author,
            publishedAt: video.publishedAt.toISOString(),
            thumbnailUrl: video.thumbnailUrl,
            duration: video.duration,
            stats: video.stats,
          })
        ),
        setWebhookUrl: vi.fn(),
        getWebhookUrl: vi.fn().mockReturnValue("https://example.com/webhook"),
      } as unknown as WebhookClient;

      // Create scheduler
      const logMessages: string[] = [];
      const scheduler = new PollingScheduler({
        configManager,
        stateManager,
        scraper: mockScraper,
        webhookClient: mockWebhookClient,
        logger: (msg) => logMessages.push(msg),
      });

      // Run a single poll cycle
      await scheduler.runOnce();

      // Verify scraper was called for the author
      expect(mockScraper.getLatestVideos).toHaveBeenCalledWith(
        "testauthor",
        10
      );

      // Verify webhooks were sent for both videos
      expect(webhookCalls).toHaveLength(2);
      expect(webhookCalls.map((c) => c.videoId)).toContain("video1");
      expect(webhookCalls.map((c) => c.videoId)).toContain("video2");

      // Verify videos are marked as processed
      expect(stateManager.isProcessed("video1")).toBe(true);
      expect(stateManager.isProcessed("video2")).toBe(true);

      // Verify state was persisted
      const history = stateManager.getHistory(10);
      expect(history).toHaveLength(2);
    });

    it("should not reprocess already processed videos", async () => {
      const configPath = path.join(testDir, "config.json");
      const statePath = path.join(testDir, "state.json");

      const configManager = new ConfigManager(configPath);
      const stateManager = new StateManager(statePath);

      await configManager.load();
      await stateManager.load();

      await configManager.addAuthor("testauthor");
      await configManager.setWebhookUrl("https://example.com/webhook");

      // Pre-mark video1 as processed
      await stateManager.markProcessed({
        videoId: "video1",
        author: "testauthor",
        processedAt: new Date(),
        webhookStatus: "sent",
        retryCount: 0,
      });

      // Scraper returns both videos
      const testVideos = [
        createTestVideo("video1", "testauthor"),
        createTestVideo("video2", "testauthor"),
      ];

      const mockScraper = {
        getLatestVideos: vi.fn().mockResolvedValue(testVideos),
        getVideoById: vi.fn().mockResolvedValue(null),
        isValidUsername: vi.fn().mockReturnValue(true),
      } as unknown as TikTokScraper;

      const webhookCalls: WebhookPayload[] = [];
      const mockWebhookClient = {
        send: vi
          .fn()
          .mockResolvedValue({ success: true, statusCode: 200, attempts: 1 }),
        sendWithRetry: vi
          .fn()
          .mockImplementation(async (payload: WebhookPayload) => {
            webhookCalls.push(payload);
            return {
              success: true,
              statusCode: 200,
              attempts: 1,
            } as WebhookResult;
          }),
        createPayload: vi.fn(
          (video: VideoMetadata): WebhookPayload => ({
            videoId: video.id,
            videoUrl: video.url,
            downloadUrl: video.downloadUrl,
            description: video.description,
            author: video.author,
            publishedAt: video.publishedAt.toISOString(),
            thumbnailUrl: video.thumbnailUrl,
            duration: video.duration,
            stats: video.stats,
          })
        ),
        setWebhookUrl: vi.fn(),
        getWebhookUrl: vi.fn().mockReturnValue("https://example.com/webhook"),
      } as unknown as WebhookClient;

      const scheduler = new PollingScheduler({
        configManager,
        stateManager,
        scraper: mockScraper,
        webhookClient: mockWebhookClient,
        logger: () => {},
      });

      await scheduler.runOnce();

      // Only video2 should have webhook sent (video1 was already processed)
      expect(webhookCalls).toHaveLength(1);
      expect(webhookCalls[0].videoId).toBe("video2");
    });
  });

  describe("Restart recovery", () => {
    it("should persist and restore state across restarts", async () => {
      const configPath = path.join(testDir, "config.json");
      const statePath = path.join(testDir, "state.json");

      // First session: process some videos
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        await configManager.load();
        await stateManager.load();

        await configManager.addAuthor("testauthor");
        await configManager.setWebhookUrl("https://example.com/webhook");

        // Mark some videos as processed
        await stateManager.markProcessed({
          videoId: "video1",
          author: "testauthor",
          processedAt: new Date("2025-12-08T10:00:00Z"),
          webhookStatus: "sent",
          retryCount: 0,
        });

        await stateManager.markProcessed({
          videoId: "video2",
          author: "testauthor",
          processedAt: new Date("2025-12-08T10:01:00Z"),
          webhookStatus: "sent",
          retryCount: 0,
        });

        await stateManager.updateLastCheckTime("testauthor");

        // Verify state before "restart"
        expect(stateManager.isProcessed("video1")).toBe(true);
        expect(stateManager.isProcessed("video2")).toBe(true);
      }

      // Second session: simulate restart by creating new instances
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        // Load persisted state
        await configManager.load();
        await stateManager.load();

        // Verify configuration was restored
        const config = configManager.getConfig();
        expect(config.authors).toContain("testauthor");
        expect(config.webhookUrl).toBe("https://example.com/webhook");

        // Verify processed videos were restored
        expect(stateManager.isProcessed("video1")).toBe(true);
        expect(stateManager.isProcessed("video2")).toBe(true);

        // Verify last check time was restored
        const lastCheck = stateManager.getLastCheckTime("testauthor");
        expect(lastCheck).not.toBeNull();

        // Verify history is available
        const history = stateManager.getHistory(10);
        expect(history).toHaveLength(2);
        expect(history.map((v) => v.videoId)).toContain("video1");
        expect(history.map((v) => v.videoId)).toContain("video2");
      }
    });

    it("should not reprocess videos after restart", async () => {
      const configPath = path.join(testDir, "config.json");
      const statePath = path.join(testDir, "state.json");

      // First session: process video1
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        await configManager.load();
        await stateManager.load();

        await configManager.addAuthor("testauthor");
        await configManager.setWebhookUrl("https://example.com/webhook");

        await stateManager.markProcessed({
          videoId: "video1",
          author: "testauthor",
          processedAt: new Date(),
          webhookStatus: "sent",
          retryCount: 0,
        });
      }

      // Second session: simulate restart and poll
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        await configManager.load();
        await stateManager.load();

        // Scraper returns video1 (already processed) and video2 (new)
        const testVideos = [
          createTestVideo("video1", "testauthor"),
          createTestVideo("video2", "testauthor"),
        ];

        const mockScraper = {
          getLatestVideos: vi.fn().mockResolvedValue(testVideos),
          getVideoById: vi.fn().mockResolvedValue(null),
          isValidUsername: vi.fn().mockReturnValue(true),
        } as unknown as TikTokScraper;

        const webhookCalls: WebhookPayload[] = [];
        const mockWebhookClient = {
          send: vi
            .fn()
            .mockResolvedValue({ success: true, statusCode: 200, attempts: 1 }),
          sendWithRetry: vi
            .fn()
            .mockImplementation(async (payload: WebhookPayload) => {
              webhookCalls.push(payload);
              return {
                success: true,
                statusCode: 200,
                attempts: 1,
              } as WebhookResult;
            }),
          createPayload: vi.fn(
            (video: VideoMetadata): WebhookPayload => ({
              videoId: video.id,
              videoUrl: video.url,
              downloadUrl: video.downloadUrl,
              description: video.description,
              author: video.author,
              publishedAt: video.publishedAt.toISOString(),
              thumbnailUrl: video.thumbnailUrl,
              duration: video.duration,
              stats: video.stats,
            })
          ),
          setWebhookUrl: vi.fn(),
          getWebhookUrl: vi.fn().mockReturnValue("https://example.com/webhook"),
        } as unknown as WebhookClient;

        const scheduler = new PollingScheduler({
          configManager,
          stateManager,
          scraper: mockScraper,
          webhookClient: mockWebhookClient,
          logger: () => {},
        });

        await scheduler.runOnce();

        // Only video2 should be processed (video1 was processed before restart)
        expect(webhookCalls).toHaveLength(1);
        expect(webhookCalls[0].videoId).toBe("video2");

        // Both videos should now be marked as processed
        expect(stateManager.isProcessed("video1")).toBe(true);
        expect(stateManager.isProcessed("video2")).toBe(true);
      }
    });

    it("should handle failed webhooks and allow retry after restart", async () => {
      const configPath = path.join(testDir, "config.json");
      const statePath = path.join(testDir, "state.json");

      // First session: process video with failed webhook
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        await configManager.load();
        await stateManager.load();

        await configManager.addAuthor("testauthor");
        await configManager.setWebhookUrl("https://example.com/webhook");

        await stateManager.markProcessed({
          videoId: "video1",
          author: "testauthor",
          processedAt: new Date(),
          webhookStatus: "failed",
          retryCount: 1,
        });
      }

      // Second session: verify failed video is available for retry
      {
        const configManager = new ConfigManager(configPath);
        const stateManager = new StateManager(statePath);

        await configManager.load();
        await stateManager.load();

        // Get pending retries
        const pendingRetries = stateManager.getPendingRetries();
        expect(pendingRetries).toHaveLength(1);
        expect(pendingRetries[0].videoId).toBe("video1");
        expect(pendingRetries[0].webhookStatus).toBe("failed");
        expect(pendingRetries[0].retryCount).toBe(1);
      }
    });
  });
});
