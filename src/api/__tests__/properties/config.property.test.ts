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
import { createLogger } from "../../services/logger.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Property-based tests for Config API
 * Using fast-check library with minimum 100 iterations per property
 * **Validates: Requirements 4.2, 4.3, 4.4**
 */

interface ConfigResponse {
  webhookUrl: string;
  pollingInterval: number;
}

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
    configManager: ConfigManager;
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
        configManager,
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

describe("Config API Property Tests", () => {
  let tempDir: string;

  // Valid webhook URL generator (http/https URLs)
  const validUrlGen = fc
    .tuple(
      fc.constantFrom("http", "https"),
      fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
        minLength: 3,
        maxLength: 15,
      }),
      fc.constantFrom(".com", ".org", ".net", ".io", ".ru"),
      fc.option(
        fc.stringOf(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz/".split("")),
          {
            minLength: 1,
            maxLength: 20,
          }
        ),
        { nil: undefined }
      )
    )
    .map(([protocol, domain, tld, path]) => {
      const url = `${protocol}://${domain}${tld}${path ? "/" + path : ""}`;
      return url;
    });

  // Invalid URL generator
  const invalidUrlGen = fc.oneof(
    fc.constant(""),
    fc.constant("   "),
    fc.constant("not-a-url"),
    fc.constant("ftp://example.com"),
    fc.constant("file:///etc/passwd"),
    fc.constant("javascript:alert(1)"),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
      minLength: 1,
      maxLength: 20,
    })
  );

  // Valid polling interval generator (60-3600)
  const validIntervalGen = fc.integer({ min: 60, max: 3600 });

  // Invalid polling interval generator
  const invalidIntervalGen = fc.oneof(
    fc.integer({ min: -1000, max: 59 }),
    fc.integer({ min: 3601, max: 10000 }),
    fc.double({ min: 60.1, max: 3599.9 }).filter((n) => !Number.isInteger(n))
  );

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "config-api-test-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * **Feature: web-ui, Property 9: Config update persistence**
   * *For any* valid config update, getting the config after update should return the new values.
   * **Validates: Requirements 4.2, 4.3**
   */
  describe("Property 9: Config update persistence", () => {
    it("should persist webhookUrl after update", async () => {
      await fc.assert(
        fc.asyncProperty(validUrlGen, async (webhookUrl) => {
          const env = await createTestEnv(tempDir);
          try {
            // Update config with new webhookUrl
            const updateResponse = await fetch(`${env.baseUrl}/api/v1/config`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ webhookUrl }),
            });
            const updateBody =
              (await updateResponse.json()) as ApiResponse<ConfigResponse>;

            expect(updateBody.success).toBe(true);

            // Get config and verify the value persisted
            const getResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const getBody =
              (await getResponse.json()) as ApiResponse<ConfigResponse>;

            expect(getBody.success).toBe(true);
            expect(getBody.data!.webhookUrl).toBe(webhookUrl);
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should persist pollingInterval after update", async () => {
      await fc.assert(
        fc.asyncProperty(validIntervalGen, async (pollingInterval) => {
          const env = await createTestEnv(tempDir);
          try {
            // Update config with new pollingInterval
            const updateResponse = await fetch(`${env.baseUrl}/api/v1/config`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pollingInterval }),
            });
            const updateBody =
              (await updateResponse.json()) as ApiResponse<ConfigResponse>;

            expect(updateBody.success).toBe(true);

            // Get config and verify the value persisted
            const getResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const getBody =
              (await getResponse.json()) as ApiResponse<ConfigResponse>;

            expect(getBody.success).toBe(true);
            expect(getBody.data!.pollingInterval).toBe(pollingInterval);
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should persist both webhookUrl and pollingInterval when updated together", async () => {
      await fc.assert(
        fc.asyncProperty(
          validUrlGen,
          validIntervalGen,
          async (webhookUrl, pollingInterval) => {
            const env = await createTestEnv(tempDir);
            try {
              // Update config with both values
              const updateResponse = await fetch(
                `${env.baseUrl}/api/v1/config`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ webhookUrl, pollingInterval }),
                }
              );
              const updateBody =
                (await updateResponse.json()) as ApiResponse<ConfigResponse>;

              expect(updateBody.success).toBe(true);

              // Get config and verify both values persisted
              const getResponse = await fetch(`${env.baseUrl}/api/v1/config`);
              const getBody =
                (await getResponse.json()) as ApiResponse<ConfigResponse>;

              expect(getBody.success).toBe(true);
              expect(getBody.data!.webhookUrl).toBe(webhookUrl);
              expect(getBody.data!.pollingInterval).toBe(pollingInterval);
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
   * **Feature: web-ui, Property 10: Invalid config rejection**
   * *For any* invalid config value (bad URL format, interval outside 60-3600),
   * the API should return an error and config should remain unchanged.
   * **Validates: Requirements 4.4**
   */
  describe("Property 10: Invalid config rejection", () => {
    it("should reject invalid webhookUrl and keep config unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(invalidUrlGen, async (invalidUrl) => {
          const env = await createTestEnv(tempDir);
          try {
            // Get initial config
            const initialResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const initialBody =
              (await initialResponse.json()) as ApiResponse<ConfigResponse>;
            const initialConfig = initialBody.data!;

            // Try to update with invalid URL
            const updateResponse = await fetch(`${env.baseUrl}/api/v1/config`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ webhookUrl: invalidUrl }),
            });
            const updateBody =
              (await updateResponse.json()) as ApiResponse<ConfigResponse>;

            // Should fail
            expect(updateBody.success).toBe(false);
            expect(updateBody.error).toBeDefined();
            expect(updateBody.error!.code).toBeDefined();
            expect(updateBody.error!.message).toBeDefined();

            // Config should remain unchanged
            const finalResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const finalBody =
              (await finalResponse.json()) as ApiResponse<ConfigResponse>;

            expect(finalBody.data!.webhookUrl).toBe(initialConfig.webhookUrl);
            expect(finalBody.data!.pollingInterval).toBe(
              initialConfig.pollingInterval
            );
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should reject invalid pollingInterval and keep config unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(invalidIntervalGen, async (invalidInterval) => {
          const env = await createTestEnv(tempDir);
          try {
            // Get initial config
            const initialResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const initialBody =
              (await initialResponse.json()) as ApiResponse<ConfigResponse>;
            const initialConfig = initialBody.data!;

            // Try to update with invalid interval
            const updateResponse = await fetch(`${env.baseUrl}/api/v1/config`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pollingInterval: invalidInterval }),
            });
            const updateBody =
              (await updateResponse.json()) as ApiResponse<ConfigResponse>;

            // Should fail
            expect(updateBody.success).toBe(false);
            expect(updateBody.error).toBeDefined();
            expect(updateBody.error!.code).toBeDefined();
            expect(updateBody.error!.message).toBeDefined();

            // Config should remain unchanged
            const finalResponse = await fetch(`${env.baseUrl}/api/v1/config`);
            const finalBody =
              (await finalResponse.json()) as ApiResponse<ConfigResponse>;

            expect(finalBody.data!.webhookUrl).toBe(initialConfig.webhookUrl);
            expect(finalBody.data!.pollingInterval).toBe(
              initialConfig.pollingInterval
            );
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should reject when both values are invalid", async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidUrlGen,
          invalidIntervalGen,
          async (invalidUrl, invalidInterval) => {
            const env = await createTestEnv(tempDir);
            try {
              // Get initial config
              const initialResponse = await fetch(
                `${env.baseUrl}/api/v1/config`
              );
              const initialBody =
                (await initialResponse.json()) as ApiResponse<ConfigResponse>;
              const initialConfig = initialBody.data!;

              // Try to update with both invalid values
              const updateResponse = await fetch(
                `${env.baseUrl}/api/v1/config`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    webhookUrl: invalidUrl,
                    pollingInterval: invalidInterval,
                  }),
                }
              );
              const updateBody =
                (await updateResponse.json()) as ApiResponse<ConfigResponse>;

              // Should fail
              expect(updateBody.success).toBe(false);
              expect(updateBody.error).toBeDefined();

              // Config should remain unchanged
              const finalResponse = await fetch(`${env.baseUrl}/api/v1/config`);
              const finalBody =
                (await finalResponse.json()) as ApiResponse<ConfigResponse>;

              expect(finalBody.data!.webhookUrl).toBe(initialConfig.webhookUrl);
              expect(finalBody.data!.pollingInterval).toBe(
                initialConfig.pollingInterval
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
});
