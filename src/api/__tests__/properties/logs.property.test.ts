import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import { Express } from "express";
import { Server } from "http";
import { createApiServer, addErrorHandler } from "../../server.js";
import { ConfigManager } from "../../../config/config-manager.js";
import { StateManager } from "../../../state/state-manager.js";
import { PollingScheduler } from "../../../scheduler/polling-scheduler.js";
import { TikTokScraper } from "../../../scraper/tiktok-scraper.js";
import { WebhookClient } from "../../../webhook/webhook-client.js";
import { Logger, LogLevel, LogEntry } from "../../services/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Property-based tests for Logs API
 * Using fast-check library with minimum 100 iterations per property
 * **Validates: Requirements 6.1**
 */

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Counter for unique file names
let envCounter = 0;

// Helper to create a fresh test environment
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
  const logger = new Logger();

  const scheduler = new PollingScheduler({
    configManager,
    stateManager,
    scraper,
    webhookClient,
    logger: () => {},
  });

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
    logger: Logger;
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
        logger,
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

describe("Logs API Property Tests", () => {
  let tempDir: string;

  // Log level generator
  const logLevelGen = fc.constantFrom<LogLevel>("info", "warn", "error");

  // Log message generator
  const logMessageGen = fc.string({ minLength: 1, maxLength: 200 });

  // Number of logs to add generator (for testing limit)
  const logCountGen = fc.integer({ min: 0, max: 200 });

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "logs-api-test-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * **Feature: web-ui, Property 11: Logs limit enforcement**
   * *For any* logs request, the returned entries count should not exceed 100.
   * **Validates: Requirements 6.1**
   */
  describe("Property 11: Logs limit enforcement", () => {
    it("should never return more than 100 log entries regardless of how many are added", async () => {
      await fc.assert(
        fc.asyncProperty(
          logCountGen,
          fc.array(fc.tuple(logLevelGen, logMessageGen), {
            minLength: 0,
            maxLength: 200,
          }),
          async (extraCount, logEntries) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add the generated log entries
              for (const [level, message] of logEntries) {
                env.logger[level](message);
              }

              // Add extra logs if extraCount > logEntries.length
              const totalToAdd = Math.max(extraCount, logEntries.length);
              for (let i = logEntries.length; i < totalToAdd; i++) {
                env.logger.info(`Extra log entry ${i}`);
              }

              // Get logs via API
              const response = await fetch(`${env.baseUrl}/api/v1/logs`);
              const body = (await response.json()) as ApiResponse<LogEntry[]>;

              expect(body.success).toBe(true);
              expect(Array.isArray(body.data)).toBe(true);

              // Property: returned entries should never exceed 100
              expect(body.data!.length).toBeLessThanOrEqual(100);
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return exactly the number of logs added when under 100", async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 99 }), async (logCount) => {
          const env = await createTestEnv(tempDir);
          try {
            // Add exactly logCount entries
            for (let i = 0; i < logCount; i++) {
              env.logger.info(`Log entry ${i}`);
            }

            // Get logs via API
            const response = await fetch(`${env.baseUrl}/api/v1/logs`);
            const body = (await response.json()) as ApiResponse<LogEntry[]>;

            expect(body.success).toBe(true);
            expect(body.data!.length).toBe(logCount);
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should return exactly 100 logs when more than 100 are added", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 101, max: 200 }),
          async (logCount) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add more than 100 entries
              for (let i = 0; i < logCount; i++) {
                env.logger.info(`Log entry ${i}`);
              }

              // Get logs via API
              const response = await fetch(`${env.baseUrl}/api/v1/logs`);
              const body = (await response.json()) as ApiResponse<LogEntry[]>;

              expect(body.success).toBe(true);
              expect(body.data!.length).toBe(100);
            } finally {
              await env.cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should enforce limit when filtering by level", async () => {
      await fc.assert(
        fc.asyncProperty(
          logLevelGen,
          fc.integer({ min: 0, max: 200 }),
          async (filterLevel, logCount) => {
            const env = await createTestEnv(tempDir);
            try {
              // Add logs of the specified level
              for (let i = 0; i < logCount; i++) {
                env.logger[filterLevel](`Log entry ${i}`);
              }

              // Get logs filtered by level via API
              const response = await fetch(
                `${env.baseUrl}/api/v1/logs?level=${filterLevel}`
              );
              const body = (await response.json()) as ApiResponse<LogEntry[]>;

              expect(body.success).toBe(true);
              expect(Array.isArray(body.data)).toBe(true);

              // Property: returned entries should never exceed 100
              expect(body.data!.length).toBeLessThanOrEqual(100);

              // All returned entries should have the filtered level
              for (const entry of body.data!) {
                expect(entry.level).toBe(filterLevel);
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
