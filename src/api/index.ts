export {
  createApiServer,
  addErrorHandler,
  startApiServer,
  serveStaticFiles,
  type ApiServerDependencies,
} from "./server.js";
export {
  successResponse,
  errorResponse,
  ErrorCode,
  type ApiResponse,
  type ApiSuccessResponse,
  type ApiErrorResponse,
} from "./utils/response.js";
export {
  createStatusRouter,
  createMonitorRouter,
  createHistoryRouter,
  createConfigRouter,
  createLogsRouter,
  type StatusRouteDependencies,
  type MonitorRouteDependencies,
  type HistoryRouteDependencies,
  type ConfigRouteDependencies,
  type LogsRouteDependencies,
  type DashboardStatus,
  type VideoHistoryItem,
  type PaginatedResponse,
  type ConfigResponse,
  type ConfigUpdate,
  type LogEntry,
  type LogLevel,
} from "./routes/index.js";
export { Logger, createLogger, getLogger } from "./services/logger.js";
