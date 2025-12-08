import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";
import axios, { AxiosError } from "axios";
import { TikTokScraper } from "./tiktok-scraper.js";

// Mock axios
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  return {
    ...actual,
    default: {
      get: vi.fn(),
      AxiosError: actual.AxiosError,
    },
  };
});

describe("TikTokScraper", () => {
  let scraper: TikTokScraper;
  let mockGet: Mock;

  beforeEach(() => {
    scraper = new TikTokScraper();
    mockGet = axios.get as Mock;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isValidUsername", () => {
    it("should accept valid usernames", () => {
      expect(scraper.isValidUsername("user123")).toBe(true);
      expect(scraper.isValidUsername("test_user")).toBe(true);
      expect(scraper.isValidUsername("user.name")).toBe(true);
      expect(scraper.isValidUsername("a")).toBe(true);
    });

    it("should reject invalid usernames", () => {
      expect(scraper.isValidUsername("")).toBe(false);
      expect(scraper.isValidUsername("_invalid")).toBe(false);
      expect(scraper.isValidUsername(".invalid")).toBe(false);
      expect(scraper.isValidUsername("a".repeat(25))).toBe(false);
      expect(scraper.isValidUsername("user@name")).toBe(false);
      expect(scraper.isValidUsername("user name")).toBe(false);
    });

    it("should reject non-string inputs", () => {
      expect(scraper.isValidUsername(null as unknown as string)).toBe(false);
      expect(scraper.isValidUsername(undefined as unknown as string)).toBe(
        false
      );
      expect(scraper.isValidUsername(123 as unknown as string)).toBe(false);
    });
  });

  describe("getLatestVideos", () => {
    const mockTikWMResponse = {
      code: 0,
      msg: "success",
      data: {
        videos: [
          {
            id: "video123",
            play: "https://example.com/video.mp4",
            title: "Test video description",
            create_time: 1702000000,
            cover: "https://example.com/cover.jpg",
            duration: 30,
            play_count: 1000,
            digg_count: 100,
            comment_count: 50,
            share_count: 25,
          },
        ],
      },
    };

    it("should fetch and parse videos correctly", async () => {
      mockGet.mockResolvedValueOnce({ data: mockTikWMResponse });

      const videos = await scraper.getLatestVideos("testuser");

      expect(videos).toHaveLength(1);
      expect(videos[0]).toMatchObject({
        id: "video123",
        url: "https://www.tiktok.com/@testuser/video/video123",
        downloadUrl: "https://example.com/video.mp4",
        description: "Test video description",
        author: "testuser",
        thumbnailUrl: "https://example.com/cover.jpg",
        duration: 30,
      });
      expect(videos[0].publishedAt).toBeInstanceOf(Date);
      expect(videos[0].stats).toEqual({
        plays: 1000,
        likes: 100,
        comments: 50,
        shares: 25,
      });
    });

    it("should throw error for invalid username", async () => {
      await expect(scraper.getLatestVideos("")).rejects.toThrow(
        "Invalid TikTok username"
      );
    });

    it("should handle API error response", async () => {
      mockGet.mockResolvedValueOnce({
        data: { code: -1, msg: "User not found" },
      });

      await expect(scraper.getLatestVideos("testuser")).rejects.toThrow(
        "TikWM API error: User not found"
      );
    });

    it("should handle rate limiting (429)", async () => {
      const error = new AxiosError("Request failed");
      error.response = { status: 429 } as AxiosError["response"];

      mockGet.mockRejectedValueOnce(error);

      await expect(scraper.getLatestVideos("testuser")).rejects.toThrow(
        "Rate limited"
      );
    });

    it("should handle timeout errors", async () => {
      const error = new AxiosError("timeout");
      error.code = "ECONNABORTED";

      mockGet.mockRejectedValueOnce(error);

      await expect(scraper.getLatestVideos("testuser")).rejects.toThrow(
        "Request timeout"
      );
    });

    it("should handle network errors", async () => {
      const error = new AxiosError("Network Error");

      mockGet.mockRejectedValueOnce(error);

      await expect(scraper.getLatestVideos("testuser")).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle empty video list", async () => {
      mockGet.mockResolvedValueOnce({
        data: { code: 0, msg: "success", data: { videos: [] } },
      });

      const videos = await scraper.getLatestVideos("testuser");
      expect(videos).toHaveLength(0);
    });

    it("should limit request count to 30", async () => {
      mockGet.mockResolvedValueOnce({
        data: { code: 0, msg: "success", data: { videos: [] } },
      });

      await scraper.getLatestVideos("testuser", 50);

      expect(mockGet).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({ count: 30 }),
        })
      );
    });
  });

  describe("getVideoById", () => {
    const mockVideoResponse = {
      code: 0,
      data: {
        id: "video456",
        play: "https://example.com/video.mp4",
        title: "Single video",
        create_time: 1702000000,
        cover: "https://example.com/cover.jpg",
        duration: 45,
        play_count: 500,
        digg_count: 50,
        comment_count: 20,
        share_count: 10,
        author: { unique_id: "author123" },
      },
    };

    it("should fetch single video by ID", async () => {
      mockGet.mockResolvedValueOnce({ data: mockVideoResponse });

      const video = await scraper.getVideoById("video456");

      expect(video).not.toBeNull();
      expect(video?.id).toBe("video456");
      expect(video?.author).toBe("author123");
    });

    it("should return null for invalid video ID", async () => {
      const video = await scraper.getVideoById("");
      expect(video).toBeNull();
    });

    it("should return null when video not found", async () => {
      mockGet.mockResolvedValueOnce({
        data: { code: -1, msg: "Video not found" },
      });

      const video = await scraper.getVideoById("nonexistent");
      expect(video).toBeNull();
    });

    it("should handle rate limiting for single video", async () => {
      const error = new AxiosError("Rate limited");
      error.response = { status: 429 } as AxiosError["response"];

      mockGet.mockRejectedValueOnce(error);

      await expect(scraper.getVideoById("video123")).rejects.toThrow(
        "Rate limited"
      );
    });

    it("should return null for other network errors", async () => {
      const error = new AxiosError("Network Error");

      mockGet.mockRejectedValueOnce(error);

      const video = await scraper.getVideoById("video123");
      expect(video).toBeNull();
    });
  });

  describe("constructor", () => {
    it("should use default timeout", () => {
      const defaultScraper = new TikTokScraper();
      expect(defaultScraper).toBeDefined();
    });

    it("should accept custom config", () => {
      const customScraper = new TikTokScraper({
        timeout: 5000,
        userAgent: "CustomAgent/1.0",
      });
      expect(customScraper).toBeDefined();
    });
  });
});
