import { LogEntry } from "../api/client";
import "./LogViewer.css";

export type LogLevel = "info" | "warn" | "error";

interface LogViewerProps {
  entries: LogEntry[];
  selectedLevel: string;
  onLevelChange: (level: string) => void;
  onRefresh: () => void;
  loading: boolean;
}

/**
 * Formats a timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * LogViewer component - displays log entries with level filtering
 * Requirements: 6.1, 6.3
 */
function LogViewer({
  entries,
  selectedLevel,
  onLevelChange,
  onRefresh,
  loading,
}: LogViewerProps) {
  const handleLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onLevelChange(e.target.value);
  };

  return (
    <div className="log-viewer">
      <div className="log-viewer__header">
        <h2 className="log-viewer__title">System Logs</h2>
        <div className="log-viewer__filter">
          <label className="log-viewer__filter-label" htmlFor="levelFilter">
            Filter by level:
          </label>
          <select
            id="levelFilter"
            className="log-viewer__filter-select"
            value={selectedLevel}
            onChange={handleLevelChange}
          >
            <option value="">All levels</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      <div className="log-viewer__content">
        {entries.length === 0 ? (
          <div className="log-viewer__empty">
            {loading ? "Loading logs..." : "No log entries found"}
          </div>
        ) : (
          entries.map((entry, index) => (
            <div
              key={`${entry.timestamp}-${index}`}
              className={`log-viewer__entry log-viewer__entry--${entry.level}`}
            >
              <span className="log-viewer__timestamp">
                {formatTimestamp(entry.timestamp)}
              </span>
              <span
                className={`log-viewer__level log-viewer__level--${entry.level}`}
              >
                {entry.level}
              </span>
              <span className="log-viewer__message">{entry.message}</span>
              {entry.meta && Object.keys(entry.meta).length > 0 && (
                <div className="log-viewer__meta">
                  {JSON.stringify(entry.meta)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="log-viewer__footer">
        <span className="log-viewer__count">
          Showing {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <button
          className="log-viewer__refresh-btn"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}

export default LogViewer;
