import "./StatusBadge.css";

interface StatusBadgeProps {
  status: "running" | "stopped";
}

function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`status-badge status-badge--${status}`}>
      <span className="status-badge__dot" />
      <span className="status-badge__text">
        {status === "running" ? "Running" : "Stopped"}
      </span>
    </span>
  );
}

export default StatusBadge;
