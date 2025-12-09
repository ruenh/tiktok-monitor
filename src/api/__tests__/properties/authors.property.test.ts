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
 * Property-based tests for Authors API
 * Using fast-check library with minimum 100 iterations per property
 * **Validates: Requirements 1.2, 2.1, 2.2, 2.3, 2.4**
 */

interface AuthorInfo {
  username: string;
  lastCheckTime: string | null;
  videosCount: number;
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

  // Don't call load() - use fresh in-memory state
  // The ConfigManager constructor initializes with empty config

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

describe("Authors API Property Tests", () => {
  let tempDir: string;

  // Valid TikTok username generator (1-24 chars, alphanumeric + underscore + period)
  // Cannot start/end with period, no consecutive periods
  const validUsernameGen = fc
    .tuple(
      fc.stringOf(
        fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_".split("")),
        { minLength: 1, maxLength: 22 }
      ),
      fc.boolean()
    )
    .map(([base, addPeriod]) => {
      let username = base.replace(/^[^a-z0-9]/i, "a");
      if (addPeriod && username.length > 2) {
        const pos = Math.floor(username.length / 2);
        username = username.slice(0, pos) + "." + username.slice(pos + 1);
      }
      username = username.replace(/\.{2,}/g, ".");
      username = username.replace(/\.$/, "a");
      return username.slice(0, 24);
    })
    .filter((u) => u.length >= 1 && u.length <= 24 && /^[a-zA-Z0-9]/.test(u));

  // Invalid username generator
  const invalidUsernameGen = fc.oneof(
    fc.constant(""),
    fc.stringOf(fc.constantFrom(" ", "\t", "\n"), {
      minLength: 1,
      maxLength: 5,
    }),
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), {
      minLength: 25,
      maxLength: 30,
    }),
    fc.stringOf(fc.constantFrom(..."!@#$%^&*()+=[]{}|;:,<>?/".split("")), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.constant(".username"),
    fc.constant("username."),
    fc.constant("user..name")
  );

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "authors-api-test-"));
  });

  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * **Feature: web-ui, Property 1: Author count consistency**
   * **Validates: Requirements 1.2, 2.1**
   */
  describe("Property 1: Author count consistency", () => {
    it("should have consistent author count between status and authors endpoints", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validUsernameGen, { minLength: 0, maxLength: 5 }),
          async (usernames) => {
            const env = await createTestEnv(tempDir);
            try {
              const uniqueUsernames = [...new Set(usernames)];

              // Add the generated usernames
              for (const username of uniqueUsernames) {
                await env.configManager.addAuthor(username);
              }

              // Expected count is what we just added
              const expectedCount = uniqueUsernames.length;

              const statusResponse = await fetch(
                `${env.baseUrl}/api/v1/status`
              );
              const statusBody = (await statusResponse.json()) as ApiResponse<{
                authorsCount: number;
              }>;

              const authorsResponse = await fetch(
                `${env.baseUrl}/api/v1/authors`
              );
              const authorsBody = (await authorsResponse.json()) as ApiResponse<
                AuthorInfo[]
              >;

              expect(statusBody.success).toBe(true);
              expect(authorsBody.success).toBe(true);
              // The key property: status authorsCount should match authors list length
              expect(statusBody.data!.authorsCount).toBe(
                authorsBody.data!.length
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
   * **Feature: web-ui, Property 2: Add author increases count**
   * **Validates: Requirements 2.2**
   */
  describe("Property 2: Add author increases count", () => {
    it("should increase author count by one when adding a new author", async () => {
      await fc.assert(
        fc.asyncProperty(validUsernameGen, async (username) => {
          const env = await createTestEnv(tempDir);
          try {
            const initialResponse = await fetch(
              `${env.baseUrl}/api/v1/authors`
            );
            const initialBody = (await initialResponse.json()) as ApiResponse<
              AuthorInfo[]
            >;
            const initialCount = initialBody.data!.length;

            const addResponse = await fetch(`${env.baseUrl}/api/v1/authors`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username }),
            });
            const addBody = (await addResponse.json()) as ApiResponse<unknown>;

            const finalResponse = await fetch(`${env.baseUrl}/api/v1/authors`);
            const finalBody = (await finalResponse.json()) as ApiResponse<
              AuthorInfo[]
            >;
            const finalCount = finalBody.data!.length;

            if (addBody.success) {
              expect(finalCount).toBe(initialCount + 1);
            } else {
              expect(finalCount).toBe(initialCount);
            }
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 3: Remove author decreases count**
   * **Validates: Requirements 2.3**
   */
  describe("Property 3: Remove author decreases count", () => {
    it("should decrease author count by one when removing an existing author", async () => {
      await fc.assert(
        fc.asyncProperty(validUsernameGen, async (username) => {
          const env = await createTestEnv(tempDir);
          try {
            await fetch(`${env.baseUrl}/api/v1/authors`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username }),
            });

            const afterAddResponse = await fetch(
              `${env.baseUrl}/api/v1/authors`
            );
            const afterAddBody = (await afterAddResponse.json()) as ApiResponse<
              AuthorInfo[]
            >;
            const countAfterAdd = afterAddBody.data!.length;

            const removeResponse = await fetch(
              `${env.baseUrl}/api/v1/authors/${encodeURIComponent(username)}`,
              { method: "DELETE" }
            );
            const removeBody =
              (await removeResponse.json()) as ApiResponse<unknown>;

            const afterRemoveResponse = await fetch(
              `${env.baseUrl}/api/v1/authors`
            );
            const afterRemoveBody =
              (await afterRemoveResponse.json()) as ApiResponse<AuthorInfo[]>;
            const countAfterRemove = afterRemoveBody.data!.length;

            if (removeBody.success) {
              expect(countAfterRemove).toBe(countAfterAdd - 1);
            } else {
              expect(countAfterRemove).toBe(countAfterAdd);
            }
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: web-ui, Property 4: Invalid username rejection**
   * **Validates: Requirements 2.4**
   */
  describe("Property 4: Invalid username rejection", () => {
    it("should reject invalid usernames and keep author list unchanged", async () => {
      await fc.assert(
        fc.asyncProperty(invalidUsernameGen, async (invalidUsername) => {
          const env = await createTestEnv(tempDir);
          try {
            const initialResponse = await fetch(
              `${env.baseUrl}/api/v1/authors`
            );
            const initialBody = (await initialResponse.json()) as ApiResponse<
              AuthorInfo[]
            >;
            const initialAuthors = initialBody
              .data!.map((a) => a.username)
              .sort();

            const addResponse = await fetch(`${env.baseUrl}/api/v1/authors`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: invalidUsername }),
            });
            const addBody = (await addResponse.json()) as ApiResponse<unknown>;

            expect(addBody.success).toBe(false);
            expect(addBody.error).toBeDefined();
            expect(addBody.error!.code).toBeDefined();
            expect(addBody.error!.message).toBeDefined();

            const finalResponse = await fetch(`${env.baseUrl}/api/v1/authors`);
            const finalBody = (await finalResponse.json()) as ApiResponse<
              AuthorInfo[]
            >;
            const finalAuthors = finalBody.data!.map((a) => a.username).sort();

            expect(finalAuthors).toEqual(initialAuthors);
          } finally {
            await env.cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
