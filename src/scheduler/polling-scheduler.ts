// PollingScheduler - manages periodic video checks
// Requirements: 2.1, 2.2, 3.1

import { ConfigManager, Config } from "../config/config-manager.js";
import { StateManager, ProcessedVideo } from "../state/state-manager.js";
import { TikTokScraper, VideoMetadata } from "../scraper/tiktok-scraper.js";
import { WebhookClient } from "../webhook/webhook-client.js";

export interface PollingSchedulerConfig {
  configManager: ConfigManager;
  stateManager: StateManager;
  scraper: TikTokScraper;
  webhookClient: WebhookClient;
  logger?: (message: string) => void;
}

/**
 * PollingScheduler class - manages periodic video checks
 * Requirements: 2.1, 2.2, 3.1
 */
export class PollingScheduler {
  private configManager: ConfigManager;
  private stateManager: StateManager;
  private scraper: TikTokScraper;
  private webhookClient: WebhookClient;
  private logger: (message: string) => void;

  private running: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private currentInterval: number = 300; // Default 5 minutes

  constructor(config: PollingSchedulerConfig) {
    this.configManager = config.configManager;
    this.stateManager = config.stateManager;
    this.scraper = config.scraper;
    this.webhookClient = config.webhookClient;
    this.logger = config.logger ?? console.log;
  }

  /**
   * Start the polling loop
   * Requirements: 2.1
   */
  start(): void {
    if (this.running) {
      this.logger("Polling scheduler is already running");
      return;
    }

    const appConfig = this.configManager.getConfig();
    this.currentInterval = appConfig.pollingInterval;
    this.running = true;

    this.logger(
      `Starting polling scheduler with interval ${this.currentInterval}s`
    );

    // Run immediately on start
    this.runOnce().catch((error) => {
      this.logger(`Error during initial poll: ${error.message}`);
    });

    // Set up interval for subsequent polls
    this.intervalId = setInterval(() => {
      this.runOnce().catch((error) => {
        this.logger(`Error during poll: ${error.message}`);
      });
    }, this.currentInterval * 1000);
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    if (!this.running) {
      this.logger("Polling scheduler is not running");
      return;
    }

    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger("Polling scheduler stopped");
  }

  /**
   * Check if the scheduler is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Update the polling interval
   * Requirements: 4.2
   */
  setInterval(seconds: number): void {
    const wasRunning = this.running;

    if (wasRunning) {
      // Stop without resetting interval
      this.running = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }

    this.currentInterval = seconds;

    // If was running, restart with new interval
    if (wasRunning) {
      this.running = true;
      this.logger(
        `Restarting polling scheduler with interval ${this.currentInterval}s`
      );

      this.intervalId = setInterval(() => {
        this.runOnce().catch((error) => {
          this.logger(`Error during poll: ${error.message}`);
        });
      }, this.currentInterval * 1000);
    }
  }

  /**
   * Run a single poll cycle
   * Requirements: 2.1, 2.2, 3.1
   */
  async runOnce(): Promise<void> {
    const appConfig = this.configManager.getConfig();
    const authors = appConfig.authors;

    if (authors.length === 0) {
      this.logger("No authors configured for monitoring");
      return;
    }

    this.logger(`Checking ${authors.length} author(s) for new videos...`);

    for (const author of authors) {
      try {
        await this.checkAuthor(author, appConfig);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger(`Error checking author ${author}: ${errorMessage}`);
      }

      // Add small delay between authors to avoid rate limiting
      if (authors.indexOf(author) < authors.length - 1) {
        await this.delay(1000 + Math.random() * 2000); // 1-3 seconds
      }
    }

    this.logger("Poll cycle completed");
  }

  /**
   * Check a single author for new videos
   * Requirements: 2.1, 2.2, 3.1
   */
  private async checkAuthor(author: string, config: Config): Promise<void> {
    this.logger(`Checking author: ${author}`);

    // Fetch latest videos
    const videos = await this.scraper.getLatestVideos(author, 10);

    // Filter out already processed videos
    const newVideos = videos.filter(
      (video) => !this.stateManager.isProcessed(video.id)
    );

    if (newVideos.length === 0) {
      this.logger(`No new videos from ${author}`);
      await this.stateManager.updateLastCheckTime(author);
      return;
    }

    this.logger(`Found ${newVideos.length} new video(s) from ${author}`);

    // Sort by publish date (oldest first for correct processing order)
    newVideos.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

    // Process each new video
    for (const video of newVideos) {
      await this.processVideo(video, config);
    }

    // Update last check time
    await this.stateManager.updateLastCheckTime(author);
  }

  /**
   * Process a single video - mark as processed and send webhook
   * Requirements: 2.2, 3.1, 3.2, 3.3, 3.4
   */
  private async processVideo(
    video: VideoMetadata,
    config: Config
  ): Promise<void> {
    this.logger(`Processing video: ${video.id} from ${video.author}`);

    // Create processed video record with pending status
    const processedVideo: ProcessedVideo = {
      videoId: video.id,
      author: video.author,
      processedAt: new Date(),
      webhookStatus: "pending",
      retryCount: 0,
    };

    // Mark as processed first to prevent duplicates
    await this.stateManager.markProcessed(processedVideo);

    // Create webhook payload
    const payload = this.webhookClient.createPayload(video);

    // Send webhook with retry
    const result = await this.webhookClient.sendWithRetry(
      payload,
      config.maxRetries
    );

    // Update status based on result
    if (result.success) {
      await this.stateManager.updateWebhookStatus(
        video.id,
        "sent",
        result.attempts
      );
      this.logger(
        `Successfully sent webhook for video ${video.id} (${result.attempts} attempt(s))`
      );
    } else {
      await this.stateManager.updateWebhookStatus(
        video.id,
        "failed",
        result.attempts
      );
      this.logger(
        `Failed to send webhook for video ${video.id} after ${result.attempts} attempt(s): ${result.error}`
      );
    }
  }

  /**
   * Retry failed webhooks
   * Requirements: 3.3, 3.4
   */
  async retryFailedWebhooks(): Promise<void> {
    const config = this.configManager.getConfig();
    const pendingRetries = this.stateManager.getPendingRetries();

    if (pendingRetries.length === 0) {
      this.logger("No failed webhooks to retry");
      return;
    }

    this.logger(`Retrying ${pendingRetries.length} failed webhook(s)...`);

    for (const video of pendingRetries) {
      // Skip if already exceeded max retries
      if (video.retryCount >= config.maxRetries) {
        this.logger(`Video ${video.videoId} exceeded max retries, skipping`);
        continue;
      }

      // Fetch video metadata again for retry
      const videoMetadata = await this.scraper.getVideoById(video.videoId);
      if (!videoMetadata) {
        this.logger(
          `Could not fetch metadata for video ${video.videoId}, skipping retry`
        );
        continue;
      }

      const payload = this.webhookClient.createPayload(videoMetadata);
      const result = await this.webhookClient.sendWithRetry(
        payload,
        config.maxRetries - video.retryCount
      );

      const newRetryCount = video.retryCount + result.attempts;

      if (result.success) {
        await this.stateManager.updateWebhookStatus(
          video.videoId,
          "sent",
          newRetryCount
        );
        this.logger(`Retry successful for video ${video.videoId}`);
      } else {
        await this.stateManager.updateWebhookStatus(
          video.videoId,
          "failed",
          newRetryCount
        );
        this.logger(`Retry failed for video ${video.videoId}`);
      }
    }
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current polling interval
   */
  getInterval(): number {
    return this.currentInterval;
  }
}
