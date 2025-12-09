import { useState, useEffect, useCallback } from "react";
import api, { LogEntry, ApiResponse } from "../api/client";
import LogViewer from "../components/LogViewer";
import "./Logs.css";

/**
 * Logs page component
 * Requirements: 6.1, 6.3
 */
function Logs() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState("");

  /**
   * Fetches log entries from API
   * Requirements: 6.1, 6.3
   */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedLevel) {
        params.append("level", selectedLevel);
      }

      const url = params.toString() ? `/logs?${params.toString()}` : "/logs";
      const response = await api.get<ApiResponse<LogEntry[]>>(url);

      if (response.data.success && response.data.data) {
        setEntries(response.data.data);
        setError(null);
      } else {
        setError(response.data.error?.message || "Failed to fetch logs");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [selectedLevel]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleLevelChange = (level: string) => {
    setSelectedLevel(level);
  };

  const handleRefresh = () => {
    fetchLogs();
  };

  if (error && entries.length === 0) {
    return (
      <div className="logs">
        <div className="logs__header">
          <h1>Logs</h1>
        </div>
        <div className="logs__error">
          <p>{error}</p>
          <button onClick={fetchLogs}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="logs">
      <div className="logs__header">
        <h1>Logs</h1>
      </div>

      {error && <div className="logs__error-banner">{error}</div>}

      <LogViewer
        entries={entries}
        selectedLevel={selectedLevel}
        onLevelChange={handleLevelChange}
        onRefresh={handleRefresh}
        loading={loading}
      />
    </div>
  );
}

export default Logs;
