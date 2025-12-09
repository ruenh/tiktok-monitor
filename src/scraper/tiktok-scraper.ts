// TikTokScraper - fetches video information from TikTok
// Uses TikWM API as primary method with fallback options

import axios, { AxiosError } from "axios";

export interface VideoMetadata {
  id: string;
  url: string;
  downloadUrl: string;
  description: string;
  author: string;
  publishedAt: Date;
  thumbnailUrl?: string;
  duration?: number;
  stats?: {
    plays: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

export interface ScraperConfig {
  timeout?: number;
  userAgent?: string;
}

interface TikWMVideo {
  id: string;
  play: string;
  title: string;
  create_time: number;
  cover: string;
  duration: number;
  play_count: number;
  digg_count: number;
  comment_count: number;
  share_count: number;
}

interface TikWMResponse {
  code: number;
  msg: string;
  data: {
    videos: TikWMVideo[];
  };
}

export class TikTokScraper {
  private readonly timeout: number;
  private readonly userAgent: string;
  private readonly baseUrl = "https://www.tikwm.com/api/user/posts";

  constructor(config: ScraperConfig = {}) {
    this.timeout = config.timeout ?? 30000;
    this.userAgent =
      config.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  /**
   * Validates TikTok username format
   * Valid usernames: 1-24 characters, alphanumeric, underscores, periods
   * Must start with a letter or number
   */
  isValidUsername(username: string): boolean {
    if (!username || typeof username !== "string") {
      return false;
    }
    // TikTok usernames: 1-24 chars, alphanumeric + underscore + period
    // Must start with letter or number
    const usernameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.]{0,23}$/;
    return usernameRegex.test(username);
  }

  /**
   * Fetches latest videos from a TikTok author
   * Uses TikWM API as primary method
   */
  async getLatestVideos(
    username: string,
    limit: number = 10
  ): Promise<VideoMetadata[]> {
    if (!this.isValidUsername(username)) {
      throw new Error(`Invalid TikTok username: ${username}`);
    }

    try {
      const response = await axios.get<TikWMResponse>(this.baseUrl, {
        params: {
          unique_id: username,
          count: Math.min(limit, 30), // TikWM max is 30
          cursor: 0,
        },
        timeout: this.timeout,
        headers: {
          "User-Agent": this.userAgent,
        },
      });

      if (response.data.code !== 0) {
        throw new Error(`TikWM API error: ${response.data.msg}`);
      }

      const videos = response.data.data?.videos || [];

      // Filter out videos without valid ID and map to metadata
      return videos
        .filter((video) => video && (video.id || (video as any).video_id))
        .map((video) => this.mapTikWMVideo(video, username));
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          throw new Error(
            "Rate limited by TikTok API. Please try again later."
          );
        }
        if (error.code === "ECONNABORTED") {
          throw new Error("Request timeout while fetching TikTok videos");
        }
        throw new Error(`Network error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Fetches a single video by ID
   */
  async getVideoById(videoId: string): Promise<VideoMetadata | null> {
    if (!videoId || typeof videoId !== "string") {
      return null;
    }

    try {
      const response = await axios.get("https://www.tikwm.com/api/", {
        params: {
          url: `https://www.tiktok.com/@/video/${videoId}`,
        },
        timeout: this.timeout,
        headers: {
          "User-Agent": this.userAgent,
        },
      });

      if (response.data.code !== 0 || !response.data.data) {
        return null;
      }

      const video = response.data.data;
      return {
        id: video.id || videoId,
        url: `https://www.tiktok.com/@${
          video.author?.unique_id || "unknown"
        }/video/${videoId}`,
        downloadUrl: video.play || "",
        description: video.title || "",
        author: video.author?.unique_id || "unknown",
        publishedAt: new Date(video.create_time * 1000),
        thumbnailUrl: video.cover,
        duration: video.duration,
        stats: {
          plays: video.play_count || 0,
          likes: video.digg_count || 0,
          comments: video.comment_count || 0,
          shares: video.share_count || 0,
        },
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429) {
          throw new Error(
            "Rate limited by TikTok API. Please try again later."
          );
        }
      }
      return null;
    }
  }

  /**
   * Maps TikWM API response to VideoMetadata
   */
  private mapTikWMVideo(video: TikWMVideo, author: string): VideoMetadata {
    // TikWM API may return id as 'id' or 'video_id'
    const videoId = video.id || (video as any).video_id || "";

    return {
      id: videoId,
      url: `https://www.tiktok.com/@${author}/video/${videoId}`,
      downloadUrl:
        video.play || (video as any).wmplay || (video as any).hdplay || "",
      description: video.title || (video as any).desc || "",
      author: author,
      publishedAt: new Date((video.create_time || 0) * 1000),
      thumbnailUrl: video.cover || (video as any).origin_cover || "",
      duration: video.duration || 0,
      stats: {
        plays: video.play_count || (video as any).playCount || 0,
        likes: video.digg_count || (video as any).diggCount || 0,
        comments: video.comment_count || (video as any).commentCount || 0,
        shares: video.share_count || (video as any).shareCount || 0,
      },
    };
  }
}
