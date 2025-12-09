import { useState, useEffect, useCallback } from "react";
import api, { DashboardStatus, ApiResponse } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import StatsCard from "../components/StatsCard";
import "./Dashboard.css";

function Dashboard() {
  const [status, setStatus] = useState<DashboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlLoading, setControlLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<DashboardStatus>>("/status");
      if (response.data.success && response.data.data) {
        setStatus(response.data.data);
        setError(null);
      } else {
        setError(response.data.error?.message || "Failed to fetch status");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Auto-refresh every 5 seconds (Requirement 1.4)
    const interval = setInterval(fetchStatus, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStartMonitoring = async () => {
    setControlLoading(true);
    try {
      await api.post("/monitor/start");
      await fetchStatus();
    } catch (err) {
      setError("Failed to start monitoring");
    } finally {
      setControlLoading(false);
    }
  };

  const handleStopMonitoring = async () => {
    setControlLoading(true);
    try {
      await api.post("/monitor/stop");
      await fetchStatus();
    } catch (err) {
      setError("Failed to stop monitoring");
    } finally {
      setControlLoading(false);
    }
  };

  const formatLastCheck = (lastCheck: string | null): string => {
    if (!lastCheck) return "Never";
    const date = new Date(lastCheck);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard__loading">Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="dashboard">
        <div className="dashboard__error">
          <p>{error}</p>
          <button onClick={fetchStatus}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h1>Dashboard</h1>
        {status && <StatusBadge status={status.monitoring} />}
      </div>

      {error && <div className="dashboard__error-banner">{error}</div>}

      <div className="dashboard__stats">
        <StatsCard
          title="Monitored Authors"
          value={status?.authorsCount ?? 0}
          icon="👥"
        />
        <StatsCard
          title="Videos Today"
          value={status?.videosToday ?? 0}
          icon="🎬"
        />
        <StatsCard
          title="Last Check"
          value={formatLastCheck(status?.lastCheck ?? null)}
          icon="🕐"
        />
      </div>

      <div className="dashboard__controls">
        <h2>Monitor Control</h2>
        <div className="dashboard__buttons">
          {status?.monitoring === "stopped" ? (
            <button
              className="dashboard__btn dashboard__btn--start"
              onClick={handleStartMonitoring}
              disabled={controlLoading}
            >
              {controlLoading ? "Starting..." : "Start Monitoring"}
            </button>
          ) : (
            <button
              className="dashboard__btn dashboard__btn--stop"
              onClick={handleStopMonitoring}
              disabled={controlLoading}
            >
              {controlLoading ? "Stopping..." : "Stop Monitoring"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
