import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type ModelKind = "chat" | "image" | "video";
type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  media?: { kind: "image" | "video"; url: string };
  videoId?: string;
  videoModel?: string;
  videoStatus?: string;
};
type RequestSettings = {
  model: string;
  systemPrompt: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  advanced: string;
};

const defaultSettings: RequestSettings = {
  model: "agnes-2.0-flash",
  systemPrompt: "",
  temperature: "",
  topP: "",
  maxTokens: "",
  advanced: "{}",
};

const modelPresetGroups = [
  {
    label: "文本",
    models: ["agnes-2.0-flash", "agnes-2.5-flash", "agnes-2.5-pro-alpha", "agnes-2.5-pro"],
  },
  {
    label: "图像",
    models: ["agnes-image-2.0-flash", "agnes-image-2.1-flash"],
  },
  {
    label: "视频",
    models: ["agnes-video-v2.0", "agnes-video-2.5", "agnes-video-2.5-flash"],
  },
] as const;

const modelPresets = modelPresetGroups.flatMap((group) => group.models);

const suggestions = [
  ["帮我写代码", "创建一个 TypeScript API 客户端"],
  ["分析内容", "把一段复杂材料整理成要点"],
  ["规划项目", "制定清晰、可执行的开发计划"],
  ["自由提问", "从一个问题开始探索"],
];

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RequestSettings>(defaultSettings);
  const [refreshingVideos, setRefreshingVideos] = useState<Set<number>>(() => new Set());
  const [status, setStatus] = useState<"checking" | "demo" | "agnes" | "offline">("checking");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    fetch("/health")
      .then((response) => response.json())
      .then((data: { mode?: string }) => setStatus(data.mode === "agnes" ? "agnes" : "demo"))
      .catch(() => setStatus("offline"));
  }, []);

  function newChat() {
    setMessages([]);
    setDraft("");
    inputRef.current?.focus();
  }

  function updateSetting<Key extends keyof RequestSettings>(key: Key, value: RequestSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function send(content = draft) {
    const clean = content.trim();
    if (!clean || pending) return;
    const user: Message = { id: nextId.current++, role: "user", content: clean };
    const conversation = [...messages, user];
    setMessages(conversation);
    setDraft("");
    setPending(true);

    try {
      const kind = getModelKind(settings.model);
      const parameters = buildParameters(settings, kind);
      const request = buildRequest(kind, clean, conversation, settings.systemPrompt, parameters);
      const response = await fetch(request.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.body),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setMessages((current) => [...current, {
        id: nextId.current++,
        role: "assistant",
        ...readResult(kind, payload, settings.model.trim()),
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: nextId.current++, role: "assistant",
        content: `请求失败：${error instanceof Error ? error.message : "请检查本地后端。"}`,
      }]);
    } finally {
      setPending(false);
    }
  }

  async function refreshVideo(message: Message) {
    if (!message.videoId || refreshingVideos.has(message.id)) return;
    setRefreshingVideos((current) => new Set(current).add(message.id));
    try {
      const query = message.videoModel ? `?model=${encodeURIComponent(message.videoModel)}` : "";
      const response = await fetch(`/api/videos/${encodeURIComponent(message.videoId)}${query}`);
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, ...readVideoResult(payload, message.videoModel ?? "") }
        : item));
    } catch (error) {
      setMessages((current) => current.map((item) => item.id === message.id
        ? { ...item, content: `视频状态查询失败：${error instanceof Error ? error.message : "请稍后重试。"}` }
        : item));
    } finally {
      setRefreshingVideos((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  const statusText = status === "agnes" ? "Agnes 已连接" : status === "demo" ? "本地演示" : status === "offline" ? "后端离线" : "连接中";
  const modelText = settings.model.trim() || "模型默认值";
  const modelKind = getModelKind(settings.model);
  const selectedPreset = modelPresets.some((model) => model === settings.model)
    ? settings.model
    : "custom";

  return (
    <main className={`app ${sidebarOpen ? "" : "collapsed"}`}>
      {sidebarOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar">
        <header><button className="brand" onClick={newChat}><span>A</span>Agnes AI</button><button className="collapse" onClick={() => setSidebarOpen(false)}>‹</button></header>
        <button className="new-chat" onClick={newChat}><b>＋</b>新对话<kbd>Ctrl K</kbd></button>
        <footer><div className="profile-avatar">E</div><p><strong>Demo 用户</strong><small>{statusText}</small></p><i>•••</i></footer>
      </aside>

      <section className="stage">
        <header className="topbar">
          {!sidebarOpen && <button className="menu" onClick={() => setSidebarOpen(true)}>☰</button>}
          <button className="model" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
            <span className="model-name">{modelText}</span><span>{settingsOpen ? "⌃" : "⌄"}</span>
          </button>
          <span className={`status ${status}`}><i />{statusText}</span>
        </header>

        {settingsOpen && <section className="settings-panel" aria-label="请求参数设置">
          <header><div><strong>请求参数</strong><small>配置会应用到之后发送的消息</small></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="关闭请求参数">×</button></header>
          <div className="settings-grid">
            <label className="wide">模型预设<select value={selectedPreset} onChange={(event) => {
              if (event.target.value !== "custom") updateSetting("model", event.target.value);
            }}>
              {modelPresetGroups.map((group) => <optgroup label={group.label} key={group.label}>
                {group.models.map((model) => <option value={model} key={model}>{model}</option>)}
              </optgroup>)}
              <option value="custom">自定义模型</option>
            </select></label>
            <label className="wide">模型名称（可自定义）<input value={settings.model} onChange={(event) => updateSetting("model", event.target.value)} placeholder="agnes-2.0-flash" maxLength={200} /></label>
            {modelKind === "chat" ? <>
              <label>Temperature<input type="number" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => updateSetting("temperature", event.target.value)} placeholder="模型默认" /></label>
              <label>Top P<input type="number" min="0" max="1" step="0.05" value={settings.topP} onChange={(event) => updateSetting("topP", event.target.value)} placeholder="模型默认" /></label>
              <label>Max tokens<input type="number" min="1" max="1000000" step="1" value={settings.maxTokens} onChange={(event) => updateSetting("maxTokens", event.target.value)} placeholder="模型默认" /></label>
              <label className="wide">System Prompt<textarea rows={3} value={settings.systemPrompt} onChange={(event) => updateSetting("systemPrompt", event.target.value)} placeholder="可选，例如：请用简洁的中文回答。" maxLength={8000} /></label>
            </> : <div className="model-kind-note wide">
              {modelKind === "image" ? "图片模型会调用 /api/images。尺寸、输出格式等参数可在高级 JSON 中配置。" : "视频模型会调用 /api/videos。创建任务后可在消息中刷新生成状态。"}
            </div>}
          </div>
          <details>
            <summary>高级 JSON 参数</summary>
            <textarea className="advanced-json" rows={6} spellCheck={false} value={settings.advanced} onChange={(event) => updateSetting("advanced", event.target.value)} aria-label="高级 JSON 参数" />
            <small>{advancedHelp(modelKind)}</small>
          </details>
          <footer><button type="button" onClick={() => setSettings(defaultSettings)}>恢复默认</button><span>{modelText}</span></footer>
        </section>}

        {messages.length === 0 ? <>
          <div className="welcome"><div className="hero">A</div><h1>今天想聊些什么？</h1><p>我可以帮你分析问题、编写代码、整理想法，或一起探索新的可能。</p></div>
          <div className="suggestions">{suggestions.map(([title, text]) => <button key={title} onClick={() => void send(text)}><strong>{title}</strong><span>{text}</span><i>↗</i></button>)}</div>
        </> : <div className="thread" aria-live="polite">
          {messages.map((message) => <article className={message.role} key={message.id}><div className="avatar">{message.role === "assistant" ? "A" : "E"}</div><div className="message-body"><strong>{message.role === "assistant" ? "Agnes AI" : "你"}</strong><p>{message.content}</p>
            {message.media?.kind === "image" && <img className="generated-media" src={message.media.url} alt="Agnes 生成的图片" />}
            {message.media?.kind === "video" && <video className="generated-media" src={message.media.url} controls />}
            {message.videoId && message.videoStatus !== "completed" && message.videoStatus !== "failed" && <button className="refresh-video" type="button" disabled={refreshingVideos.has(message.id)} onClick={() => void refreshVideo(message)}>
              {refreshingVideos.has(message.id) ? "正在查询…" : "刷新视频状态"}
            </button>}
          </div></article>)}
          {pending && <article><div className="avatar">A</div><div><strong>Agnes AI</strong><div className="typing"><i /><i /><i /></div></div></article>}
        </div>}

        <div className="composer-wrap"><form className="composer" onSubmit={submit}>
          <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} placeholder={composerPlaceholder(modelKind)} aria-label="发送消息" rows={1} />
          <div><button type="button" className="tool">＋</button><span /><button className="send" disabled={pending || !draft.trim()}>↑</button></div>
        </form><small>{modelKind === "chat" ? "Agnes AI 可能会犯错，请核查重要信息。" : "媒体生成可能需要一些时间，请勿重复提交。"}</small></div>
      </section>
    </main>
  );
}

function readText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : null;
  const content = message && typeof message === "object" ? (message as Record<string, unknown>).content : null;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("后端返回格式无法识别。");
}

function buildRequest(
  kind: ModelKind,
  prompt: string,
  conversation: Message[],
  systemPrompt: string,
  parameters: Record<string, unknown>,
) {
  if (kind !== "chat") {
    return { endpoint: kind === "image" ? "/api/images" : "/api/videos", body: { prompt, parameters } };
  }
  const messages = [
    ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
    ...conversation.map(({ role, content }) => ({ role, content })),
  ];
  return { endpoint: "/api/chat", body: { messages, parameters } };
}

function readResult(kind: ModelKind, payload: Record<string, unknown>, model: string): Omit<Message, "id" | "role"> {
  if (kind === "chat") return { content: readText(payload) };
  if (kind === "image") {
    const url = readImageUrl(payload);
    return url
      ? { content: "图片生成完成。", media: { kind: "image", url } }
      : { content: `图片请求已完成，但返回中没有可预览的图片。\n${formatPayload(payload)}` };
  }
  return readVideoResult(payload, model);
}

function readImageUrl(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.data) ? payload.data : [];
  const first = isRecord(items[0]) ? items[0] : undefined;
  if (typeof first?.url === "string" && first.url) return first.url;
  if (typeof first?.b64_json === "string" && first.b64_json) return `data:image/png;base64,${first.b64_json}`;
  return undefined;
}

export function readVideoResult(payload: Record<string, unknown>, model: string): Omit<Message, "id" | "role"> {
  const nested = isRecord(payload.data) ? payload.data : undefined;
  const metadata = isRecord(payload.metadata) ? payload.metadata : undefined;
  const nestedMetadata = nested && isRecord(nested.metadata) ? nested.metadata : undefined;
  const videoUrl = readString(payload, "video_url", "remixed_from_video_id", "url")
    ?? readString(metadata ?? {}, "url", "video_url")
    ?? (nested ? readString(nested, "video_url", "remixed_from_video_id", "url") : undefined)
    ?? readString(nestedMetadata ?? {}, "url", "video_url");
  const videoId = readString(payload, "video_id", "task_id", "id")
    ?? (nested ? readString(nested, "video_id", "task_id", "id") : undefined);
  const status = (readString(payload, "status") ?? (nested ? readString(nested, "status") : undefined) ?? "queued").toLowerCase();
  const progress = readNumberOrString(payload, "progress") ?? (nested ? readNumberOrString(nested, "progress") : undefined);
  const detail = readString(payload, "message")
    ?? (nested ? readString(nested, "message") : undefined)
    ?? readErrorDetail(payload.error)
    ?? (nested ? readErrorDetail(nested.error) : undefined);
  const completedWithoutUrl = status === "completed" && !videoUrl;
  const title = status === "failed"
    ? "视频生成失败。"
    : videoUrl
      ? "视频生成完成。"
      : completedWithoutUrl
        ? "视频任务已完成，但响应中没有可播放的视频地址。"
        : status === "in_progress"
          ? "视频正在生成。"
          : "视频任务已创建。";
  const content = [
    title,
    videoId ? `任务 ID：${videoId}` : "",
    `状态：${status}`,
    progress !== undefined ? `进度：${progress}%` : "",
    detail ?? "",
    completedWithoutUrl ? describeVideoResponse(payload, metadata ?? nestedMetadata) : "",
  ].filter(Boolean).join("\n");
  return {
    content,
    ...(videoUrl ? { media: { kind: "video" as const, url: videoUrl } } : {}),
    ...(videoId ? { videoId } : {}),
    videoModel: model,
    videoStatus: status,
  };
}

function readString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
  }
  return undefined;
}

function readNumberOrString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

function readErrorDetail(value: unknown) {
  if (typeof value === "string" && value) return value;
  return isRecord(value) ? readString(value, "message", "detail") : undefined;
}

function describeVideoResponse(payload: Record<string, unknown>, metadata?: Record<string, unknown>) {
  const topLevelFields = Object.keys(payload).sort().join(", ") || "无";
  const metadataFields = metadata ? Object.keys(metadata).sort().join(", ") || "无" : "无 metadata";
  return `诊断：未找到 metadata.url；响应字段：${topLevelFields}；metadata 字段：${metadataFields}。`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatPayload(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}

function getModelKind(model: string): ModelKind {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("agnes-image-")) return "image";
  if (normalized.startsWith("agnes-video-")) return "video";
  return "chat";
}

function composerPlaceholder(kind: ModelKind) {
  return kind === "image" ? "描述你想生成的图片" : kind === "video" ? "描述你想生成的视频" : "给 Agnes AI 发送消息";
}

function advancedHelp(kind: ModelKind) {
  if (kind === "image") return "可设置 size、responseFormat、returnBase64、image、extraBody 等图片参数；prompt 和 model 由界面管理。";
  if (kind === "video") return "可设置 width、height、numFrames、frameRate、numInferenceSteps、seed、negativePrompt、image、extraBody 等视频参数；prompt 和 model 由界面管理。";
  return "可设置 tools、toolChoice、thinking、chatTemplateKwargs 或 SDK 支持的其他字段；messages 和 stream 由应用管理。";
}

function buildParameters(settings: RequestSettings, kind: ModelKind) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(settings.advanced || "{}");
  } catch {
    throw new Error("高级参数不是有效的 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("高级参数必须是 JSON 对象。");
  }

  const parameters = { ...(parsed as Record<string, unknown>) };
  if ("messages" in parameters || "prompt" in parameters || "stream" in parameters) {
    throw new Error("高级参数不能设置 messages、prompt 或 stream。");
  }
  if (settings.model.trim()) parameters.model = settings.model.trim();
  if (kind === "chat") {
    setOptionalNumber(parameters, "temperature", settings.temperature, 0, 2);
    setOptionalNumber(parameters, "topP", settings.topP, 0, 1);
    setOptionalNumber(parameters, "maxTokens", settings.maxTokens, 1, 1_000_000, true);
  }
  return parameters;
}

function setOptionalNumber(
  target: Record<string, unknown>,
  key: string,
  rawValue: string,
  minimum: number,
  maximum: number,
  integer = false,
) {
  if (!rawValue.trim()) return;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${key} 必须是 ${minimum} 到 ${maximum} 之间${integer ? "的整数" : "的数字"}。`);
  }
  target[key] = value;
}

function readError(payload: Record<string, unknown>) {
  const error = payload.error;
  return error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string"
    ? String((error as Record<string, unknown>).message) : "请检查本地后端。";
}
