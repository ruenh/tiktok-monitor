import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { errorResponse, ErrorCode } from "./utils/response.js";
import {
  createStatusRouter,
  StatusRouteDependencies,
} from "./routes/status.js";
import {
  createMonitorRouter,
  MonitorRouteDependencies,
} from "./routes/monitor.js";
import {
  createAuthorsRouter,
  AuthorsRouteDependencies,
} from "./routes/authors.js";
import {
  createHistoryRouter,
  HistoryRouteDependencies,
} from "./routes/history.js";
import {
  createConfigRouter,
  ConfigRouteDependencies,
} from "./routes/config.js";
import { createLogsRouter, LogsRouteDependencies } from "./routes/logs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ApiServerDependencies
  extends StatusRouteDependencies,
    MonitorRouteDependencies,
    AuthorsRouteDependencies,
    HistoryRouteDependencies,
    ConfigRouteDependencies,
    LogsRouteDependencies {}

export function createApiServer(deps?: ApiServerDependencies): Express {
  const app = express();

  // CORS middleware
  app.use(cors());

  // JSON body parser
  app.use(express.json());

  // Ensure all responses have JSON content-type
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Content-Type", "application/json");
    next();
  });

  // Health check endpoint
  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: "ok" } });
  });

  // Register routes if dependencies are provided
  if (deps) {
    app.use("/api/v1/status", createStatusRouter(deps));
    app.use("/api/v1/monitor", createMonitorRouter(deps));
    app.use("/api/v1/authors", createAuthorsRouter(deps));
    app.use("/api/v1/history", createHistoryRouter(deps));
    app.use("/api/v1/config", createConfigRouter(deps));
    app.use("/api/v1/logs", createLogsRouter(deps));
  }

  return app;
}

// Error handling middleware - must be added after routes
export function addErrorHandler(app: Express): void {
  // 404 handler
  app.use((_req: Request, res: Response) => {
    res
      .status(404)
      .json(errorResponse(ErrorCode.NOT_FOUND, "Endpoint not found"));
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("API Error:", err);
    res
      .status(500)
      .json(
        errorResponse(
          ErrorCode.INTERNAL_ERROR,
          err.message || "Internal server error"
        )
      );
  });
}

/**
 * Configure Express to serve static files from the web/dist directory
 * This enables serving the React frontend in production
 */
export function serveStaticFiles(app: Express): void {
  // Path to the web frontend build directory
  const webDistPath = path.resolve(__dirname, "../../web/dist");

  // Serve static files
  app.use(express.static(webDistPath));

  // For SPA routing - serve index.html for all non-API routes
  app.get("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(webDistPath, "index.html"));
  });
}

export function startApiServer(app: Express, port: number): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`API server running on port ${port}`);
      resolve();
    });
  });
}
