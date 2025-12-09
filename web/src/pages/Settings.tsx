import { useState, useEffect, useCallback } from "react";
import api, { Config, ApiResponse } from "../api/client";
import "./Settings.css";

interface FormErrors {
  webhookUrl?: string;
  pollingInterval?: string;
}

/**
 * Validates webhook URL format
 * Requirements: 4.2, 4.4
 */
function validateWebhookUrl(url: string): string | undefined {
  if (!url.trim()) {
    return "Webhook URL is required";
  }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "URL must use http or https protocol";
    }
  } catch {
    return "Invalid URL format";
  }
  return undefined;
}

/**
 * Validates polling interval
 * Requirements: 4.3, 4.4
 */
function validatePollingInterval(interval: number): string | undefined {
  if (isNaN(interval)) {
    return "Polling interval must be a number";
  }
  if (interval < 60 || interval > 3600) {
    return "Polling interval must be between 60 and 3600 seconds";
  }
  return undefined;
}

/**
 * Settings page component
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [pollingInterval, setPollingInterval] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Fetches current config from API
   * Requirements: 4.1
   */
  const fetchConfig = useCallback(async () => {
    try {
      const response = await api.get<ApiResponse<Config>>("/config");
      if (response.data.success && response.data.data) {
        const configData = response.data.data;
        setConfig(configData);
        setWebhookUrl(configData.webhookUrl);
        setPollingInterval(configData.pollingInterval.toString());
        setError(null);
        setIsDirty(false);
      } else {
        setError(response.data.error?.message || "Failed to fetch config");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  /**
   * Handles webhook URL input change
   */
  const handleWebhookUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWebhookUrl(value);
    setIsDirty(true);
    setSuccess(null);

    // Clear error when user starts typing
    if (formErrors.webhookUrl) {
      setFormErrors((prev) => ({ ...prev, webhookUrl: undefined }));
    }
  };

  /**
   * Handles polling interval input change
   */
  const handlePollingIntervalChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setPollingInterval(value);
    setIsDirty(true);
    setSuccess(null);

    // Clear error when user starts typing
    if (formErrors.pollingInterval) {
      setFormErrors((prev) => ({ ...prev, pollingInterval: undefined }));
    }
  };

  /**
   * Validates form and returns true if valid
   */
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    const urlError = validateWebhookUrl(webhookUrl);
    if (urlError) {
      errors.webhookUrl = urlError;
    }

    const intervalError = validatePollingInterval(
      parseInt(pollingInterval, 10)
    );
    if (intervalError) {
      errors.pollingInterval = intervalError;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Handles form submission
   * Requirements: 4.2, 4.3, 4.4
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.patch<ApiResponse<Config>>("/config", {
        webhookUrl,
        pollingInterval: parseInt(pollingInterval, 10),
      });

      if (response.data.success && response.data.data) {
        const configData = response.data.data;
        setConfig(configData);
        setWebhookUrl(configData.webhookUrl);
        setPollingInterval(configData.pollingInterval.toString());
        setSuccess("Settings saved successfully");
        setIsDirty(false);
      } else {
        setError(response.data.error?.message || "Failed to save settings");
      }
    } catch (err) {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Resets form to original config values
   */
  const handleReset = () => {
    if (config) {
      setWebhookUrl(config.webhookUrl);
      setPollingInterval(config.pollingInterval.toString());
      setFormErrors({});
      setIsDirty(false);
      setSuccess(null);
      setError(null);
    }
  };

  if (loading) {
    return (
      <div className="settings">
        <div className="settings__loading">Loading...</div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="settings">
        <div className="settings__error">
          <p>{error}</p>
          <button onClick={fetchConfig}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h1>Settings</h1>
      </div>

      {error && <div className="settings__error-banner">{error}</div>}
      {success && <div className="settings__success-banner">{success}</div>}

      <form className="config-form" onSubmit={handleSubmit}>
        <h2>Configuration</h2>

        <div className="config-form__field">
          <label className="config-form__label" htmlFor="webhookUrl">
            Webhook URL
          </label>
          <input
            id="webhookUrl"
            type="text"
            className={`config-form__input ${
              formErrors.webhookUrl ? "config-form__input--error" : ""
            }`}
            value={webhookUrl}
            onChange={handleWebhookUrlChange}
            placeholder="https://example.com/webhook"
          />
          <div className="config-form__hint">
            The URL where video notifications will be sent
          </div>
          {formErrors.webhookUrl && (
            <div className="config-form__field-error">
              {formErrors.webhookUrl}
            </div>
          )}
        </div>

        <div className="config-form__field">
          <label className="config-form__label" htmlFor="pollingInterval">
            Polling Interval (seconds)
          </label>
          <input
            id="pollingInterval"
            type="number"
            className={`config-form__input ${
              formErrors.pollingInterval ? "config-form__input--error" : ""
            }`}
            value={pollingInterval}
            onChange={handlePollingIntervalChange}
            min={60}
            max={3600}
            placeholder="300"
          />
          <div className="config-form__hint">
            How often to check for new videos (60-3600 seconds)
          </div>
          {formErrors.pollingInterval && (
            <div className="config-form__field-error">
              {formErrors.pollingInterval}
            </div>
          )}
        </div>

        <div className="config-form__actions">
          <button
            type="submit"
            className="config-form__btn config-form__btn--primary"
            disabled={saving || !isDirty}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
          <button
            type="button"
            className="config-form__btn config-form__btn--secondary"
            onClick={handleReset}
            disabled={saving || !isDirty}
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
