import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { MarkdownMessage } from "./components/Message/MarkdownMessage.js";
import {
  appendMessage,
  createMessage,
  editUserAndCreateAssistant,
  generationContext,
  groupConversations,
  restartAssistantTurn,
  updateMessage,
} from "./features/conversations/model.js";
import { useConversations } from "./features/conversations/useConversations.js";
import { readImageResult, readImageUrl, readVideoResult, videoMessageStatus } from "./features/media/results.js";
import {
  advancedHelp,
  buildParameters,
  composerPlaceholder,
  getModelKind,
  modelPresetGroups,
  modelPresets,
} from "./features/settings/model.js";
import { streamChat } from "./services/api/chat.js";
import { isTerminalVideoStatus, pollVideoTask } from "./services/api/video.js";
import { loadPreferences, savePreferences } from "./storage/preferences.js";
import type { Conversation, Message } from "./types/conversation.js";
import { defaultSettings, type RequestSettings } from "./types/settings.js";
import { copyText } from "./utils/clipboard.js";

export { defaultSettings } from "./types/settings.js";
export { buildParameters, readImageUrl, readVideoResult };

const suggestions = [
  ["帮我写代码", "创建一个 TypeScript API 客户端"],
  ["分析内容", "把一段复杂材料整理成要点"],
  ["规划项目", "制定清晰、可执行的开发计划"],
  ["自由提问", "从一个问题开始探索"],
];

export function App() {
  const [initialPreferences] = useState(loadPreferences);
  const conversationState = useConversations();
  const messages = conversationState.activeConversation?.messages ?? [];
  const [draft, setDraft] = useState("");
  const [activeGeneration, setActiveGeneration] = useState<{
    conversationId: string;
    assistantId: string;
  }>();
  const activeRequestRef = useRef<{
    conversationId: string;
    assistantId: string;
    controller: AbortController;
  }>();
  const requestInFlightRef = useRef(false);
  const [mediaPendingConversationId, setMediaPendingConversationId] = useState<string>();
  const pending = activeGeneration !== undefined || mediaPendingConversationId !== undefined;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string>();
  const copyResetTimeoutRef = useRef<number | undefined>(undefined);
  const [settings, setSettings] = useState<RequestSettings>(() => {
    if (initialPreferences.developerMode || modelPresets.some((model) => model === initialPreferences.settings.model)) {
      return initialPreferences.settings;
    }
    return { ...initialPreferences.settings, model: defaultSettings.model };
  });
  const [developerMode, setDeveloperMode] = useState(initialPreferences.developerMode);
  const videoPollingRef = useRef(new Map<string, AbortController>());
  const [status, setStatus] = useState<"checking" | "demo" | "agnes" | "offline">("checking");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    fetch("/health")
      .then((response) => response.json())
      .then((data: { mode?: string }) => setStatus(data.mode === "agnes" ? "agnes" : "demo"))
      .catch(() => setStatus("offline"));
  }, []);

  useEffect(() => {
    savePreferences({ developerMode, settings });
  }, [developerMode, settings]);

  useEffect(() => () => {
    activeRequestRef.current?.controller.abort();
    for (const controller of videoPollingRef.current.values()) controller.abort();
    videoPollingRef.current.clear();
    if (copyResetTimeoutRef.current !== undefined) window.clearTimeout(copyResetTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!conversationState.ready) return;
    for (const conversation of conversationState.conversations) {
      for (const message of conversation.messages) {
        if (message.videoId && !isTerminalVideoStatus(message.videoStatus)) {
          startVideoPolling(
            conversation.id,
            message.id,
            message.videoId,
            message.videoModel || message.model,
          );
        }
      }
    }
  }, [conversationState.ready, conversationState.conversations]);

  function newChat() {
    if (!conversationState.ready) return;
    conversationState.createNew();
    setDraft("");
    inputRef.current?.focus();
  }

  function switchConversation(id: string) {
    conversationState.select(id);
    setDraft("");
    inputRef.current?.focus();
  }

  function renameChat(conversation: Conversation) {
    const title = window.prompt("重命名对话", conversation.title);
    if (title?.trim()) conversationState.rename(conversation.id, title);
  }

  function deleteChat(conversation: Conversation) {
    const confirmed = conversation.messages.length === 0
      || window.confirm(`删除“${conversation.title}”？此操作仅删除本地记录。`);
    if (confirmed) conversationState.remove(conversation.id);
  }

  function updateSetting<Key extends keyof RequestSettings>(key: Key, value: RequestSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleDeveloperMode() {
    setDeveloperMode((current) => {
      const next = !current;
      if (!next) {
        setSettings((currentSettings) => modelPresets.some((model) => model === currentSettings.model)
          ? { ...currentSettings, advanced: "{}" }
          : { ...currentSettings, model: defaultSettings.model, advanced: "{}" });
      }
      return next;
    });
  }

  async function send(content = draft) {
    const clean = content.trim();
    const activeConversation = conversationState.activeConversation;
    if (!clean || pending || requestInFlightRef.current || !activeConversation) return;
    requestInFlightRef.current = true;
    const conversationId = activeConversation.id;
    const user = createMessage("user", clean, { model: settings.model.trim() || undefined });
    const conversationWithUser = appendMessage(activeConversation, user);

    try {
      const kind = getModelKind(settings.model);
      const parameters = buildParameters(settings, kind);
      setDraft("");
      if (kind === "chat") {
        const assistant = createMessage("assistant", "", {
          status: "pending",
          model: settings.model.trim() || undefined,
        });
        const conversation = appendMessage(conversationWithUser, assistant);
        conversationState.update(conversationId, () => conversation);
        await runChatGeneration(
          conversation,
          assistant.id,
          parameters,
          settings.systemPrompt,
        );
        return;
      }

      if (kind === "image") {
        const assistant = createMessage("assistant", "", {
          status: "pending",
          model: settings.model.trim() || undefined,
        });
        const conversation = appendMessage(conversationWithUser, assistant);
        conversationState.update(conversationId, () => conversation);
        await runImageGeneration(
          conversation,
          assistant.id,
          clean,
          parameters,
          settings.model.trim(),
        );
        return;
      }

      const assistant = createMessage("assistant", "正在创建视频任务…", {
        status: "pending",
        model: settings.model.trim() || undefined,
      });
      const conversation = appendMessage(conversationWithUser, assistant);
      conversationState.update(conversationId, () => conversation);
      await runVideoGeneration(
        conversation,
        assistant.id,
        clean,
        parameters,
        settings.model.trim(),
      );
    } catch (error) {
      if (getModelKind(settings.model) === "chat") {
        const current = conversationState.conversations.find((item) => item.id === conversationId);
        if (!current?.messages.some((message) => message.id === user.id)) {
          const assistant = createMessage(
            "assistant",
            `请求失败：${error instanceof Error ? error.message : "请检查本地后端。"}`,
            { status: "failed", model: settings.model.trim() || undefined },
          );
          conversationState.update(conversationId, () => appendMessage(conversationWithUser, assistant));
        }
        return;
      }
      const assistant = createMessage(
        "assistant",
        `请求失败：${error instanceof Error ? error.message : "请检查本地后端。"}`,
        { status: "failed", model: settings.model.trim() || undefined },
      );
      conversationState.update(conversationId, (current) => appendMessage(current, assistant));
    } finally {
      requestInFlightRef.current = false;
      setActiveGeneration((current) => current?.conversationId === conversationId ? undefined : current);
      setMediaPendingConversationId((current) => current === conversationId ? undefined : current);
    }
  }

  async function runChatGeneration(
    conversation: Conversation,
    assistantId: string,
    parameters: Record<string, unknown>,
    systemPrompt: string,
  ) {
    if (activeRequestRef.current) return;
    const controller = new AbortController();
    const requestState = { conversationId: conversation.id, assistantId, controller };
    activeRequestRef.current = requestState;
    setActiveGeneration({ conversationId: conversation.id, assistantId });

    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
        ...generationContext(conversation, assistantId),
      ];
      await streamChat({ messages, parameters }, {
        signal: controller.signal,
        onEvent(event) {
          if (event.type !== "delta" || !event.content) return;
          conversationState.update(conversation.id, (current) => updateMessage(
            current,
            assistantId,
            (message) => ({
              ...message,
              content: `${message.content}${event.content}`,
              status: "streaming",
            }),
          ));
        },
      });
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({ ...message, status: "completed" }),
      ));
    } catch (error) {
      const cancelled = controller.signal.aborted;
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({
          ...message,
          status: cancelled ? "cancelled" : "failed",
          content: cancelled
            ? message.content || "生成已停止。"
            : `${message.content}${message.content ? "\n\n" : ""}生成失败：${error instanceof Error ? error.message : "请稍后重试。"}`,
        }),
      ));
    } finally {
      if (activeRequestRef.current === requestState) activeRequestRef.current = undefined;
      setActiveGeneration((current) => current?.assistantId === assistantId ? undefined : current);
    }
  }

  async function runImageGeneration(
    conversation: Conversation,
    assistantId: string,
    prompt: string,
    parameters: Record<string, unknown>,
    model: string,
  ) {
    setMediaPendingConversationId(conversation.id);
    try {
      const response = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, parameters }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const result = readImageResult(payload);
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({ ...message, ...result, status: "completed" }),
      ));
    } catch (error) {
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({
          ...message,
          content: `图片生成失败：${error instanceof Error ? error.message : "请稍后重试。"}`,
          status: "failed",
        }),
      ));
    } finally {
      setMediaPendingConversationId((current) => current === conversation.id ? undefined : current);
    }
  }

  async function runVideoGeneration(
    conversation: Conversation,
    assistantId: string,
    prompt: string,
    parameters: Record<string, unknown>,
    model: string,
  ) {
    setMediaPendingConversationId(conversation.id);
    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, parameters }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(readError(payload));
      const result = readVideoResult(payload, model);
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({ ...message, ...result, status: videoMessageStatus(result.videoStatus) }),
      ));
      if (result.videoId && !isTerminalVideoStatus(result.videoStatus)) {
        startVideoPolling(conversation.id, assistantId, result.videoId, model);
      }
    } catch (error) {
      conversationState.update(conversation.id, (current) => updateMessage(
        current,
        assistantId,
        (message) => ({
          ...message,
          content: `视频任务创建失败：${error instanceof Error ? error.message : "请稍后重试。"}`,
          status: "failed",
        }),
      ));
    } finally {
      setMediaPendingConversationId((current) => current === conversation.id ? undefined : current);
    }
  }

  function startVideoPolling(
    conversationId: string,
    messageId: string,
    videoId: string,
    model?: string,
  ) {
    if (videoPollingRef.current.has(messageId)) return;
    const controller = new AbortController();
    videoPollingRef.current.set(messageId, controller);
    conversationState.update(conversationId, (conversation) => updateMessage(
      conversation,
      messageId,
      (message) => ({ ...message, status: "streaming" }),
    ));

    void pollVideoTask({
      videoId,
      model,
      signal: controller.signal,
      onUpdate(payload) {
        const result = readVideoResult(payload, model ?? "");
        conversationState.update(conversationId, (conversation) => updateMessage(
          conversation,
          messageId,
          (message) => ({ ...message, ...result, status: videoMessageStatus(result.videoStatus) }),
        ));
      },
    }).catch((error) => {
      if (controller.signal.aborted) return;
      conversationState.update(conversationId, (conversation) => updateMessage(
        conversation,
        messageId,
        (message) => ({
          ...message,
          content: `视频状态查询失败：${error instanceof Error ? error.message : "请稍后重试。"}`,
          status: "failed",
        }),
      ));
    }).finally(() => {
      videoPollingRef.current.delete(messageId);
    });
  }

  function stopGeneration() {
    activeRequestRef.current?.controller.abort();
  }

  function retryOrRegenerate(message: Message) {
    const conversation = conversationState.activeConversation;
    if (!conversation || pending || activeRequestRef.current) return;
    try {
      const model = message.model || settings.model;
      const requestSettings = { ...settings, model };
      const parameters = buildParameters(requestSettings, "chat");
      const restarted = restartAssistantTurn(conversation, message.id);
      conversationState.update(conversation.id, () => restarted);
      void runChatGeneration(restarted, message.id, parameters, settings.systemPrompt);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法重新生成。" );
    }
  }

  function editAndResend(message: Message) {
    const conversation = conversationState.activeConversation;
    if (!conversation || pending || activeRequestRef.current) return;
    const content = window.prompt("编辑消息并重新发送", message.content);
    if (!content?.trim()) return;
    try {
      const parameters = buildParameters(settings, "chat");
      const assistant = createMessage("assistant", "", {
        status: "pending",
        model: settings.model.trim() || undefined,
      });
      const edited = editUserAndCreateAssistant(conversation, message.id, content, assistant);
      conversationState.update(conversation.id, () => edited);
      void runChatGeneration(edited, assistant.id, parameters, settings.systemPrompt);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法编辑并重新发送。" );
    }
  }

  function retryImage(message: Message) {
    const conversation = conversationState.activeConversation;
    if (!conversation || pending || requestInFlightRef.current) return;
    const index = conversation.messages.findIndex((item) => item.id === message.id);
    const user = conversation.messages[index - 1];
    if (!user || user.role !== "user") return;
    try {
      const model = message.model || settings.model;
      const requestSettings = { ...settings, model };
      const parameters = buildParameters(requestSettings, "image");
      const restarted = restartAssistantTurn(conversation, message.id);
      conversationState.update(conversation.id, () => restarted);
      requestInFlightRef.current = true;
      void runImageGeneration(restarted, message.id, user.content, parameters, model)
        .finally(() => { requestInFlightRef.current = false; });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法重新生成图片。" );
    }
  }

  function reusePrompt(message: Message) {
    setDraft(message.content);
    inputRef.current?.focus();
  }

  function retryVideo(message: Message) {
    const conversation = conversationState.activeConversation;
    if (!conversation || pending || requestInFlightRef.current) return;
    if (message.videoId) {
      startVideoPolling(
        conversation.id,
        message.id,
        message.videoId,
        message.videoModel || message.model,
      );
      return;
    }
    const index = conversation.messages.findIndex((item) => item.id === message.id);
    const user = conversation.messages[index - 1];
    if (!user || user.role !== "user") return;
    try {
      const model = message.model || settings.model;
      const parameters = buildParameters({ ...settings, model }, "video");
      const restarted = restartAssistantTurn(conversation, message.id);
      conversationState.update(conversation.id, () => restarted);
      requestInFlightRef.current = true;
      void runVideoGeneration(restarted, message.id, user.content, parameters, model)
        .finally(() => { requestInFlightRef.current = false; });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "无法重新创建视频任务。" );
    }
  }

  async function copyMessage(message: Message) {
    try {
      await copyText(message.content);
      setCopiedMessageId(message.id);
      if (copyResetTimeoutRef.current !== undefined) window.clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? undefined : current);
        copyResetTimeoutRef.current = undefined;
      }, 1_500);
    } catch {
      window.alert("复制失败，请检查浏览器剪贴板权限。");
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void send(); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  const statusText = status === "agnes" ? "Real Agnes 已连接" : status === "demo" ? "Showcase 演示模式" : status === "offline" ? "后端离线" : "连接中";
  const modelText = settings.model.trim() || "模型默认值";
  const modelKind = getModelKind(settings.model);
  const selectedPreset = modelPresets.some((model) => model === settings.model)
    ? settings.model
    : "custom";
  const conversationGroups = groupConversations(conversationState.conversations);
  const activePending = activeGeneration?.conversationId === conversationState.activeId;

  return (
    <main className={`app ${sidebarOpen ? "" : "collapsed"}`}>
      {sidebarOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar">
        <header><button className="brand" onClick={newChat}><span>A</span>Agnes Studio</button><button className="collapse" onClick={() => setSidebarOpen(false)}>‹</button></header>
        <button className="new-chat" onClick={newChat} disabled={!conversationState.ready}><b>＋</b>新对话<kbd>Ctrl K</kbd></button>
        <nav className="conversation-list" aria-label="历史对话">
          {!conversationState.ready && <p className="conversation-loading">正在恢复对话…</p>}
          {conversationGroups.map((group) => <section key={group.label}>
            <h2>{group.label}</h2>
            {group.conversations.map((conversation) => <div
              className={`conversation-row ${conversation.id === conversationState.activeId ? "active" : ""}`}
              key={conversation.id}
            >
              <button className="conversation-select" onClick={() => switchConversation(conversation.id)} title={conversation.title}>
                <span>{conversation.title}</span>
              </button>
              <div className="conversation-actions">
                <button type="button" onClick={() => renameChat(conversation)} aria-label={`重命名 ${conversation.title}`}>✎</button>
                <button type="button" onClick={() => deleteChat(conversation)} aria-label={`删除 ${conversation.title}`}>×</button>
              </div>
            </div>)}
          </section>)}
        </nav>
        <footer><div className="profile-avatar">E</div><p><strong>本地用户</strong><small>{conversationState.storageKind === "memory" ? "本地临时模式" : statusText}</small></p><i>•••</i></footer>
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
          <div className="developer-toggle">
            <div><strong>Developer Mode</strong><small>显示自定义模型和高级 JSON 参数</small></div>
            <button type="button" role="switch" aria-checked={developerMode} onClick={toggleDeveloperMode}>{developerMode ? "已开启" : "未开启"}</button>
          </div>
          <div className="settings-grid">
            <label className="wide">模型预设<select value={selectedPreset} onChange={(event) => {
              if (event.target.value !== "custom") updateSetting("model", event.target.value);
            }}>
              {modelPresetGroups.map((group) => <optgroup label={group.label} key={group.label}>
                {group.models.map((model) => <option value={model} key={model}>{model}</option>)}
              </optgroup>)}
              {developerMode && <option value="custom">自定义模型</option>}
            </select></label>
            {developerMode && <label className="wide">模型名称（可自定义）<input value={settings.model} onChange={(event) => updateSetting("model", event.target.value)} placeholder="agnes-2.0-flash" maxLength={200} /></label>}
            {modelKind === "chat" ? <>
              <label>Temperature<input type="number" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => updateSetting("temperature", event.target.value)} placeholder="模型默认" /></label>
              <label>Top P<input type="number" min="0" max="1" step="0.05" value={settings.topP} onChange={(event) => updateSetting("topP", event.target.value)} placeholder="模型默认" /></label>
              <label>Max tokens<input type="number" min="1" max="1000000" step="1" value={settings.maxTokens} onChange={(event) => updateSetting("maxTokens", event.target.value)} placeholder="模型默认" /></label>
              <label className="wide">System Prompt<textarea rows={3} value={settings.systemPrompt} onChange={(event) => updateSetting("systemPrompt", event.target.value)} placeholder="可选，例如：请用简洁的中文回答。" maxLength={8000} /></label>
            </> : modelKind === "image" ? <>
              <label>图片尺寸<select value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
                <option value="1024x1024">1024 × 1024</option>
                <option value="1024x768">1024 × 768</option>
                <option value="768x1024">768 × 1024</option>
              </select></label>
              <label>输出格式<select value={settings.imageResponseFormat} onChange={(event) => updateSetting("imageResponseFormat", event.target.value as RequestSettings["imageResponseFormat"])}>
                <option value="url">URL</option>
                <option value="b64_json">Base64</option>
              </select></label>
              <label className="wide">参考图片 URL<input type="url" value={settings.imageReference} onChange={(event) => updateSetting("imageReference", event.target.value)} placeholder="可选，https://…" /></label>
              <div className="model-kind-note wide">普通生成只需 Prompt；参考图、尺寸和输出格式会映射到 Agnes Image SDK。</div>
            </> : <>
              <label>画面比例<select value={settings.videoAspectRatio} onChange={(event) => updateSetting("videoAspectRatio", event.target.value as RequestSettings["videoAspectRatio"])}>
                <option value="16:9">16:9 横屏</option>
                <option value="9:16">9:16 竖屏</option>
                <option value="1:1">1:1 方形</option>
              </select></label>
              <label>视频时长<select value={settings.videoDurationSeconds} onChange={(event) => updateSetting("videoDurationSeconds", event.target.value as RequestSettings["videoDurationSeconds"])}>
                <option value="3">3 秒</option>
                <option value="5">5 秒</option>
              </select></label>
              <div className="model-kind-note wide">视频模型会调用 /api/videos；创建任务后会自动跟踪状态，直到完成或失败。</div>
            </>}
          </div>
          {developerMode && <details>
            <summary>高级 JSON 参数</summary>
            <textarea className="advanced-json" rows={6} spellCheck={false} value={settings.advanced} onChange={(event) => updateSetting("advanced", event.target.value)} aria-label="高级 JSON 参数" />
            <small>{advancedHelp(modelKind)}</small>
          </details>}
          <footer><button type="button" onClick={() => setSettings(defaultSettings)}>恢复默认</button><span>{modelText}</span></footer>
        </section>}

        {messages.length === 0 ? <>
          <div className="welcome"><div className="hero">A</div><h1>今天想聊些什么？</h1><p>我可以帮你分析问题、编写代码、整理想法，或一起探索新的可能。</p></div>
          <div className="suggestions">{suggestions.map(([title, text]) => <button key={title} onClick={() => void send(text)}><strong>{title}</strong><span>{text}</span><i>↗</i></button>)}</div>
        </> : <div className="thread" aria-live="polite">
          {messages.map((message) => <article className={`${message.role} ${message.status}`} key={message.id}><div className="avatar">{message.role === "assistant" ? "A" : "E"}</div><div className="message-body"><strong>{message.role === "assistant" ? "Agnes AI" : "你"}</strong>{message.content && (message.role === "assistant" ? <MarkdownMessage content={message.content} /> : <p>{message.content}</p>)}
            {(message.status === "pending" || message.status === "streaming") && <div className="typing" aria-label="正在生成"><i /><i /><i /></div>}
            {message.media?.kind === "image" && <img className="generated-media" src={message.media.url} alt="Agnes 生成的图片" />}
            {message.media?.kind === "video" && <video className="generated-media" src={message.media.url} controls />}
            <div className="message-actions">
              {message.content && <button type="button" onClick={() => void copyMessage(message)}>{copiedMessageId === message.id ? "已复制" : "复制"}</button>}
              {message.role === "user" && getModelKind(message.model ?? settings.model) === "chat" && <button type="button" disabled={pending} onClick={() => editAndResend(message)}>编辑并重发</button>}
              {message.role === "user" && getModelKind(message.model ?? settings.model) === "image" && <button type="button" disabled={pending} onClick={() => reusePrompt(message)}>复用提示词</button>}
              {message.role === "user" && getModelKind(message.model ?? settings.model) === "video" && <button type="button" disabled={pending} onClick={() => reusePrompt(message)}>复用提示词</button>}
              {message.role === "assistant" && getModelKind(message.model ?? settings.model) === "chat" && message.status === "completed" && <button type="button" disabled={pending} onClick={() => retryOrRegenerate(message)}>重新生成</button>}
              {message.role === "assistant" && getModelKind(message.model ?? settings.model) === "chat" && (message.status === "failed" || message.status === "cancelled") && <button type="button" disabled={pending} onClick={() => retryOrRegenerate(message)}>重试</button>}
              {message.role === "assistant" && getModelKind(message.model ?? settings.model) === "image" && message.status === "completed" && <button type="button" disabled={pending} onClick={() => retryImage(message)}>重新生成图片</button>}
              {message.role === "assistant" && getModelKind(message.model ?? settings.model) === "image" && message.status === "failed" && <button type="button" disabled={pending} onClick={() => retryImage(message)}>重试图片</button>}
              {message.role === "assistant" && getModelKind(message.model ?? settings.model) === "video" && message.status === "failed" && <button type="button" disabled={pending} onClick={() => retryVideo(message)}>重试视频</button>}
              {message.media?.kind === "image" && <a className="download-media" href={message.media.url} download="agnes-image.png" target="_blank" rel="noreferrer">下载图片</a>}
              {activeGeneration?.assistantId === message.id && <button type="button" className="stop-action" onClick={stopGeneration}>停止生成</button>}
            </div>
          </div></article>)}
          {mediaPendingConversationId === conversationState.activeId && !messages.some((message) => message.status === "pending" || message.status === "streaming") && <article><div className="avatar">A</div><div><strong>Agnes AI</strong><div className="typing" aria-label="正在生成"><i /><i /><i /></div></div></article>}
        </div>}

        <div className="composer-wrap"><form className="composer" onSubmit={submit}>
          <textarea ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} placeholder={composerPlaceholder(modelKind)} aria-label="发送消息" rows={1} disabled={!conversationState.ready} />
          <div><button type="button" className="tool">＋</button><span />{activePending
            ? <button type="button" className="send stop" onClick={stopGeneration} aria-label="停止生成">■</button>
            : <button className="send" disabled={pending || !draft.trim()}>↑</button>}
          </div>
        </form><small>{modelKind === "chat" ? "Agnes AI 可能会犯错，请核查重要信息。" : "媒体生成可能需要一些时间，请勿重复提交。"}</small></div>
      </section>
    </main>
  );
}

function readError(payload: Record<string, unknown>) {
  const error = payload.error;
  return error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string"
    ? String((error as Record<string, unknown>).message) : "请检查本地后端。";
}
