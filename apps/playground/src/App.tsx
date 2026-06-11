import { ImageIcon, MessageSquare, Play, RefreshCw, Server, Video } from "lucide-react";
import { useState } from "react";

import { callBackend, defaultBackendBaseUrl } from "./api";
import type { ApiJson } from "./api";
import { ChatPanel } from "./components/ChatPanel";
import { ImagePanel } from "./components/ImagePanel";
import { VideoPanel } from "./components/VideoPanel";

type ActiveTab = "chat" | "image" | "video";

const tabs: Array<{ id: ActiveTab; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
];

export function App() {
  const [backendBaseUrl, setBackendBaseUrl] = useState(defaultBackendBaseUrl());
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [health, setHealth] = useState<"idle" | "ok" | "error">("idle");

  async function checkHealth() {
    setHealth("idle");
    try {
      await callBackend<ApiJson>(backendBaseUrl, "/health");
      setHealth("ok");
    } catch {
      setHealth("error");
    }
  }

  const healthLabel = health === "ok" ? "Connected" : health === "error" ? "Unavailable" : "Not checked";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Agnes AI Playground</h1>
          <p>Debug Chat, Image, and Video through a local backend proxy.</p>
        </div>
        <div className={`health-pill health-${health}`} aria-label={`Backend status: ${healthLabel}`}>
          <span />
          {healthLabel}
        </div>
      </header>

      <section className="backend-bar" aria-label="Backend configuration">
        <label htmlFor="backend-url">
          <Server size={18} />
          Backend
        </label>
        <input
          id="backend-url"
          value={backendBaseUrl}
          onChange={(event) => setBackendBaseUrl(event.target.value)}
          spellCheck={false}
        />
        <button className="icon-button" type="button" onClick={checkHealth} title="Check backend">
          <RefreshCw size={18} />
        </button>
      </section>

      <nav className="tabs" aria-label="Playground modes">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "chat" && <ChatPanel backendBaseUrl={backendBaseUrl} />}
      {activeTab === "image" && <ImagePanel backendBaseUrl={backendBaseUrl} />}
      {activeTab === "video" && <VideoPanel backendBaseUrl={backendBaseUrl} />}

      <footer>
        <Play size={16} />
        Requests are sent only to the configured backend URL.
      </footer>
    </main>
  );
}
