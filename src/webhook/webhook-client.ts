// WebhookClient - sends data to n8n webhook
// Requirements: 3.1, 3.2, 3.3, 3.4
import axios, { AxiosError } from "axios";
import { VideoMetadata } from "../scraper/tiktok-scraper.js";

/**
 * Payload sent to the webhook endpoint
 * Requirements: 3.1, 3.2
 */
export interface WebhookPayload {
  videoId: string;
  videoUrl: string;
  downloadUrl: string;
  description: string;
  author: string;
  publishedAt: string;
  thumbnailUrl?: string;
  duration?: number;
  stats?: {
    plays: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

/**
 * Result of a webhook send operation
 * Requirements: 3.1, 3.2
 */
export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempts: number;
}

/**
 * Sleep utility for exponential backoff
 */
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * WebhookClient class - sends video data to n8n webhook
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export class WebhookClient {
  private webhookUrl: string;
  private timeout: number;
  private sleepFn: (ms: number) => Promise<void>;

  constructor(
    webhookUrl: string,
    timeout: number = 30000,
    sleepFn: (ms: number) => Promise<void> = defaultSleep
  ) {
    this.webhookUrl = webhookUrl;
    this.timeout = timeout;
    this.sleepFn = sleepFn;
  }

  /**
   * Transform VideoMetadata to WebhookPayload
   * Requirements: 3.1, 3.2
   */
  createPayload(video: VideoMetadata): WebhookPayload {
    return {
      videoId: video.id,
      videoUrl: video.url,
      downloadUrl: video.downloadUrl,
      description: video.description,
      author: video.author,
      publishedAt: video.publishedAt.toISOString(),
      thumbnailUrl: video.thumbnailUrl,
      duration: video.duration,
      stats: video.stats,
    };
  }

  /**
   * Send a single HTTP POST request to the webhook
   * Requirements: 3.1
   */
  async send(payload: WebhookPayload): Promise<WebhookResult> {
    try {
      const response = await axios.post(this.webhookUrl, payload, {
        timeout: this.timeout,
        headers: {
          "Content-Type": "application/json",
        },
      });

      return {
        success: true,
        statusCode: response.status,
        attempts: 1,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        statusCode: axiosError.response?.status,
        error: axiosError.message,
        attempts: 1,
      };
    }
  }

  /**
   * Send with retry using exponential backoff
   * Requirements: 3.3, 3.4
   * Retries up to maxRetries times with exponential backoff (1s, 2s, 4s, ...)
   */
  async sendWithRetry(
    payload: WebhookPayload,
    maxRetries: number
  ): Promise<WebhookResult> {
    let lastResult: WebhookResult | null = null;
    let attempts = 0;

    // First attempt + retries = maxRetries + 1 total attempts
    // But we count retries, so we do 1 initial + maxRetries retries
    const totalAttempts = maxRetries + 1;

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      attempts++;

      try {
        const response = await axios.post(this.webhookUrl, payload, {
          timeout: this.timeout,
          headers: {
            "Content-Type": "application/json",
          },
        });

        return {
          success: true,
          statusCode: response.status,
          attempts,
        };
      } catch (error) {
        const axiosError = error as AxiosError;
        lastResult = {
          success: false,
          statusCode: axiosError.response?.status,
          error: axiosError.message,
          attempts,
        };

        // If we have more retries left, wait with exponential backoff
        if (attempt < totalAttempts - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, ...
          await this.sleepFn(backoffMs);
        }
      }
    }

    // All attempts failed
    return lastResult!;
  }

  /**
   * Update the webhook URL
   */
  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  /**
   * Get the current webhook URL
   */
  getWebhookUrl(): string {
    return this.webhookUrl;
  }
}
