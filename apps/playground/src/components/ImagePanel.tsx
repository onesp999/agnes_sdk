import { ImageIcon } from "lucide-react";
import { useState } from "react";

import { callBackend, extractImagePreview } from "../api";
import type { ApiJson } from "../api";
import { ResultPane } from "./ResultPane";

interface ImagePanelProps {
  backendBaseUrl: string;
}

export function ImagePanel({ backendBaseUrl }: ImagePanelProps) {
  const [prompt, setPrompt] = useState("A clean product photo of a glass cube");
  const [size, setSize] = useState("1024x768");
  const [responseFormat, setResponseFormat] = useState<"url" | "b64_json">("url");
  const [inputImage, setInputImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiJson>();
  const [error, setError] = useState<string>();

  async function submit() {
    setLoading(true);
    setError(undefined);
    try {
      setResult(
        await callBackend(backendBaseUrl, "/api/images", {
          method: "POST",
          body: {
            prompt,
            size,
            response_format: responseFormat,
            return_base64: responseFormat === "b64_json",
            ...(inputImage.trim() ? { image: [inputImage.trim()] } : {}),
          },
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const preview = result ? extractImagePreview(result) : undefined;

  return (
    <div className="workspace">
      <section className="control-panel" aria-label="Image controls">
        <div className="panel-heading">
          <h2>Image</h2>
          <button type="button" onClick={submit} disabled={loading || !prompt.trim()}>
            <ImageIcon size={18} />
            {loading ? "Generating" : "Generate"}
          </button>
        </div>

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
            Size
            <input value={size} onChange={(event) => setSize(event.target.value)} />
          </label>
          <label>
            Output
            <select
              value={responseFormat}
              onChange={(event) => setResponseFormat(event.target.value as "url" | "b64_json")}
            >
              <option value="url">URL</option>
              <option value="b64_json">Base64</option>
            </select>
          </label>
        </div>

        <label>
          Input image URL
          <input
            value={inputImage}
            onChange={(event) => setInputImage(event.target.value)}
            placeholder="Optional image-to-image URL"
          />
        </label>
      </section>

      <ResultPane title="Image response" result={result} error={error}>
        {preview && (
          <div className="media-preview">
            <img src={preview} alt="Generated preview" />
          </div>
        )}
      </ResultPane>
    </div>
  );
}
