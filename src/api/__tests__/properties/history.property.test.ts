import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import { Express } from "express";
import { Server } from "http";
import { createApiServer, addErrorHandler } from "../../server.js";
import { ConfigManager } from "../../../config/config-manager.js";
import { StateManager, ProcessedVideo } from "../../../state/state-manager.js";
import { PollingScheduler } from "../../../scheduler/polling-scheduler.js";
import { TikTokScraper } from "../../../scraper/tiktok-scraper.js";
import { WebhookClient } from "../../../webhook/webhook-client.js";
import { createLogger } from "../../services/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Property-based tests for History API
 * Using fast-check library with minimum 100 iterations per property
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

interface VideoHistoryItem {
  videoId: string;
  author: string;
  processedAt: string;
  webhookStatus: "pending" | "sent" | "failed";
  retryCount: number;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

let envCounter = 0;

async function createTestEnv(tempDir: string) {
  const uniqueId = `${Date.now()}-${++envCounter}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const configPath = path.join(tempDir, `config-${uniqueId}.json`);
  const statePath = path.join(tempDir, `state-${uniqueId}.json`);

  const configManager = new ConfigManager(configPath);
  const stateManager = new StateManager(statePath);

  const scraper = new TikTokScraper();
  const webhookClient = new WebhookClient("http://localhost:9999/webhook");

  const scheduler = new PollingScheduler({
    configManager,
    stateManager,
    scraper,
    webhookClient,
    logger: () => {},
  });

  const logger = createLogger();

  const app = createApiServer({
    configManager,
    stateManager,
    scheduler,
    logger,
  });
  addErrorHandler(app);

  return new Promise<{
    app: Express;
    server: Server;
    baseUrl: string;
    stateManager: StateManager;
    cleanup: () => Promise<void>;
  }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      let baseUrl = "";
      if (address && typeof address === "object") {
        baseUrl = `http://localhost:${address.port}`;
      }
      resolve({
        app,
        server,
        baseUrl,
        stateManager,
        cleanup: async () => {
          await new Promise<void>((res) => server.close(() => res()));
          try {
            await fs.unlink(configPath);
          } catch {
            /* ignore */
          }
          try {
            await fs.unlink(statePath);
          } catch {
            /* ignore */
          }
        },
      });
    });
  });
}

// Generators
const webhookStatusGen = fc.constantFrom<"pending" | "sent" | "failed">(
  "pending",
  "sent",
  "failed"
);

const videoIdGen = fc.stringOf(fc.constantFrom(..."0123456789".split("")), {
  minLength: 10,
  maxLength: 19,
});

const authorGen = fc
  .stringOf(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_".split("")),
    { minLength: 1, maxLength: 24 }
  )
  .filter((u) => u.length >= 1 && /^[a-zA-Z0-9]/.test(u));

const processedVideoGen = fc.record({
  videoId: videoIdGen,
  author: authorGen,
  processedAt: fc.date({
    min: new Date("2024-01-01"),
    max: new Date("2025-12-31"),
  }),
  webhookStatus: webhookStatusGen,
  retryCount: fc.integer({ min: 0, max: 5 }),
});

describe("History API Property Tests", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "history-api-test-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  /**
   * **Feature: web-ui, Property 5: History pagination bounds**
   * **Validates: Requirements 3.1**
   */
  describe("Property 5: History pagination bounds", () => {
    it("should return items count not exceeding pageSize", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 0, maxLength: 30 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 50 }),
          async (videos, page, pageSize) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add videos with unique IDs
              const uniqueVideos = videos.reduce((acc, v, i) => {
                const uniqueVideo = { ...v, videoId: `${v.videoId}-${i}` };
                acc.push(uniqueVideo);
                return acc;
              }, [] as ProcessedVideo[]);

              for (const video of uniqueVideos) {
                await env.stateManager.markProcessed(video);
              }

              const response = await fetch(
                `${env.baseUrl}/api/v1/history?page=${page}&pageSize=${pageSize}`
              );
              const body = (await response.json()) as ApiResponse<
                PaginatedResponse<VideoHistoryItem>
              >;

              expect(body.success).toBe(true);
              // Items count should not exceed pageSize
              expect(body.data!.items.length).toBeLessThanOrEqual(
                body.data!.pageSize
              );
              // Items count should not exceed total
              expect(body.data!.items.length).toBeLessThanOrEqual(
                body.data!.total
              );
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 6: History item completeness**
   * **Validates: Requirements 3.2**
   */
  describe("Property 6: History item completeness", () => {
    it("should contain all required fields for every history item", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 1, maxLength: 20 }),
          async (videos) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add videos with unique IDs
              for (let i = 0; i < videos.length; i++) {
                const video = {
                  ...videos[i],
                  videoId: `${videos[i].videoId}-${i}`,
                };
                await env.stateManager.markProcessed(video);
              }

              const response = await fetch(`${env.baseUrl}/api/v1/history`);
              const body = (await response.json()) as ApiResponse<
                PaginatedResponse<VideoHistoryItem>
              >;

              expect(body.success).toBe(true);

              // Every item must have all required fields
              for (const item of body.data!.items) {
                expect(item).toHaveProperty("videoId");
                expect(item).toHaveProperty("author");
                expect(item).toHaveProperty("processedAt");
                expect(item).toHaveProperty("webhookStatus");

                expect(typeof item.videoId).toBe("string");
                expect(typeof item.author).toBe("string");
                expect(typeof item.processedAt).toBe("string");
                expect(["pending", "sent", "failed"]).toContain(
                  item.webhookStatus
                );

                // processedAt should be a valid ISO date string
                expect(() => new Date(item.processedAt)).not.toThrow();
                expect(new Date(item.processedAt).toISOString()).toBe(
                  item.processedAt
                );
              }
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 7: Author filter correctness**
   * **Validates: Requirements 3.3**
   */
  describe("Property 7: Author filter correctness", () => {
    it("should return only videos from the filtered author", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 1, maxLength: 20 }),
          async (videos) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add videos with unique IDs
              for (let i = 0; i < videos.length; i++) {
                const video = {
                  ...videos[i],
                  videoId: `${videos[i].videoId}-${i}`,
                };
                await env.stateManager.markProcessed(video);
              }

              // Pick a random author from the videos
              const targetAuthor = videos[0].author;

              const response = await fetch(
                `${env.baseUrl}/api/v1/history?author=${encodeURIComponent(
                  targetAuthor
                )}`
              );
              const body = (await response.json()) as ApiResponse<
                PaginatedResponse<VideoHistoryItem>
              >;

              expect(body.success).toBe(true);

              // All returned items must have the filtered author
              for (const item of body.data!.items) {
                expect(item.author).toBe(targetAuthor);
              }
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 8: Status filter correctness**
   * **Validates: Requirements 3.4**
   */
  describe("Property 8: Status filter correctness", () => {
    it("should return only videos with the filtered status", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 1, maxLength: 20 }),
          webhookStatusGen,
          async (videos, targetStatus) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add videos with unique IDs
              for (let i = 0; i < videos.length; i++) {
                const video = {
                  ...videos[i],
                  videoId: `${videos[i].videoId}-${i}`,
                };
                await env.stateManager.markProcessed(video);
              }

              const response = await fetch(
                `${env.baseUrl}/api/v1/history?status=${targetStatus}`
              );
              const body = (await response.json()) as ApiResponse<
                PaginatedResponse<VideoHistoryItem>
              >;

              expect(body.success).toBe(true);

              // All returned items must have the filtered status
              for (const item of body.data!.items) {
                expect(item.webhookStatus).toBe(targetStatus);
              }
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
