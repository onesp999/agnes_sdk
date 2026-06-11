import { Pause, Play, RefreshCw, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { callBackend, extractVideoUrl, validateVideoFrames } from "../api";
import type { ApiJson } from "../api";
import { ResultPane } from "./ResultPane";

interface VideoPanelProps {
  backendBaseUrl: string;
}

export function VideoPanel({ backendBaseUrl }: VideoPanelProps) {
  const [prompt, setPrompt] = useState("A cat walking on the beach at sunset");
  const [inputImage, setInputImage] = useState("");
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [numFrames, setNumFrames] = useState(121);
  const [frameRate, setFrameRate] = useState(24);
  const [videoId, setVideoId] = useState("");
  const [polling, setPolling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiJson>();
  const [error, setError] = useState<string>();
  const intervalRef = useRef<number>();

  const frameError = validateVideoFrames(numFrames);
  const videoUrl = result ? extractVideoUrl(result) : undefined;

  async function createTask() {
    const validationError = validateVideoFrames(numFrames);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const response = await callBackend(backendBaseUrl, "/api/videos", {
        method: "POST",
        body: {
          prompt,
          width,
          height,
          num_frames: numFrames,
          frame_rate: frameRate,
          ...(inputImage.trim() ? { image: inputImage.trim() } : {}),
        },
      });
      setResult(response);
      const id = response.video_id ?? response.task_id;
      if (typeof id === "string") {
        setVideoId(id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus() {
    if (!videoId.trim()) {
      setError("Enter a video_id or create a task first.");
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      setResult(await callBackend(backendBaseUrl, `/api/videos/${encodeURIComponent(videoId.trim())}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!polling) {
      if (intervalRef.current !== undefined) {
        window.clearInterval(intervalRef.current);
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => {
      if (intervalRef.current !== undefined) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [polling, videoId, backendBaseUrl]);

  return (
    <div className="workspace">
      <section className="control-panel" aria-label="Video controls">
        <div className="panel-heading">
          <h2>Video</h2>
          <button type="button" onClick={createTask} disabled={loading || !prompt.trim() || !!frameError}>
            <Video size={18} />
            {loading ? "Working" : "Create"}
          </button>
        </div>

        <label>
          Prompt
          <textarea
            rows={6}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>

        <label>
          Image URL
          <input
            value={inputImage}
            onChange={(event) => setInputImage(event.target.value)}
            placeholder="Optional"
          />
        </label>

        <div className="field-grid">
          <label>
            Width
            <input type="number" min="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label>
            Height
            <input type="number" min="1" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
          <label>
            num_frames
            <input type="number" min="1" value={numFrames} onChange={(event) => setNumFrames(Number(event.target.value))} />
          </label>
          <label>
            frame_rate
            <input type="number" min="1" max="60" value={frameRate} onChange={(event) => setFrameRate(Number(event.target.value))} />
          </label>
        </div>

        {frameError && <div className="inline-error">{frameError}</div>}

        <div className="status-row">
          <label>
            video_id
            <input value={videoId} onChange={(event) => setVideoId(event.target.value)} />
          </label>
          <button className="icon-button" type="button" onClick={refreshStatus} title="Refresh status">
            <RefreshCw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setPolling((value) => !value)}
            title={polling ? "Stop polling" : "Start polling"}
          >
            {polling ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>
      </section>

      <ResultPane title="Video response" result={result} error={error}>
        {videoUrl && (
          <div className="media-preview">
            <video controls src={videoUrl} />
          </div>
        )}
      </ResultPane>
    </div>
  );
}
