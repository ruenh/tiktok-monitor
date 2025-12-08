import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { StateManager, ProcessedVideo } from "../../state/state-manager.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Property-based tests for StateManager
 * Using fast-check library with minimum 100 iterations per property
 */

// Generator for valid video IDs (TikTok video IDs are numeric strings)
const videoIdGen = fc
  .stringOf(fc.constantFrom(..."0123456789".split("")), {
    minLength: 10,
    maxLength: 20,
  })
  .filter((s) => s.length >= 10);

// Generator for valid TikTok usernames
const validUsernameGen = fc
  .tuple(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(
        ""
      )
    ),
    fc.array(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_".split(
          ""
        )
      ),
      { minLength: 0, maxLength: 22 }
    )
  )
  .map(([first, middle]) => first + middle.join(""))
  .filter((s) => s.length >= 1 && s.length <= 24);

// Generator for webhook status
const webhookStatusGen = fc.constantFrom<"pending" | "sent" | "failed">(
  "pending",
  "sent",
  "failed"
);

// Generator for ProcessedVideo
const processedVideoGen = fc.record({
  videoId: videoIdGen,
  author: validUsernameGen,
  processedAt: fc.date({
    min: new Date("2020-01-01"),
    max: new Date("2030-01-01"),
  }),
  webhookStatus: webhookStatusGen,
  retryCount: fc.integer({ min: 0, max: 10 }),
});

describe("State Property Tests", () => {
  /**
   * **Feature: tiktok-monitor, Property 4: Video deduplication**
   * **Validates: Requirements 2.2**
   *
   * For any video ID that has been processed, attempting to process it again
   * should not trigger a webhook call (the video should be marked as processed).
   */
  describe("Property 4: Video deduplication", () => {
    it("should mark video as processed after markProcessed is called", async () => {
      await fc.assert(
        fc.asyncProperty(processedVideoGen, async (video) => {
          const tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "state-test-")
          );
          const statePath = path.join(tempDir, "state.json");

          try {
            const manager = new StateManager(statePath);

            // Initially, video should not be processed
            expect(manager.isProcessed(video.videoId)).toBe(false);

            // Mark as processed
            await manager.markProcessed(video);

            // Now it should be marked as processed
            expect(manager.isProcessed(video.videoId)).toBe(true);

            // Marking again should still show as processed (idempotent)
            await manager.markProcessed(video);
            expect(manager.isProcessed(video.videoId)).toBe(true);
          } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should correctly identify processed vs unprocessed videos", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 1, maxLength: 10 }),
          videoIdGen,
          async (processedVideos, unprocessedId) => {
            // Ensure unprocessedId is not in the processed list
            const processedIds = processedVideos.map((v) => v.videoId);
            if (processedIds.includes(unprocessedId)) {
              return; // Skip this case
            }

            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              const manager = new StateManager(statePath);

              // Mark all videos as processed
              for (const video of processedVideos) {
                await manager.markProcessed(video);
              }

              // All processed videos should be marked
              for (const video of processedVideos) {
                expect(manager.isProcessed(video.videoId)).toBe(true);
              }

              // Unprocessed video should not be marked
              expect(manager.isProcessed(unprocessedId)).toBe(false);
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
   * **Feature: tiktok-monitor, Property 5: State persistence across restarts**
   * **Validates: Requirements 2.3**
   *
   * For any set of processed videos, after saving state and loading it again,
   * all previously processed videos should still be marked as processed.
   */
  describe("Property 5: State persistence across restarts", () => {
    it("should preserve processed videos through save/load cycle", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(processedVideoGen, { minLength: 1, maxLength: 20 }),
          async (videos) => {
            // Deduplicate by videoId to avoid overwriting
            const uniqueVideos = Array.from(
              new Map(videos.map((v) => [v.videoId, v])).values()
            );

            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-persist-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              // Create first manager and add videos
              const manager1 = new StateManager(statePath);
              for (const video of uniqueVideos) {
                await manager1.markProcessed(video);
              }

              // Create new manager (simulating restart) and load
              const manager2 = new StateManager(statePath);
              await manager2.load();

              // All videos should still be marked as processed
              for (const video of uniqueVideos) {
                expect(manager2.isProcessed(video.videoId)).toBe(true);
              }

              // Verify video data is preserved
              const history = manager2.getHistory(uniqueVideos.length);
              expect(history.length).toBe(uniqueVideos.length);

              for (const video of uniqueVideos) {
                const found = history.find((h) => h.videoId === video.videoId);
                expect(found).toBeDefined();
                expect(found?.author).toBe(video.author);
                expect(found?.webhookStatus).toBe(video.webhookStatus);
                expect(found?.retryCount).toBe(video.retryCount);
              }
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve lastCheckTimes through save/load cycle", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validUsernameGen, { minLength: 1, maxLength: 10 }),
          async (authors) => {
            // Deduplicate authors
            const uniqueAuthors = [...new Set(authors)];

            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-time-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              // Create first manager and update check times
              const manager1 = new StateManager(statePath);
              for (const author of uniqueAuthors) {
                await manager1.updateLastCheckTime(author);
              }

              // Create new manager and load
              const manager2 = new StateManager(statePath);
              await manager2.load();

              // All check times should be preserved
              for (const author of uniqueAuthors) {
                const checkTime = manager2.getLastCheckTime(author);
                expect(checkTime).not.toBeNull();
                expect(checkTime).toBeInstanceOf(Date);
              }
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
   * **Feature: tiktok-monitor, Property 9: History limit enforcement**
   * **Validates: Requirements 5.2**
   *
   * For any state with N processed videos where N > 100,
   * requesting history should return exactly 100 items.
   */
  describe("Property 9: History limit enforcement", () => {
    it("should limit history to 100 items when more videos exist", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 101, max: 150 }),
          async (videoCount) => {
            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-history-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              const manager = new StateManager(statePath);

              // Build state directly without individual saves for performance
              const videos: ProcessedVideo[] = [];
              for (let i = 0; i < videoCount; i++) {
                videos.push({
                  videoId: `video_${i.toString().padStart(6, "0")}`,
                  author: "testauthor",
                  processedAt: new Date(Date.now() - i * 1000),
                  webhookStatus: "sent",
                  retryCount: 0,
                });
              }

              // Add all videos at once (only last one triggers save)
              for (const video of videos) {
                manager["state"].processedVideos.set(video.videoId, video);
              }
              await manager.save();

              // Request history without limit
              const history = manager.getHistory();

              // Should return exactly 100 items
              expect(history.length).toBe(100);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return all items when count is less than or equal to 100", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100 }),
          async (videoCount) => {
            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-history-small-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              const manager = new StateManager(statePath);

              // Build state directly for performance
              for (let i = 0; i < videoCount; i++) {
                manager["state"].processedVideos.set(
                  `video_${i.toString().padStart(6, "0")}`,
                  {
                    videoId: `video_${i.toString().padStart(6, "0")}`,
                    author: "testauthor",
                    processedAt: new Date(Date.now() - i * 1000),
                    webhookStatus: "sent",
                    retryCount: 0,
                  }
                );
              }
              await manager.save();

              // Request history
              const history = manager.getHistory();

              // Should return all items
              expect(history.length).toBe(videoCount);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should respect custom limit when less than 100", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 150 }),
          fc.integer({ min: 1, max: 99 }),
          async (videoCount, requestedLimit) => {
            const tempDir = await fs.mkdtemp(
              path.join(os.tmpdir(), "state-history-limit-test-")
            );
            const statePath = path.join(tempDir, "state.json");

            try {
              const manager = new StateManager(statePath);

              // Build state directly for performance
              for (let i = 0; i < videoCount; i++) {
                manager["state"].processedVideos.set(
                  `video_${i.toString().padStart(6, "0")}`,
                  {
                    videoId: `video_${i.toString().padStart(6, "0")}`,
                    author: "testauthor",
                    processedAt: new Date(Date.now() - i * 1000),
                    webhookStatus: "sent",
                    retryCount: 0,
                  }
                );
              }
              await manager.save();

              // Request history with custom limit
              const history = manager.getHistory(requestedLimit);

              // Should return min(requestedLimit, videoCount)
              const expectedCount = Math.min(requestedLimit, videoCount);
              expect(history.length).toBe(expectedCount);
            } finally {
              await fs.rm(tempDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
