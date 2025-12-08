// CLI Commands - user interface for the TikTok Monitor
// Requirements: 1.1, 1.2, 4.1, 4.2, 5.1, 5.2

import {
  ConfigManager,
  Config,
  validateUsername,
  validateUrl,
  validatePollingInterval,
} from "../config/config-manager.js";
import { StateManager, ProcessedVideo } from "../state/state-manager.js";
import { PollingScheduler } from "../scheduler/polling-scheduler.js";
import { TikTokScraper } from "../scraper/tiktok-scraper.js";
import { WebhookClient } from "../webhook/webhook-client.js";

export interface CLICommands {
  start(): Promise<void>;
  stop(): void;
  addAuthor(username: string): Promise<void>;
  removeAuthor(username: string): Promise<void>;
  listAuthors(): void;
  status(): void;
  history(limit?: number): void;
  config(key: string, value?: string): Promise<void>;
}

export interface CLIOutput {
  print(message: string): void;
  error(message: string): void;
}

const defaultOutput: CLIOutput = {
  print: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
};

/**
 * CLI class - command line interface for TikTok Monitor
 * Requirements: 1.1, 1.2, 4.1, 4.2, 5.1, 5.2
 */
export class CLI implements CLICommands {
  private configManager: ConfigManager;
  private stateManager: StateManager;
  private scheduler: PollingScheduler | null = null;
  private output: CLIOutput;

  constructor(
    configManager: ConfigManager,
    stateManager: StateManager,
    output: CLIOutput = defaultOutput
  ) {
    this.configManager = configManager;
    this.stateManager = stateManager;
    this.output = output;
  }

  /**
   * Initialize the scheduler with current configuration
   */
  private initScheduler(): PollingScheduler {
    const config = this.configManager.getConfig();
    const scraper = new TikTokScraper();
    const webhookClient = new WebhookClient(config.webhookUrl);

    return new PollingScheduler({
      configManager: this.configManager,
      stateManager: this.stateManager,
      scraper,
      webhookClient,
      logger: (message: string) => this.output.print(`[Monitor] ${message}`),
    });
  }

  /**
   * Start monitoring
   * Requirements: 2.1
   */
  async start(): Promise<void> {
    const config = this.configManager.getConfig();

    if (!config.webhookUrl) {
      this.output.error(
        "Error: Webhook URL is not configured. Use 'config webhookUrl <url>' to set it."
      );
      return;
    }

    if (config.authors.length === 0) {
      this.output.error(
        "Error: No authors configured. Use 'add-author <username>' to add authors."
      );
      return;
    }

    if (this.scheduler?.isRunning()) {
      this.output.print("Monitor is already running.");
      return;
    }

    this.scheduler = this.initScheduler();
    this.scheduler.start();
    this.output.print(
      `Started monitoring ${config.authors.length} author(s) with ${config.pollingInterval}s interval.`
    );
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.scheduler?.isRunning()) {
      this.output.print("Monitor is not running.");
      return;
    }

    this.scheduler.stop();
    this.output.print("Monitor stopped.");
  }

  /**
   * Add an author to the monitoring list
   * Requirements: 1.1, 1.3
   */
  async addAuthor(username: string): Promise<void> {
    const validation = validateUsername(username);
    if (!validation.valid) {
      this.output.error(`Error: ${validation.errors.join(", ")}`);
      return;
    }

    try {
      await this.configManager.addAuthor(username);
      this.output.print(`Added author: ${username}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`Error adding author: ${message}`);
    }
  }

  /**
   * Remove an author from the monitoring list
   * Requirements: 1.2
   */
  async removeAuthor(username: string): Promise<void> {
    const authors = this.configManager.getAuthors();
    if (!authors.includes(username)) {
      this.output.error(
        `Error: Author '${username}' is not in the monitoring list.`
      );
      return;
    }

    try {
      await this.configManager.removeAuthor(username);
      this.output.print(`Removed author: ${username}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`Error removing author: ${message}`);
    }
  }

  /**
   * List all monitored authors
   * Requirements: 5.1
   */
  listAuthors(): void {
    const authors = this.configManager.getAuthors();

    if (authors.length === 0) {
      this.output.print("No authors configured.");
      return;
    }

    this.output.print("Monitored authors:");
    authors.forEach((author, index) => {
      this.output.print(`  ${index + 1}. ${author}`);
    });
  }

  /**
   * Show monitoring status
   * Requirements: 5.1
   */
  status(): void {
    const config = this.configManager.getConfig();
    const authors = config.authors;
    const isRunning = this.scheduler?.isRunning() ?? false;

    this.output.print("=== TikTok Monitor Status ===");
    this.output.print(`Status: ${isRunning ? "Running" : "Stopped"}`);
    this.output.print(`Webhook URL: ${config.webhookUrl || "(not set)"}`);
    this.output.print(`Polling Interval: ${config.pollingInterval}s`);
    this.output.print(`Max Retries: ${config.maxRetries}`);
    this.output.print("");

    if (authors.length === 0) {
      this.output.print("Authors: (none configured)");
    } else {
      this.output.print(`Authors (${authors.length}):`);
      authors.forEach((author) => {
        const lastCheck = this.stateManager.getLastCheckTime(author);
        const lastCheckStr = lastCheck ? formatDate(lastCheck) : "never";
        this.output.print(`  - ${author} (last check: ${lastCheckStr})`);
      });
    }
  }

  /**
   * Show processing history
   * Requirements: 5.2
   */
  history(limit: number = 100): void {
    const effectiveLimit = Math.min(Math.max(1, limit), 100);
    const videos = this.stateManager.getHistory(effectiveLimit);

    if (videos.length === 0) {
      this.output.print("No videos processed yet.");
      return;
    }

    this.output.print(
      `=== Processing History (last ${videos.length} videos) ===`
    );
    videos.forEach((video) => {
      const statusIcon = getStatusIcon(video.webhookStatus);
      const date = formatDate(video.processedAt);
      this.output.print(
        `${statusIcon} [${date}] ${video.author}: ${video.videoId} (${video.webhookStatus})`
      );
    });
  }

  /**
   * View or set configuration
   * Requirements: 4.1, 4.2
   */
  async config(key: string, value?: string): Promise<void> {
    const config = this.configManager.getConfig();

    // If no value provided, show current value
    if (value === undefined) {
      this.showConfigValue(key, config);
      return;
    }

    // Set the configuration value
    await this.setConfigValue(key, value);
  }

  /**
   * Show a specific configuration value
   */
  private showConfigValue(key: string, config: Config): void {
    switch (key.toLowerCase()) {
      case "webhookurl":
        this.output.print(`webhookUrl: ${config.webhookUrl || "(not set)"}`);
        break;
      case "pollinginterval":
        this.output.print(`pollingInterval: ${config.pollingInterval}s`);
        break;
      case "maxretries":
        this.output.print(`maxRetries: ${config.maxRetries}`);
        break;
      case "authors":
        this.output.print(
          `authors: ${
            config.authors.length > 0 ? config.authors.join(", ") : "(none)"
          }`
        );
        break;
      case "all":
        this.output.print("=== Configuration ===");
        this.output.print(`webhookUrl: ${config.webhookUrl || "(not set)"}`);
        this.output.print(`pollingInterval: ${config.pollingInterval}s`);
        this.output.print(`maxRetries: ${config.maxRetries}`);
        this.output.print(
          `authors: ${
            config.authors.length > 0 ? config.authors.join(", ") : "(none)"
          }`
        );
        break;
      default:
        this.output.error(`Unknown config key: ${key}`);
        this.output.print(
          "Available keys: webhookUrl, pollingInterval, maxRetries, authors, all"
        );
    }
  }

  /**
   * Set a configuration value
   * Requirements: 4.1, 4.2, 4.3
   */
  private async setConfigValue(key: string, value: string): Promise<void> {
    try {
      switch (key.toLowerCase()) {
        case "webhookurl": {
          const validation = validateUrl(value);
          if (!validation.valid) {
            this.output.error(`Error: ${validation.errors.join(", ")}`);
            return;
          }
          await this.configManager.setWebhookUrl(value);
          this.output.print(`Set webhookUrl to: ${value}`);
          break;
        }
        case "pollinginterval": {
          const interval = parseInt(value, 10);
          if (isNaN(interval)) {
            this.output.error("Error: Polling interval must be a number");
            return;
          }
          const validation = validatePollingInterval(interval);
          if (!validation.valid) {
            this.output.error(`Error: ${validation.errors.join(", ")}`);
            return;
          }
          await this.configManager.setPollingInterval(interval);
          this.output.print(`Set pollingInterval to: ${interval}s`);

          // Update scheduler if running
          if (this.scheduler?.isRunning()) {
            this.scheduler.setInterval(interval);
            this.output.print("Updated running scheduler with new interval.");
          }
          break;
        }
        case "maxretries": {
          const retries = parseInt(value, 10);
          if (isNaN(retries) || retries < 0) {
            this.output.error(
              "Error: Max retries must be a non-negative number"
            );
            return;
          }
          const config = this.configManager.getConfig();
          await this.configManager.save({ ...config, maxRetries: retries });
          this.output.print(`Set maxRetries to: ${retries}`);
          break;
        }
        default:
          this.output.error(`Cannot set config key: ${key}`);
          this.output.print(
            "Settable keys: webhookUrl, pollingInterval, maxRetries"
          );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.error(`Error setting config: ${message}`);
    }
  }

  /**
   * Get the scheduler instance (for testing)
   */
  getScheduler(): PollingScheduler | null {
    return this.scheduler;
  }

  /**
   * Set a custom scheduler (for testing)
   */
  setScheduler(scheduler: PollingScheduler): void {
    this.scheduler = scheduler;
  }
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Get status icon for webhook status
 */
function getStatusIcon(status: ProcessedVideo["webhookStatus"]): string {
  switch (status) {
    case "sent":
      return "✓";
    case "failed":
      return "✗";
    case "pending":
      return "○";
    default:
      return "?";
  }
}

/**
 * Parse command line arguments and execute commands
 * Requirements: 1.1, 1.2, 4.1, 4.2, 5.1, 5.2
 */
export async function runCLI(args: string[]): Promise<void> {
  const configManager = new ConfigManager();
  const stateManager = new StateManager();

  // Load configuration and state
  await configManager.load();
  await stateManager.load();

  const cli = new CLI(configManager, stateManager);

  const command = args[0]?.toLowerCase();
  const arg1 = args[1];
  const arg2 = args[2];

  switch (command) {
    case "start":
      await cli.start();
      break;
    case "stop":
      cli.stop();
      break;
    case "add-author":
      if (!arg1) {
        console.error("Usage: add-author <username>");
        process.exit(1);
      }
      await cli.addAuthor(arg1);
      break;
    case "remove-author":
      if (!arg1) {
        console.error("Usage: remove-author <username>");
        process.exit(1);
      }
      await cli.removeAuthor(arg1);
      break;
    case "list-authors":
      cli.listAuthors();
      break;
    case "status":
      cli.status();
      break;
    case "history": {
      const limit = arg1 ? parseInt(arg1, 10) : 100;
      if (isNaN(limit) || limit < 1) {
        console.error("Usage: history [limit]");
        process.exit(1);
      }
      cli.history(limit);
      break;
    }
    case "config":
      if (!arg1) {
        await cli.config("all");
      } else {
        await cli.config(arg1, arg2);
      }
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command || "(none)"}`);
      printHelp();
      process.exit(1);
  }
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
TikTok Monitor - CLI Commands

Usage: tiktok-monitor <command> [options]

Commands:
  start                     Start monitoring configured authors
  stop                      Stop monitoring
  add-author <username>     Add a TikTok author to monitor
  remove-author <username>  Remove an author from monitoring
  list-authors              List all monitored authors
  status                    Show monitoring status and author check times
  history [limit]           Show processing history (default: 100, max: 100)
  config [key] [value]      View or set configuration
                            Keys: webhookUrl, pollingInterval, maxRetries, all
  help                      Show this help message

Examples:
  tiktok-monitor add-author username123
  tiktok-monitor config webhookUrl https://n8n.example.com/webhook/xxx
  tiktok-monitor config pollingInterval 300
  tiktok-monitor start
  tiktok-monitor history 50
`);
}
