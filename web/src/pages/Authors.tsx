import { useState, useEffect, useCallback } from "react";
import api, { AuthorInfo, ApiResponse } from "../api/client";
import AddAuthorForm from "../components/AddAuthorForm";
import AuthorList from "../components/AuthorList";
import "./Authors.css";

function Authors() {
  const [authors, setAuthors] = useState<AuthorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchAuthors = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<AuthorInfo[]>>("/authors");
      if (response.data.success && response.data.data) {
        setAuthors(response.data.data);
        setError(null);
      } else {
        setError(response.data.error?.message || "Failed to fetch authors");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthors();
  }, [fetchAuthors]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleAddAuthor = async (username: string) => {
    const response = await api.post<ApiResponse<void>>("/authors", {
      username,
    });
    if (!response.data.success) {
      throw new Error(response.data.error?.message || "Failed to add author");
    }
    showSuccess(`Author @${username} added successfully`);
    await fetchAuthors();
  };

  const handleRemoveAuthor = async (username: string) => {
    try {
      const response = await api.delete<ApiResponse<void>>(
        `/authors/${username}`
      );
      if (!response.data.success) {
        setError(response.data.error?.message || "Failed to remove author");
        return;
      }
      showSuccess(`Author @${username} removed successfully`);
      await fetchAuthors();
    } catch (err) {
      setError("Failed to remove author");
    }
  };

  const handleCheckAuthor = async (username: string) => {
    try {
      const response = await api.post<ApiResponse<void>>(
        `/authors/${username}/check`
      );
      if (!response.data.success) {
        setError(response.data.error?.message || "Failed to check author");
        return;
      }
      showSuccess(`Check triggered for @${username}`);
      await fetchAuthors();
    } catch (err) {
      setError("Failed to check author");
    }
  };

  if (loading) {
    return (
      <div className="authors">
        <div className="authors__loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="authors">
      <div className="authors__header">
        <h1>Authors</h1>
      </div>

      {error && <div className="authors__error-banner">{error}</div>}
      {successMessage && (
        <div className="authors__success-banner">{successMessage}</div>
      )}

      <AddAuthorForm onAdd={handleAddAuthor} />

      <AuthorList
        authors={authors}
        onRemove={handleRemoveAuthor}
        onCheck={handleCheckAuthor}
      />
    </div>
  );
}

export default Authors;
