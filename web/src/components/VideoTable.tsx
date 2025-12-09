import { VideoHistoryItem } from "../api/client";
import "./VideoTable.css";

interface VideoTableProps {
  items: VideoHistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}

function VideoTable({
  items,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  loading = false,
}: VideoTableProps) {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
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
                </tr>
              ))}
            </tbody>
          </table>

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
