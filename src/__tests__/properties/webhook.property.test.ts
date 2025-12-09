import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { WebhookClient, WebhookPayload } from "../../webhook/webhook-client.js";
import { VideoMetadata } from "../../scraper/tiktok-scraper.js";

/**
 * Property-based tests for WebhookClient
 * Using fast-check library with minimum 100 iterations per property
 */

// Generator for valid VideoMetadata objects
const videoMetadataGen: fc.Arbitrary<VideoMetadata> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  url: fc.webUrl(),
  downloadUrl: fc.webUrl(),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  author: fc.string({ minLength: 1, maxLength: 24 }),
  publishedAt: fc.date({
    min: new Date("2020-01-01"),
    max: new Date("2030-12-31"),
  }),
  thumbnailUrl: fc.option(fc.webUrl(), { nil: undefined }),
  duration: fc.option(fc.integer({ min: 1, max: 3600 }), { nil: undefined }),
  stats: fc.option(
    fc.record({
      plays: fc.integer({ min: 0, max: 1000000000 }),
      likes: fc.integer({ min: 0, max: 1000000000 }),
      comments: fc.integer({ min: 0, max: 1000000000 }),
      shares: fc.integer({ min: 0, max: 1000000000 }),
    }),
    { nil: undefined }
  ),
});

describe("Webhook Property Tests", () => {
  /**
   * **Feature: tiktok-monitor, Property 6: Webhook payload completeness**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any video metadata, the generated webhook payload should contain
   * all required fields: videoId, videoUrl, description, author, and publishedAt.
   */
  describe("Property 6: Webhook payload completeness", () => {
    it("should include all required fields in payload for any video metadata", () => {
      fc.assert(
        fc.property(videoMetadataGen, (video) => {
          const client = new WebhookClient("https://example.com/webhook");
          const payload = client.createPayload(video);

          // Verify all required fields are present
          expect(payload).toHaveProperty("videoId");
          expect(payload).toHaveProperty("videoUrl");
          expect(payload).toHaveProperty("description");
          expect(payload).toHaveProperty("author");
          expect(payload).toHaveProperty("publishedAt");

          // Verify fields are correctly mapped
          expect(payload.videoId).toBe(video.id);
          expect(payload.videoUrl).toBe(video.url);
          expect(payload.description).toBe(video.description);
          expect(payload.author).toBe(video.author);
          expect(payload.publishedAt).toBe(video.publishedAt.toISOString());

          // Verify optional thumbnailUrl is preserved if present
          if (video.thumbnailUrl !== undefined) {
            expect(payload.thumbnailUrl).toBe(video.thumbnailUrl);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should produce valid ISO date string for publishedAt", () => {
      fc.assert(
        fc.property(videoMetadataGen, (video) => {
          const client = new WebhookClient("https://example.com/webhook");
          const payload = client.createPayload(video);

          // Verify publishedAt is a valid ISO date string
          const parsedDate = new Date(payload.publishedAt);
          expect(parsedDate.toISOString()).toBe(payload.publishedAt);

          // Verify it matches the original date
          expect(parsedDate.getTime()).toBe(video.publishedAt.getTime());
        }),
        { numRuns: 100 }
      );
    });

    it("should never have undefined required fields", () => {
      fc.assert(
        fc.property(videoMetadataGen, (video) => {
          const client = new WebhookClient("https://example.com/webhook");
          const payload = client.createPayload(video);

          // All required fields must be defined (not undefined)
          expect(payload.videoId).toBeDefined();
          expect(payload.videoUrl).toBeDefined();
          expect(payload.description).toBeDefined();
          expect(payload.author).toBeDefined();
          expect(payload.publishedAt).toBeDefined();

          // All required fields must be strings
          expect(typeof payload.videoId).toBe("string");
          expect(typeof payload.videoUrl).toBe("string");
          expect(typeof payload.description).toBe("string");
          expect(typeof payload.author).toBe("string");
          expect(typeof payload.publishedAt).toBe("string");
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: tiktok-monitor, Property 7: Retry count bounds**
   * **Validates: Requirements 3.3**
   *
   * For any webhook send operation with failures, the number of retry attempts
   * should not exceed the configured maxRetries value.
   */
  describe("Property 7: Retry count bounds", () => {
    // Generator for maxRetries values (0-10 is reasonable range)
    const maxRetriesGen = fc.integer({ min: 0, max: 10 });

    // Generator for valid webhook payloads
    const webhookPayloadGen: fc.Arbitrary<WebhookPayload> = fc.record({
      videoId: fc.string({ minLength: 1, maxLength: 50 }),
      videoUrl: fc.webUrl(),
      downloadUrl: fc.webUrl(),
      description: fc.string({ minLength: 0, maxLength: 500 }),
      author: fc.string({ minLength: 1, maxLength: 24 }),
      publishedAt: fc.date().map((d) => d.toISOString()),
      thumbnailUrl: fc.option(fc.webUrl(), { nil: undefined }),
      duration: fc.option(fc.integer({ min: 1, max: 600 }), { nil: undefined }),
      stats: fc.option(
        fc.record({
          plays: fc.integer({ min: 0 }),
          likes: fc.integer({ min: 0 }),
          comments: fc.integer({ min: 0 }),
          shares: fc.integer({ min: 0 }),
        }),
        { nil: undefined }
      ),
    });

    // No-op sleep function for fast testing
    const noOpSleep = async (_ms: number): Promise<void> => {};

    it("should never exceed maxRetries + 1 total attempts", async () => {
      // Use a non-existent URL that will fail immediately
      // This tests the retry logic bounds
      await fc.assert(
        fc.asyncProperty(
          maxRetriesGen,
          webhookPayloadGen,
          async (maxRetries, payload) => {
            // Use localhost with invalid port to ensure fast failure
            // Use no-op sleep to avoid delays in tests
            const client = new WebhookClient(
              "http://localhost:1/nonexistent",
              100,
              noOpSleep
            );

            const result = await client.sendWithRetry(payload, maxRetries);

            // Total attempts should be maxRetries + 1 (initial attempt + retries)
            // But should never exceed this bound
            expect(result.attempts).toBeLessThanOrEqual(maxRetries + 1);
            expect(result.attempts).toBeGreaterThanOrEqual(1);

            // Since we're using an invalid URL, it should fail
            expect(result.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should have exactly maxRetries + 1 attempts when all fail", async () => {
      // Test with small maxRetries values to keep test fast
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 3 }),
          webhookPayloadGen,
          async (maxRetries, payload) => {
            const client = new WebhookClient(
              "http://localhost:1/nonexistent",
              100,
              noOpSleep
            );

            const result = await client.sendWithRetry(payload, maxRetries);

            // When all attempts fail, we should have exactly maxRetries + 1 attempts
            expect(result.attempts).toBe(maxRetries + 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
