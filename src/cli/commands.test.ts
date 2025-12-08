// CLI Commands Unit Tests
// Requirements: 5.1, 5.2

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CLI, CLIOutput } from "./commands.js";
import { ConfigManager } from "../config/config-manager.js";
import { StateManager, ProcessedVideo } from "../state/state-manager.js";
import { PollingScheduler } from "../scheduler/polling-scheduler.js";

// Mock output collector for testing
function createMockOutput(): CLIOutput & {
  messages: string[];
  errors: string[];
} {
  const messages: string[] = [];
  const errors: string[] = [];
  return {
    messages,
    errors,
    print: (message: string) => messages.push(message),
    error: (message: string) => errors.push(message),
  };
}

// Mock ConfigManager
function createMockConfigManager(
  config = {
    webhookUrl: "https://example.com/webhook",
    pollingInterval: 300,
    authors: ["author1", "author2"],
    maxRetries: 3,
  }
) {
  const mockConfig = { ...config };
  return {
    getConfig: vi.fn(() => ({ ...mockConfig })),
    getAuthors: vi.fn(() => [...mockConfig.authors]),
    addAuthor: vi.fn(async (username: string) => {
      mockConfig.authors.push(username);
    }),
    removeAuthor: vi.fn(async (username: string) => {
      const index = mockConfig.authors.indexOf(username);
      if (index > -1) mockConfig.authors.splice(index, 1);
    }),
    setWebhookUrl: vi.fn(async (url: string) => {
      mockConfig.webhookUrl = url;
    }),
    setPollingInterval: vi.fn(async (interval: number) => {
      mockConfig.pollingInterval = interval;
    }),
    save: vi.fn(),
    load: vi.fn(),
  } as unknown as ConfigManager;
}

// Mock StateManager
function createMockStateManager(videos: ProcessedVideo[] = []) {
  const processedVideos = new Map(videos.map((v) => [v.videoId, v]));
  const lastCheckTimes = new Map<string, Date>();

  return {
    getHistory: vi.fn((limit: number) => {
      const sorted = [...processedVideos.values()].sort(
        (a, b) => b.processedAt.getTime() - a.processedAt.getTime()
      );
      return sorted.slice(0, Math.min(limit, 100));
    }),
    getLastCheckTime: vi.fn(
      (author: string) => lastCheckTimes.get(author) ?? null
    ),
    isProcessed: vi.fn((videoId: string) => processedVideos.has(videoId)),
    markProcessed: vi.fn(),
    updateLastCheckTime: vi.fn(async (author: string) => {
      lastCheckTimes.set(author, new Date());
    }),
    load: vi.fn(),
    save: vi.fn(),
  } as unknown as StateManager;
}

// Mock PollingScheduler
function createMockScheduler(running = false) {
  let isRunning = running;
  return {
    start: vi.fn(() => {
      isRunning = true;
    }),
    stop: vi.fn(() => {
      isRunning = false;
    }),
    isRunning: vi.fn(() => isRunning),
    setInterval: vi.fn(),
    runOnce: vi.fn(),
  } as unknown as PollingScheduler;
}

describe("CLI", () => {
  let cli: CLI;
  let output: ReturnType<typeof createMockOutput>;
  let configManager: ReturnType<typeof createMockConfigManager>;
  let stateManager: ReturnType<typeof createMockStateManager>;

  beforeEach(() => {
    output = createMockOutput();
    configManager = createMockConfigManager();
    stateManager = createMockStateManager();
    cli = new CLI(
      configManager as unknown as ConfigManager,
      stateManager as unknown as StateManager,
      output
    );
  });

  describe("addAuthor", () => {
    it("should add a valid author", async () => {
      await cli.addAuthor("newauthor");

      expect(configManager.addAuthor).toHaveBeenCalledWith("newauthor");
      expect(output.messages).toContain("Added author: newauthor");
      expect(output.errors).toHaveLength(0);
    });

    it("should reject invalid username format", async () => {
      await cli.addAuthor("");

      expect(configManager.addAuthor).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
      expect(output.errors[0]).toContain("Error:");
    });

    it("should reject username with invalid characters", async () => {
      await cli.addAuthor("user@name!");

      expect(configManager.addAuthor).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
    });
  });

  describe("removeAuthor", () => {
    it("should remove an existing author", async () => {
      await cli.removeAuthor("author1");

      expect(configManager.removeAuthor).toHaveBeenCalledWith("author1");
      expect(output.messages).toContain("Removed author: author1");
    });

    it("should show error for non-existent author", async () => {
      await cli.removeAuthor("nonexistent");

      expect(configManager.removeAuthor).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
      expect(output.errors[0]).toContain("not in the monitoring list");
    });
  });

  describe("listAuthors", () => {
    it("should list all authors", () => {
      cli.listAuthors();

      expect(output.messages).toContain("Monitored authors:");
      expect(output.messages.some((m) => m.includes("author1"))).toBe(true);
      expect(output.messages.some((m) => m.includes("author2"))).toBe(true);
    });

    it("should show message when no authors configured", () => {
      configManager = createMockConfigManager({
        webhookUrl: "https://example.com/webhook",
        pollingInterval: 300,
        authors: [],
        maxRetries: 3,
      });
      cli = new CLI(
        configManager as unknown as ConfigManager,
        stateManager as unknown as StateManager,
        output
      );

      cli.listAuthors();

      expect(output.messages).toContain("No authors configured.");
    });
  });

  describe("status", () => {
    it("should display status information", () => {
      cli.status();

      expect(
        output.messages.some((m) => m.includes("TikTok Monitor Status"))
      ).toBe(true);
      expect(output.messages.some((m) => m.includes("Stopped"))).toBe(true);
      expect(output.messages.some((m) => m.includes("300s"))).toBe(true);
    });

    it("should show running status when scheduler is active", () => {
      const scheduler = createMockScheduler(true);
      cli.setScheduler(scheduler as unknown as PollingScheduler);

      cli.status();

      expect(output.messages.some((m) => m.includes("Running"))).toBe(true);
    });

    it("should show last check times for authors", () => {
      const mockState = createMockStateManager();
      (
        mockState.getLastCheckTime as ReturnType<typeof vi.fn>
      ).mockImplementation((author: string) => {
        if (author === "author1") return new Date("2025-12-08T10:00:00Z");
        return null;
      });
      cli = new CLI(
        configManager as unknown as ConfigManager,
        mockState as unknown as StateManager,
        output
      );

      cli.status();

      expect(
        output.messages.some(
          (m) => m.includes("author1") && m.includes("2025-12-08")
        )
      ).toBe(true);
      expect(
        output.messages.some(
          (m) => m.includes("author2") && m.includes("never")
        )
      ).toBe(true);
    });
  });

  describe("history", () => {
    it("should display processing history", () => {
      const videos: ProcessedVideo[] = [
        {
          videoId: "video1",
          author: "author1",
          processedAt: new Date("2025-12-08T10:00:00Z"),
          webhookStatus: "sent",
          retryCount: 0,
        },
        {
          videoId: "video2",
          author: "author2",
          processedAt: new Date("2025-12-08T09:00:00Z"),
          webhookStatus: "failed",
          retryCount: 3,
        },
      ];
      stateManager = createMockStateManager(videos);
      cli = new CLI(
        configManager as unknown as ConfigManager,
        stateManager as unknown as StateManager,
        output
      );

      cli.history();

      expect(
        output.messages.some((m) => m.includes("Processing History"))
      ).toBe(true);
      expect(
        output.messages.some((m) => m.includes("video1") && m.includes("sent"))
      ).toBe(true);
      expect(
        output.messages.some(
          (m) => m.includes("video2") && m.includes("failed")
        )
      ).toBe(true);
    });

    it("should show message when no history", () => {
      cli.history();

      expect(output.messages).toContain("No videos processed yet.");
    });

    it("should respect limit parameter", () => {
      const videos: ProcessedVideo[] = Array.from({ length: 10 }, (_, i) => ({
        videoId: `video${i}`,
        author: "author1",
        processedAt: new Date(Date.now() - i * 1000),
        webhookStatus: "sent" as const,
        retryCount: 0,
      }));
      stateManager = createMockStateManager(videos);
      cli = new CLI(
        configManager as unknown as ConfigManager,
        stateManager as unknown as StateManager,
        output
      );

      cli.history(5);

      expect(stateManager.getHistory).toHaveBeenCalledWith(5);
    });

    it("should cap limit at 100", () => {
      cli.history(200);

      expect(stateManager.getHistory).toHaveBeenCalledWith(100);
    });
  });

  describe("config", () => {
    it("should show all config when no key specified", async () => {
      await cli.config("all");

      expect(output.messages.some((m) => m.includes("Configuration"))).toBe(
        true
      );
      expect(output.messages.some((m) => m.includes("webhookUrl"))).toBe(true);
      expect(output.messages.some((m) => m.includes("pollingInterval"))).toBe(
        true
      );
    });

    it("should show specific config value", async () => {
      await cli.config("webhookUrl");

      expect(
        output.messages.some(
          (m) => m.includes("webhookUrl") && m.includes("example.com")
        )
      ).toBe(true);
    });

    it("should set webhookUrl", async () => {
      await cli.config("webhookUrl", "https://new.example.com/webhook");

      expect(configManager.setWebhookUrl).toHaveBeenCalledWith(
        "https://new.example.com/webhook"
      );
      expect(output.messages.some((m) => m.includes("Set webhookUrl"))).toBe(
        true
      );
    });

    it("should reject invalid webhookUrl", async () => {
      await cli.config("webhookUrl", "not-a-url");

      expect(configManager.setWebhookUrl).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
    });

    it("should set pollingInterval", async () => {
      await cli.config("pollingInterval", "600");

      expect(configManager.setPollingInterval).toHaveBeenCalledWith(600);
      expect(
        output.messages.some((m) => m.includes("Set pollingInterval"))
      ).toBe(true);
    });

    it("should reject invalid pollingInterval", async () => {
      await cli.config("pollingInterval", "30"); // Below minimum

      expect(configManager.setPollingInterval).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
    });

    it("should reject pollingInterval above maximum", async () => {
      await cli.config("pollingInterval", "5000"); // Above maximum

      expect(configManager.setPollingInterval).not.toHaveBeenCalled();
      expect(output.errors.length).toBeGreaterThan(0);
    });

    it("should show error for unknown config key", async () => {
      await cli.config("unknownKey");

      expect(output.errors.some((m) => m.includes("Unknown config key"))).toBe(
        true
      );
    });
  });

  describe("start", () => {
    it("should show error when webhook URL not configured", async () => {
      configManager = createMockConfigManager({
        webhookUrl: "",
        pollingInterval: 300,
        authors: ["author1"],
        maxRetries: 3,
      });
      cli = new CLI(
        configManager as unknown as ConfigManager,
        stateManager as unknown as StateManager,
        output
      );

      await cli.start();

      expect(
        output.errors.some((m) => m.includes("Webhook URL is not configured"))
      ).toBe(true);
    });

    it("should show error when no authors configured", async () => {
      configManager = createMockConfigManager({
        webhookUrl: "https://example.com/webhook",
        pollingInterval: 300,
        authors: [],
        maxRetries: 3,
      });
      cli = new CLI(
        configManager as unknown as ConfigManager,
        stateManager as unknown as StateManager,
        output
      );

      await cli.start();

      expect(
        output.errors.some((m) => m.includes("No authors configured"))
      ).toBe(true);
    });

    it("should show message when already running", async () => {
      const scheduler = createMockScheduler(true);
      cli.setScheduler(scheduler as unknown as PollingScheduler);

      await cli.start();

      expect(output.messages).toContain("Monitor is already running.");
    });
  });

  describe("stop", () => {
    it("should show message when not running", () => {
      cli.stop();

      expect(output.messages).toContain("Monitor is not running.");
    });

    it("should stop running scheduler", () => {
      const scheduler = createMockScheduler(true);
      cli.setScheduler(scheduler as unknown as PollingScheduler);

      cli.stop();

      expect(scheduler.stop).toHaveBeenCalled();
      expect(output.messages).toContain("Monitor stopped.");
    });
  });
});

describe("Output formatting", () => {
  it("should format dates correctly in history", () => {
    const output = createMockOutput();
    const configManager = createMockConfigManager();
    const videos: ProcessedVideo[] = [
      {
        videoId: "video1",
        author: "author1",
        processedAt: new Date("2025-12-08T10:30:45Z"),
        webhookStatus: "sent",
        retryCount: 0,
      },
    ];
    const stateManager = createMockStateManager(videos);
    const cli = new CLI(
      configManager as unknown as ConfigManager,
      stateManager as unknown as StateManager,
      output
    );

    cli.history();

    // Check that date is formatted as YYYY-MM-DD HH:MM:SS
    expect(output.messages.some((m) => m.includes("2025-12-08 10:30:45"))).toBe(
      true
    );
  });

  it("should show correct status icons", () => {
    const output = createMockOutput();
    const configManager = createMockConfigManager();
    const videos: ProcessedVideo[] = [
      {
        videoId: "v1",
        author: "a1",
        processedAt: new Date(),
        webhookStatus: "sent",
        retryCount: 0,
      },
      {
        videoId: "v2",
        author: "a2",
        processedAt: new Date(),
        webhookStatus: "failed",
        retryCount: 3,
      },
      {
        videoId: "v3",
        author: "a3",
        processedAt: new Date(),
        webhookStatus: "pending",
        retryCount: 0,
      },
    ];
    const stateManager = createMockStateManager(videos);
    const cli = new CLI(
      configManager as unknown as ConfigManager,
      stateManager as unknown as StateManager,
      output
    );

    cli.history();

    expect(
      output.messages.some((m) => m.includes("✓") && m.includes("sent"))
    ).toBe(true);
    expect(
      output.messages.some((m) => m.includes("✗") && m.includes("failed"))
    ).toBe(true);
    expect(
      output.messages.some((m) => m.includes("○") && m.includes("pending"))
    ).toBe(true);
  });
});
