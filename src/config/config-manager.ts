// ConfigManager - manages application configuration
import { promises as fs } from "fs";
import path from "path";

export interface Config {
  webhookUrl: string;
  pollingInterval: number; // seconds (60-3600)
  authors: string[];
  maxRetries: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// TikTok username rules:
// - 1-24 characters
// - Only letters, numbers, underscores, and periods
// - Cannot start or end with a period
// - Cannot have consecutive periods
const TIKTOK_USERNAME_REGEX =
  /^(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9][a-zA-Z0-9_.]{0,22}[a-zA-Z0-9_]?$/;

const MIN_POLLING_INTERVAL = 60;
const MAX_POLLING_INTERVAL = 3600;

/**
 * Validates a TikTok username format
 * Requirements: 1.3
 */
export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];

  if (!username || typeof username !== "string") {
    errors.push("Username must be a non-empty string");
    return { valid: false, errors };
  }

  const trimmed = username.trim();
  if (trimmed.length === 0) {
    errors.push("Username cannot be empty or whitespace only");
    return { valid: false, errors };
  }

  if (trimmed.length > 24) {
    errors.push("Username must be 24 characters or less");
    return { valid: false, errors };
  }

  if (!TIKTOK_USERNAME_REGEX.test(trimmed)) {
    errors.push(
      "Username can only contain letters, numbers, underscores, and periods. " +
        "Cannot start/end with period or have consecutive periods."
    );
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validates a webhook URL format
 * Requirements: 4.1
 */
export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];

  if (!url || typeof url !== "string") {
    errors.push("URL must be a non-empty string");
    return { valid: false, errors };
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    errors.push("URL cannot be empty or whitespace only");
    return { valid: false, errors };
  }

  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push("URL must use http or https protocol");
      return { valid: false, errors };
    }
  } catch {
    errors.push("Invalid URL format");
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validates polling interval is within allowed range (60-3600 seconds)
 * Requirements: 4.2, 4.3
 */
export function validatePollingInterval(interval: number): ValidationResult {
  const errors: string[] = [];

  if (typeof interval !== "number" || isNaN(interval)) {
    errors.push("Polling interval must be a number");
    return { valid: false, errors };
  }

  if (!Number.isInteger(interval)) {
    errors.push("Polling interval must be an integer");
    return { valid: false, errors };
  }

  if (interval < MIN_POLLING_INTERVAL || interval > MAX_POLLING_INTERVAL) {
    errors.push(
      `Polling interval must be between ${MIN_POLLING_INTERVAL} and ${MAX_POLLING_INTERVAL} seconds`
    );
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Validates a complete Config object
 * Requirements: 1.3, 4.1, 4.2, 4.3
 */
export function validateConfig(config: Partial<Config>): ValidationResult {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    return { valid: false, errors: ["Config must be an object"] };
  }

  // Validate webhookUrl
  if (config.webhookUrl !== undefined) {
    const urlResult = validateUrl(config.webhookUrl);
    if (!urlResult.valid) {
      errors.push(...urlResult.errors.map((e) => `webhookUrl: ${e}`));
    }
  }

  // Validate pollingInterval
  if (config.pollingInterval !== undefined) {
    const intervalResult = validatePollingInterval(config.pollingInterval);
    if (!intervalResult.valid) {
      errors.push(...intervalResult.errors.map((e) => `pollingInterval: ${e}`));
    }
  }

  // Validate authors array
  if (config.authors !== undefined) {
    if (!Array.isArray(config.authors)) {
      errors.push("authors: Must be an array");
    } else {
      config.authors.forEach((author, index) => {
        const usernameResult = validateUsername(author);
        if (!usernameResult.valid) {
          errors.push(
            ...usernameResult.errors.map((e) => `authors[${index}]: ${e}`)
          );
        }
      });
    }
  }

  // Validate maxRetries
  if (config.maxRetries !== undefined) {
    if (
      typeof config.maxRetries !== "number" ||
      !Number.isInteger(config.maxRetries) ||
      config.maxRetries < 0
    ) {
      errors.push("maxRetries: Must be a non-negative integer");
    }
  }

  return { valid: errors.length === 0, errors };
}

const DEFAULT_CONFIG: Config = {
  webhookUrl: "",
  pollingInterval: 300,
  authors: [],
  maxRetries: 3,
};

/**
 * ConfigManager class - manages application configuration with persistence
 * Requirements: 1.1, 1.2, 1.4, 6.1, 6.2
 */
export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor(configPath: string = "config.json") {
    this.configPath = configPath;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Load configuration from JSON file
   * Requirements: 1.4, 6.2
   */
  async load(): Promise<Config> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(data);

      const validation = validateConfig(parsed);
      if (!validation.valid) {
        throw new Error(`Invalid config: ${validation.errors.join(", ")}`);
      }

      this.config = {
        webhookUrl: parsed.webhookUrl ?? DEFAULT_CONFIG.webhookUrl,
        pollingInterval:
          parsed.pollingInterval ?? DEFAULT_CONFIG.pollingInterval,
        authors: parsed.authors ?? DEFAULT_CONFIG.authors,
        maxRetries: parsed.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      };

      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist, use defaults
        this.config = { ...DEFAULT_CONFIG };
        return this.config;
      }
      throw error;
    }
  }

  /**
   * Save configuration to JSON file
   * Requirements: 6.1, 6.3
   */
  async save(config?: Config): Promise<void> {
    if (config) {
      const validation = validateConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid config: ${validation.errors.join(", ")}`);
      }
      this.config = config;
    }

    const dir = path.dirname(this.configPath);
    if (dir && dir !== ".") {
      await fs.mkdir(dir, { recursive: true });
    }

    await fs.writeFile(
      this.configPath,
      JSON.stringify(this.config, null, 2),
      "utf-8"
    );
  }

  /**
   * Validate a partial config object
   */
  validate(config: Partial<Config>): ValidationResult {
    return validateConfig(config);
  }

  /**
   * Add an author to the monitoring list
   * Requirements: 1.1
   */
  async addAuthor(username: string): Promise<void> {
    const validation = validateUsername(username);
    if (!validation.valid) {
      throw new Error(`Invalid username: ${validation.errors.join(", ")}`);
    }

    const normalizedUsername = username.trim();
    if (this.config.authors.includes(normalizedUsername)) {
      return; // Already exists, no-op
    }

    this.config.authors.push(normalizedUsername);
    await this.save();
  }

  /**
   * Remove an author from the monitoring list
   * Requirements: 1.2
   */
  async removeAuthor(username: string): Promise<void> {
    const index = this.config.authors.indexOf(username.trim());
    if (index === -1) {
      return; // Not found, no-op
    }

    this.config.authors.splice(index, 1);
    await this.save();
  }

  /**
   * Get current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Get list of authors
   */
  getAuthors(): string[] {
    return [...this.config.authors];
  }

  /**
   * Set webhook URL
   * Requirements: 4.1
   */
  async setWebhookUrl(url: string): Promise<void> {
    const validation = validateUrl(url);
    if (!validation.valid) {
      throw new Error(`Invalid URL: ${validation.errors.join(", ")}`);
    }

    this.config.webhookUrl = url.trim();
    await this.save();
  }

  /**
   * Set polling interval
   * Requirements: 4.2, 4.3
   */
  async setPollingInterval(interval: number): Promise<void> {
    const validation = validatePollingInterval(interval);
    if (!validation.valid) {
      throw new Error(`Invalid interval: ${validation.errors.join(", ")}`);
    }

    this.config.pollingInterval = interval;
    await this.save();
  }
}
