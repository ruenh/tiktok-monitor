/**
 * API Routes Index
 * Exports all route creators for the API
 */
export {
  createStatusRouter,
  type StatusRouteDependencies,
  type DashboardStatus,
} from "./status.js";
export {
  createMonitorRouter,
  type MonitorRouteDependencies,
} from "./monitor.js";
export {
  createAuthorsRouter,
  type AuthorsRouteDependencies,
  type AuthorInfo,
} from "./authors.js";
export {
  createHistoryRouter,
  type HistoryRouteDependencies,
  type VideoHistoryItem,
  type PaginatedResponse,
} from "./history.js";
export {
  createConfigRouter,
  type ConfigRouteDependencies,
  type ConfigResponse,
  type ConfigUpdate,
} from "./config.js";
export {
  createLogsRouter,
  type LogsRouteDependencies,
  type LogEntry,
  type LogLevel,
} from "./logs.js";
