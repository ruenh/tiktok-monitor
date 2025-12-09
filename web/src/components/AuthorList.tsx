import { useState } from "react";
import { AuthorInfo } from "../api/client";

interface AuthorListProps {
  authors: AuthorInfo[];
  onRemove: (username: string) => Promise<void>;
  onCheck: (username: string) => Promise<void>;
}

function AuthorList({ authors, onRemove, onCheck }: AuthorListProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const formatLastCheck = (lastCheckTime: string | null): string => {
    if (!lastCheckTime) return "Never";
    const date = new Date(lastCheckTime);
    return date.toLocaleString();
  };

  const handleRemove = async (username: string) => {
    setLoadingAction(`remove-${username}`);
    try {
      await onRemove(username);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCheck = async (username: string) => {
    setLoadingAction(`check-${username}`);
    try {
      await onCheck(username);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="author-list">
      <h2>Monitored Authors ({authors.length})</h2>
      {authors.length === 0 ? (
        <div className="author-list__empty">
          No authors being monitored. Add an author above to get started.
        </div>
      ) : (
        <table className="author-list__table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Videos</th>
              <th>Last Check</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {authors.map((author) => (
              <tr key={author.username}>
                <td className="author-list__username">@{author.username}</td>
                <td>{author.videosCount}</td>
                <td>{formatLastCheck(author.lastCheckTime)}</td>
                <td>
                  <div className="author-list__actions">
                    <button
                      className="author-list__btn author-list__btn--check"
                      onClick={() => handleCheck(author.username)}
                      disabled={loadingAction !== null}
                    >
                      {loadingAction === `check-${author.username}`
                        ? "Checking..."
                        : "Check Now"}
                    </button>
                    <button
                      className="author-list__btn author-list__btn--remove"
                      onClick={() => handleRemove(author.username)}
                      disabled={loadingAction !== null}
                    >
                      {loadingAction === `remove-${author.username}`
                        ? "Removing..."
                        : "Remove"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AuthorList;
