import { useState } from "react";
import { VideoHistoryItem } from "../api/client";
import api, { ApiResponse } from "../api/client";
import "./VideoTable.css";

interface VideoTableProps {
  items: VideoHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  onResend?: () => void;
}

function VideoTable({
  items,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  loading = false,
  onResend,
}: VideoTableProps) {
  const [resending, setResending] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const handleResend = async (
    videoId: string,
    target: "test" | "production"
  ) => {
    setResending(`${videoId}-${target}`);
    setResendMessage(null);
    try {
      const response = await api.post<ApiResponse<{ message: string }>>(
        `/history/${videoId}/resend`,
        { target }
      );
      if (response.data.success) {
        setResendMessage(`✓ Sent to ${target}`);
        if (onResend) onResend();
      } else {
        setResendMessage(`✗ ${response.data.error?.message || "Failed"}`);
      }
    } catch (err) {
      setResendMessage("✗ Failed to resend");
    } finally {
      setResending(null);
      setTimeout(() => setResendMessage(null), 3000);
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case "sent":
        return "video-table__status--sent";
      case "failed":
        return "video-table__status--failed";
      case "pending":
      default:
        return "video-table__status--pending";
    }
  };

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="video-table">
      {loading ? (
        <div className="video-table__loading">Loading...</div>
      ) : items.length === 0 ? (
        <div className="video-table__empty">
          No videos found matching the current filters.
        </div>
      ) : (
        <>
          <table className="video-table__table">
            <thead>
              <tr>
                <th>Video ID</th>
                <th>Author</th>
                <th>Processed At</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={`${item.videoId}-${item.processedAt}`}>
                  <td className="video-table__video-id">{item.videoId}</td>
                  <td className="video-table__author">@{item.author}</td>
                  <td>{formatDate(item.processedAt)}</td>
                  <td>
                    <span
                      className={`video-table__status ${getStatusBadgeClass(
                        item.webhookStatus
                      )}`}
                    >
                      {item.webhookStatus}
                    </span>
                  </td>
                  <td>{item.retryCount}</td>
                  <td className="video-table__actions">
                    <button
                      className="video-table__resend-btn video-table__resend-btn--test"
                      onClick={() => handleResend(item.videoId, "test")}
                      disabled={resending === `${item.videoId}-test`}
                      title="Send to test webhook"
                    >
                      {resending === `${item.videoId}-test` ? "..." : "Test"}
                    </button>
                    <button
                      className="video-table__resend-btn video-table__resend-btn--prod"
                      onClick={() => handleResend(item.videoId, "production")}
                      disabled={resending === `${item.videoId}-production`}
                      title="Send to production webhook"
                    >
                      {resending === `${item.videoId}-production`
                        ? "..."
                        : "Prod"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {resendMessage && (
            <div className="video-table__resend-message">{resendMessage}</div>
          )}

          <div className="video-table__pagination">
            <div className="video-table__info">
              Showing {startItem}-{endItem} of {total} videos
            </div>
            <div className="video-table__controls">
              <button
                className="video-table__btn"
                onClick={() => onPageChange(1)}
                disabled={page === 1}
              >
                First
              </button>
              <button
                className="video-table__btn"
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="video-table__page">
                Page {page} of {totalPages}
              </span>
              <button
                className="video-table__btn"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
              <button
                className="video-table__btn"
                onClick={() => onPageChange(totalPages)}
                disabled={page >= totalPages}
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default VideoTable;
