import { useState, useEffect, useCallback } from "react";
import api, {
  VideoHistoryItem,
  PaginatedResponse,
  AuthorInfo,
  ApiResponse,
} from "../api/client";
import VideoTable from "../components/VideoTable";
import HistoryFilters from "../components/HistoryFilters";
import "./History.css";

function History() {
  const [items, setItems] = useState<VideoHistoryItem[]>([]);
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedAuthor, setSelectedAuthor] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const fetchAuthors = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<AuthorInfo[]>>("/authors");
      if (response.data.success && response.data.data) {
        setAuthors(response.data.data);
      }
    } catch (err) {
      // Silently fail - authors list is optional for filtering
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("pageSize", pageSize.toString());
      if (selectedAuthor) {
        params.append("author", selectedAuthor);
      }
      if (selectedStatus) {
        params.append("status", selectedStatus);
      }

      const response = await api.get<
        ApiResponse<PaginatedResponse<VideoHistoryItem>>
      >(`/history?${params.toString()}`);

      if (response.data.success && response.data.data) {
        const data = response.data.data;
        setItems(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      } else {
        setError(response.data.error?.message || "Failed to fetch history");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedAuthor, selectedStatus]);

  useEffect(() => {
    fetchAuthors();
  }, [fetchAuthors]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleAuthorChange = (author: string) => {
    setSelectedAuthor(author);
    setPage(1); // Reset to first page when filter changes
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setPage(1); // Reset to first page when filter changes
  };

  return (
    <div className="history">
      <div className="history__header">
        <h1>Video History</h1>
      </div>

      {error && <div className="history__error-banner">{error}</div>}

      <HistoryFilters
        authors={authors}
        selectedAuthor={selectedAuthor}
        selectedStatus={selectedStatus}
        onAuthorChange={handleAuthorChange}
        onStatusChange={handleStatusChange}
      />

      <VideoTable
        items={items}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        loading={loading}
      />
    </div>
  );
}

export default History;
