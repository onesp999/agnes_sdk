import { Send } from "lucide-react";
import { useState } from "react";

import { callBackend, extractAssistantContent } from "../api";
import type { ApiJson } from "../api";
import { ResultPane } from "./ResultPane";

interface ChatPanelProps {
  backendBaseUrl: string;
}

export function ChatPanel({ backendBaseUrl }: ChatPanelProps) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [prompt, setPrompt] = useState("Hello");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiJson>();
  const [error, setError] = useState<string>();

  async function submit() {
    setLoading(true);
    setError(undefined);
    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
        { role: "user", content: prompt },
      ];
      setResult(
        await callBackend(backendBaseUrl, "/api/chat", {
          method: "POST",
          body: {
            messages,
            temperature,
            max_tokens: maxTokens,
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="workspace">
      <section className="control-panel" aria-label="Chat controls">
        <div className="panel-heading">
          <h2>Chat</h2>
          <button type="button" onClick={submit} disabled={loading || !prompt.trim()}>
            <Send size={18} />
            {loading ? "Sending" : "Send"}
          </button>
        </div>

        <label>
          System prompt
          <textarea
            rows={3}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label>
          Prompt
          <textarea
            rows={7}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <div className="field-grid">
          <label>
            Temperature
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
          </label>
          <label>
            Max tokens
            <input
              type="number"
              min="1"
              value={maxTokens}
              onChange={(event) => setMaxTokens(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <ResultPane title="Chat response" result={result} error={error}>
        {result && <div className="primary-output">{extractAssistantContent(result) || "No assistant content found."}</div>}
      </ResultPane>
    </div>
  );
}
