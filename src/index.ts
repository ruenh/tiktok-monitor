#!/usr/bin/env node
// TikTok Monitor - Main entry point
// Requirements: 1.4, 2.1

import { ConfigManager } from "./config/index.js";
import { StateManager } from "./state/index.js";
import { TikTokScraper } from "./scraper/index.js";
import { WebhookClient } from "./webhook/index.js";
import { PollingScheduler } from "./scheduler/index.js";
import { runCLI } from "./cli/index.js";
import {
  createApiServer,
  addErrorHandler,
  startApiServer,
  serveStaticFiles,
} from "./api/index.js";
import { Logger, getLogger } from "./api/services/logger.js";

// Application version
const VERSION = "1.0.0";

// Logger utility
function log(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ERROR: ${message}`);
}

// Global instances for graceful shutdown
let scheduler: PollingScheduler | null = null;
let isShuttingDown = false;

/**
 * Initialize all application components
 * Requirements: 1.4
 */
async function initializeComponents(): Promise<{
  configManager: ConfigManager;
  stateManager: StateManager;
  scraper: TikTokScraper;
  webhookClient: WebhookClient;
  scheduler: PollingScheduler;
}> {
  log("Initializing components...");

  // Initialize ConfigManager and load configuration
  const configManager = new ConfigManager();
  await configManager.load();
  log("Configuration loaded");

  // Initialize StateManager and load state
  const stateManager = new StateManager();
  await stateManager.load();
  log("State loaded");

  // Initialize TikTokScraper
  const scraper = new TikTokScraper();
  log("TikTok scraper initialized");

  // Initialize WebhookClient with configured URL
  const config = configManager.getConfig();
  const webhookClient = new WebhookClient(config.webhookUrl);
  log("Webhook client initialized");

  // Initialize PollingScheduler
  const pollingScheduler = new PollingScheduler({
    configManager,
    stateManager,
    scraper,
    webhookClient,
    logger: log,
  });
  log("Polling scheduler initialized");

  return {
    configManager,
    stateManager,
    scraper,
    webhookClient,
    scheduler: pollingScheduler,
  };
}

/**
 * Set up graceful shutdown handlers
 * Requirements: 1.4
 */
function setupGracefulShutdown(
  scheduler: PollingScheduler,
  stateManager: StateManager
): void {
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      log("Shutdown already in progress...");
      return;
    }

    isShuttingDown = true;
    log(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop the scheduler
      if (scheduler.isRunning()) {
        scheduler.stop();
        log("Polling scheduler stopped");
      }

      // Save state before exit
      await stateManager.save();
      log("State saved");

      log("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Error during shutdown: ${message}`);
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logError(`Uncaught exception: ${error.message}`);
    shutdown("uncaughtException");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logError(`Unhandled rejection: ${message}`);
    shutdown("unhandledRejection");
  });
}

/**
 * Start the monitoring service (daemon mode)
 * Requirements: 2.1
 */
async function startDaemon(): Promise<void> {
  log(`TikTok Monitor v${VERSION} starting...`);

  try {
    const components = await initializeComponents();
    scheduler = components.scheduler;

    // Set up graceful shutdown
    setupGracefulShutdown(scheduler, components.stateManager);

    const config = components.configManager.getConfig();

    // Validate configuration before starting
    if (!config.webhookUrl) {
      logError("Webhook URL is not configured. Use CLI to set it first.");
      process.exit(1);
    }

    if (config.authors.length === 0) {
      logError("No authors configured. Use CLI to add authors first.");
      process.exit(1);
    }

    // Log startup information
    log("=== Configuration ===");
    log(`Webhook URL: ${config.webhookUrl}`);
    log(`Polling Interval: ${config.pollingInterval}s`);
    log(`Max Retries: ${config.maxRetries}`);
    log(`Authors: ${config.authors.join(", ")}`);
    log("=====================");

    // Start the scheduler
    scheduler.start();
    log("Monitoring started. Press Ctrl+C to stop.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to start: ${message}`);
    process.exit(1);
  }
}

/**
 * Start the web server with API and static file serving
 * Requirements: 1.1
 */
async function startWebServer(): Promise<void> {
  log(`TikTok Monitor Web UI v${VERSION} starting...`);

  try {
    const components = await initializeComponents();
    scheduler = components.scheduler;

    // Set up graceful shutdown
    setupGracefulShutdown(scheduler, components.stateManager);

    // Initialize logger
    const logger = getLogger();

    // Create API server with dependencies
    const app = createApiServer({
      configManager: components.configManager,
      stateManager: components.stateManager,
      scheduler: components.scheduler,
      logger,
    });

    // Serve static files (React frontend)
    serveStaticFiles(app);

    // Add error handler (must be after routes and static files)
    addErrorHandler(app);

    // Get port from environment or default to 3000
    const port = parseInt(process.env.PORT || "3000", 10);

    // Start the API server and keep it running
    const server = app.listen(port, () => {
      log(`API server running on port ${port}`);
      log(`Web UI available at http://localhost:${port}`);
    });

    // Keep process alive by storing server reference
    process.on("SIGTERM", () => {
      server.close(() => {
        log("Server closed");
        process.exit(0);
      });
    });

    // Optionally start monitoring if configured
    const config = components.configManager.getConfig();
    if (config.webhookUrl && config.authors.length > 0) {
      scheduler.start();
      log("Monitoring service started automatically");
    } else {
      log(
        "Monitoring not started - configure webhook URL and authors via Web UI"
      );
    }

    // Keep the process alive with a heartbeat interval
    setInterval(() => {
      // Heartbeat to keep process alive
    }, 60000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to start web server: ${message}`);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // If "web" argument, start web server with API
  if (args[0] === "web") {
    await startWebServer();
    return;
  }

  // If no arguments or "daemon" argument, start in daemon mode
  if (args.length === 0 || args[0] === "daemon") {
    await startDaemon();
    return;
  }

  // Otherwise, run CLI commands
  try {
    await runCLI(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(message);
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError(`Fatal error: ${message}`);
  process.exit(1);
});

// Export for testing
export {
  initializeComponents,
  setupGracefulShutdown,
  startDaemon,
  startWebServer,
  log,
  logError,
  VERSION,
};
