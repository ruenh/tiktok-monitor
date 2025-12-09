import { useState, FormEvent } from "react";

interface AddAuthorFormProps {
  onAdd: (username: string) => Promise<void>;
  disabled?: boolean;
}

function AddAuthorForm({ onAdd, disabled }: AddAuthorFormProps) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Username cannot be empty");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onAdd(trimmedUsername);
      setUsername("");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as {
          response?: { data?: { error?: { message?: string } } };
        };
        setError(
          axiosError.response?.data?.error?.message || "Failed to add author"
        );
      } else {
        setError("Failed to add author");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-author-form">
      <h2>Add Author</h2>
      <form onSubmit={handleSubmit}>
        <div className="add-author-form__row">
          <input
            type="text"
            className={`add-author-form__input ${
              error ? "add-author-form__input--error" : ""
            }`}
            placeholder="Enter TikTok username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            disabled={loading || disabled}
          />
          <button
            type="submit"
            className="add-author-form__btn"
            disabled={loading || disabled || !username.trim()}
          >
            {loading ? "Adding..." : "Add Author"}
          </button>
        </div>
        {error && <div className="add-author-form__error">{error}</div>}
      </form>
    </div>
  );
}

export default AddAuthorForm;
