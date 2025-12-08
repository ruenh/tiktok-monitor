import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  validateUsername,
  validatePollingInterval,
  validateConfig,
  ConfigManager,
  Config,
} from "../../config/config-manager.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Property-based tests for ConfigManager
 * Using fast-check library with minimum 100 iterations per property
 */

// Generators for valid TikTok usernames
const validUsernameChar = fc.constantFrom(
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split("")
);

const validUsernameGen = fc
  .tuple(
    // First char: letter, number, or underscore (not period)
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
        ""
      )
    ),
    // Middle chars (0-22): letters, numbers, underscores, periods (no consecutive periods)
    fc.array(validUsernameChar, { minLength: 0, maxLength: 22 })
  )
  .map(([first, middle]) => first + middle.join(""))
  .filter((s) => s.length >= 1 && s.length <= 24 && !s.includes(".."));

// Generator for invalid usernames
const invalidUsernameGen = fc.oneof(
  // Empty string
  fc.constant(""),
  // Whitespace only
  fc.stringOf(fc.constantFrom(" ", "\t", "\n"), { minLength: 1, maxLength: 5 }),
  // Too long (>24 chars)
  fc.string({ minLength: 25, maxLength: 50 }),
  // Contains invalid characters
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constantFrom("@", "#", "$", "%", "!", " ", "-"),
      fc.string({ minLength: 1, maxLength: 10 })
    )
    .map(([a, invalid, b]) => a + invalid + b),
  // Starts with period
  fc.string({ minLength: 1, maxLength: 23 }).map((s) => "." + s),
  // Consecutive periods
  fc
    .tuple(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.string({ minLength: 1, maxLength: 10 })
    )
    .map(
      ([a, b]) =>
        a.replace(/[^a-zA-Z0-9]/g, "a") + ".." + b.replace(/[^a-zA-Z0-9]/g, "b")
    )
);

describe("Config Property Tests", () => {
  /**
   * **Feature: tiktok-monitor, Property 2: Invalid username rejection**
   * **Validates: Requirements 1.3**
   *
   * For any string that does not match the valid TikTok username pattern
   * (empty, contains invalid characters, exceeds length limits),
   * the system should reject it.
   */
  describe("Property 2: Invalid username rejection", () => {
    it("should reject all invalid usernames", () => {
      fc.assert(
        fc.property(invalidUsernameGen, (invalidUsername) => {
          const result = validateUsername(invalidUsername);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should accept all valid usernames", () => {
      fc.assert(
        fc.property(validUsernameGen, (validUsername) => {
          const result = validateUsername(validUsername);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: tiktok-monitor, Property 8: Polling interval validation**
   * **Validates: Requirements 4.2, 4.3**
   *
   * For any numeric value, the system should accept it as polling interval
   * if and only if it is between 60 and 3600 seconds inclusive.
   */
  describe("Property 8: Polling interval validation", () => {
    // Generator for valid polling intervals (60-3600)
    const validIntervalGen = fc.integer({ min: 60, max: 3600 });

    // Generator for invalid polling intervals
    const invalidIntervalGen = fc.oneof(
      fc.integer({ min: -1000, max: 59 }), // Too low
      fc.integer({ min: 3601, max: 100000 }) // Too high
    );

    it("should accept all valid polling intervals (60-3600)", () => {
      fc.assert(
        fc.property(validIntervalGen, (interval) => {
          const result = validatePollingInterval(interval);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject all invalid polling intervals", () => {
      fc.assert(
        fc.property(invalidIntervalGen, (interval) => {
          const result = validatePollingInterval(interval);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject non-integer values", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 60.01, max: 3599.99, noInteger: true }),
          (interval) => {
            const result = validatePollingInterval(interval);
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: tiktok-monitor, Property 3: Configuration persistence round-trip**
   * **Validates: Requirements 1.4, 6.1, 6.2, 6.3**
   *
   * For any valid configuration object, saving it to storage and then
   * loading it should produce an equivalent configuration object.
   */
  describe("Property 3: Configuration persistence round-trip", () => {
    // Generator for valid Config objects
    const validConfigGen = fc.record({
      webhookUrl: fc.webUrl(),
      pollingInterval: fc.integer({ min: 60, max: 3600 }),
      authors: fc.array(validUsernameGen, { minLength: 0, maxLength: 5 }),
      maxRetries: fc.integer({ min: 0, max: 10 }),
    });

    it("should preserve config through save/load cycle", async () => {
      await fc.assert(
        fc.asyncProperty(validConfigGen, async (config) => {
          // Create temp file for this test
          const tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "config-test-")
          );
          const configPath = path.join(tempDir, "config.json");

          try {
            const manager = new ConfigManager(configPath);

            // Save the config
            await manager.save(config);

            // Create new manager and load
            const manager2 = new ConfigManager(configPath);
            const loaded = await manager2.load();

            // Verify round-trip
            expect(loaded.webhookUrl).toBe(config.webhookUrl);
            expect(loaded.pollingInterval).toBe(config.pollingInterval);
            expect(loaded.authors).toEqual(config.authors);
            expect(loaded.maxRetries).toBe(config.maxRetries);
          } finally {
            // Cleanup
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: tiktok-monitor, Property 1: Author management round-trip**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any list of authors and any valid username, adding an author
   * and then removing it should restore the original list state.
   */
  describe("Property 1: Author management round-trip", () => {
    it("should restore original state after add then remove", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validUsernameGen, { minLength: 0, maxLength: 5 }),
          validUsernameGen,
          async (initialAuthors, newAuthor) => {
            // Skip if newAuthor already in list (would be no-op on add)
            if (initialAuthors.includes(newAuthor)) {
              return;
            }

            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "author-test-")
            );
            const configPath = path.join(tempDir, "config.json");

            try {
              const manager = new ConfigManager(configPath);

              // Set initial config with authors
              await manager.save({
                webhookUrl: "https://example.com/webhook",
                pollingInterval: 300,
                authors: [...initialAuthors],
                maxRetries: 3,
              });

              // Reload to ensure we're working with persisted state
              await manager.load();
              const beforeAdd = manager.getAuthors();

              // Add author
              await manager.addAuthor(newAuthor);
              const afterAdd = manager.getAuthors();
              expect(afterAdd).toContain(newAuthor);
              expect(afterAdd.length).toBe(beforeAdd.length + 1);

              // Remove author
              await manager.removeAuthor(newAuthor);
              const afterRemove = manager.getAuthors();

              // Should be back to original state
              expect(afterRemove).toEqual(beforeAdd);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: tiktok-monitor, Property 10: Config serialization round-trip**
   * **Validates: Requirements 6.1, 6.2, 6.3**
   *
   * For any valid Config object, serializing to JSON and parsing back
   * should produce an equivalent Config object.
   */
  describe("Property 10: Config serialization round-trip", () => {
    const validConfigGen = fc.record({
      webhookUrl: fc.webUrl(),
      pollingInterval: fc.integer({ min: 60, max: 3600 }),
      authors: fc.array(validUsernameGen, { minLength: 0, maxLength: 5 }),
      maxRetries: fc.integer({ min: 0, max: 10 }),
    });

    it("should preserve config through JSON serialize/deserialize", () => {
      fc.assert(
        fc.property(validConfigGen, (config) => {
          // Serialize to JSON
          const json = JSON.stringify(config, null, 2);

          // Parse back
          const parsed = JSON.parse(json) as Config;

          // Verify equivalence
          expect(parsed.webhookUrl).toBe(config.webhookUrl);
          expect(parsed.pollingInterval).toBe(config.pollingInterval);
          expect(parsed.authors).toEqual(config.authors);
          expect(parsed.maxRetries).toBe(config.maxRetries);

          // Verify the parsed config is valid
          const validation = validateConfig(parsed);
          expect(validation.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
