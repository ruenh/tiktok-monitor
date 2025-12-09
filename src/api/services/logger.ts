/**
 * Logger Service - In-memory log buffer for API
 * Requirements: 6.1, 6.3
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 100;

/**
 * Logger class that maintains an in-memory buffer of log entries
 * with a maximum of 100 entries (oldest entries are removed when limit is exceeded)
 */
export class Logger {
  private entries: LogEntry[] = [];
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  /**
   * Add a log entry with the specified level
   */
  private log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    };

    this.entries.push(entry);

    // Enforce max entries limit by removing oldest entries
    while (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    // Notify listeners for real-time updates
    this.listeners.forEach((listener) => listener(entry));
  }

  /**
   * Log an info message
   */
  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  /**
   * Log a warning message
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  /**
   * Log an error message
   */
  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  /**
   * Get all log entries, optionally filtered by level
   * Returns entries in chronological order (oldest first)
   */
  getEntries(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.entries.filter((entry) => entry.level === level);
    }
    return [...this.entries];
  }

  /**
   * Get the current count of log entries
   */
  getCount(): number {
    return this.entries.length;
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Subscribe to new log entries (for real-time updates)
   * Returns an unsubscribe function
   */
  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

// Singleton instance for global logging
let globalLogger: Logger | null = null;

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Create a new logger instance (useful for testing)
 */
export function createLogger(): Logger {
  return new Logger();
}
