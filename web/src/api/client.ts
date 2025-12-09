import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
});

export interface DashboardStatus {
  monitoring: "running" | "stopped";
  authorsCount: number;
  videosToday: number;
  lastCheck: string | null;
}

export interface AuthorInfo {
  username: string;
  lastCheckTime: string | null;
  videosCount: number;
}

export interface VideoHistoryItem {
  videoId: string;
  author: string;
  processedAt: string;
  webhookStatus: "pending" | "sent" | "failed";
  retryCount: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Config {
  webhookUrl: string;
  pollingInterval: number;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  meta?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export default api;
