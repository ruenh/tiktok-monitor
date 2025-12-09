import { AuthorInfo } from "../api/client";
import "./HistoryFilters.css";

interface HistoryFiltersProps {
  authors: AuthorInfo[];
  selectedAuthor: string;
  selectedStatus: string;
  onAuthorChange: (author: string) => void;
  onStatusChange: (status: string) => void;
}

function HistoryFilters({
  authors,
  selectedAuthor,
  selectedStatus,
  onAuthorChange,
  onStatusChange,
}: HistoryFiltersProps) {
  return (
    <div className="history-filters">
      <div className="history-filters__group">
        <label className="history-filters__label" htmlFor="author-filter">
          Author
        </label>
        <select
          id="author-filter"
          className="history-filters__select"
          value={selectedAuthor}
          onChange={(e) => onAuthorChange(e.target.value)}
        >
          <option value="">All Authors</option>
          {authors.map((author) => (
            <option key={author.username} value={author.username}>
              @{author.username}
            </option>
          ))}
        </select>
      </div>

      <div className="history-filters__group">
        <label className="history-filters__label" htmlFor="status-filter">
          Status
        </label>
        <select
          id="status-filter"
          className="history-filters__select"
          value={selectedStatus}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
      </div>
    </div>
  );
}

export default HistoryFilters;
