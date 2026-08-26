import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon/Icon.js";
import { MessageItem } from "./components/Message/MessageItem.js";
import { SettingsDrawer } from "./components/SettingsDrawer/SettingsDrawer.js";
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
    if (window.matchMedia("(max-width: 900px)").matches) setSidebarOpen(false);
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
  function switchMode(kind: "chat" | "image" | "video") {
    const groupIndex = kind === "chat" ? 0 : kind === "image" ? 1 : 2;
    updateSetting("model", modelPresetGroups[groupIndex].models[0]);
    inputRef.current?.focus();
  }
  function resizeComposer(target: HTMLTextAreaElement) {
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 208)}px`;
  }

  const statusText = status === "agnes" ? "Real Agnes 已连接" : status === "demo" ? "Showcase 演示模式" : status === "offline" ? "后端离线" : "连接中";
  const modelText = settings.model.trim() || "模型默认值";
  const modelKind = getModelKind(settings.model);
  const selectedPreset = modelPresets.some((model) => model === settings.model)
    ? settings.model
    : "custom";
  const conversationGroups = groupConversations(conversationState.conversations);
  const activePending = activeGeneration?.conversationId === conversationState.activeId;
  const conversationTitle = conversationState.activeConversation?.title || "新对话";
  const activeModelGroup = modelPresetGroups[modelKind === "chat" ? 0 : modelKind === "image" ? 1 : 2];
  const activeModelOptions = activeModelGroup.models as readonly string[];
  const emptyCopy = modelKind === "image"
    ? { eyebrow: "Image studio", title: "把画面想法变成作品", body: "描述主体、氛围和构图，Agnes 会把它整理成清晰的视觉结果。" }
    : modelKind === "video"
      ? { eyebrow: "Video studio", title: "从一个镜头开始创作", body: "写下场景与运动方式，Agnes 会持续跟踪生成状态。" }
      : { eyebrow: "Chat workspace", title: "今天想和 Agnes 一起完成什么？", body: "分析问题、编写代码、整理想法，或从一个问题开始探索。" };

  return (
    <main className={`app ${sidebarOpen ? "" : "collapsed"}`}>
      {sidebarOpen && <button className="scrim" aria-label="关闭菜单" onClick={() => setSidebarOpen(false)} />}
      <aside className="sidebar" aria-label="Agnes Studio 导航">
        <header><button className="brand" onClick={newChat}><span>A</span><span className="brand-copy">Agnes Studio<small>AI workspace</small></span></button><button className="icon-button collapse" onClick={() => setSidebarOpen(false)} aria-label="收起侧栏"><Icon name="panel-left" /></button></header>
        <button className="new-chat" onClick={newChat} disabled={!conversationState.ready}><Icon name="new-chat" />新对话<kbd>Ctrl K</kbd></button>
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
                <button type="button" onClick={() => renameChat(conversation)} aria-label={`重命名 ${conversation.title}`} title="重命名"><Icon name="edit" /></button>
                <button type="button" onClick={() => deleteChat(conversation)} aria-label={`删除 ${conversation.title}`} title="删除"><Icon name="trash" /></button>
              </div>
            </div>)}
          </section>)}
        </nav>
        <footer><span className={`runtime-dot ${status}`} /><p><strong>{conversationState.storageKind === "memory" ? "本地临时模式" : statusText}</strong><small>{status === "agnes" ? "Agnes API" : status === "demo" ? "Local showcase" : "Runtime status"}</small></p><button className="icon-button settings-trigger model" type="button" onClick={() => setSettingsOpen(true)} aria-label="打开设置" aria-expanded={settingsOpen} title="设置"><Icon name="settings" /></button></footer>
      </aside>

      <section className="stage">
        <header className="topbar">
          {!sidebarOpen && <button className="icon-button menu" onClick={() => setSidebarOpen(true)} aria-label="打开侧栏"><Icon name="menu" /></button>}
          <div className="conversation-context"><strong>{conversationTitle}</strong><small>{modelText}</small></div>
          <button className="icon-button mobile-settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label="打开设置" aria-expanded={settingsOpen}><Icon name="settings" /></button>
        </header>

        <SettingsDrawer
          developerMode={developerMode}
          modelKind={modelKind}
          open={settingsOpen}
          selectedPreset={selectedPreset}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onReset={setSettings}
          onToggleDeveloper={toggleDeveloperMode}
          onUpdate={updateSetting}
        />

        {messages.length === 0 ? <div className="empty-state">
          <div className="welcome"><div className="hero"><Icon name={modelKind === "image" ? "image" : modelKind === "video" ? "video" : "sparkles"} /></div><span>{emptyCopy.eyebrow}</span><h1>{emptyCopy.title}</h1><p>{emptyCopy.body}</p></div>
          {modelKind === "chat" && <div className="suggestions">{suggestions.map(([title, text]) => <button key={title} onClick={() => void send(text)}><span><strong>{title}</strong><small>{text}</small></span><Icon name="arrow-up" /></button>)}</div>}
        </div>
        : <div className="thread" aria-live="polite">
          {messages.map((message) => <MessageItem
            active={activeGeneration?.assistantId === message.id}
            copied={copiedMessageId === message.id}
            currentModel={settings.model}
            developerMode={developerMode}
            key={message.id}
            message={message}
            pending={pending}
            onCopy={(item) => void copyMessage(item)}
            onEdit={editAndResend}
            onReuse={reusePrompt}
            onRetryChat={retryOrRegenerate}
            onRetryImage={retryImage}
            onRetryVideo={retryVideo}
            onStop={stopGeneration}
          />)}
        </div>}

        <div className="composer-wrap"><form className={`composer composer-${modelKind}`} onSubmit={submit}>
          <textarea ref={inputRef} value={draft} onChange={(event) => { setDraft(event.target.value); resizeComposer(event.target); }} onKeyDown={keyDown} placeholder={composerPlaceholder(modelKind)} aria-label="发送消息" rows={1} disabled={!conversationState.ready} />
          <div className="composer-controls">
            <button type="button" className="icon-button composer-add" aria-label="添加附件（暂不可用）" title="附件能力暂未开放" disabled><Icon name="paperclip" /></button>
            <div className="mode-switch" role="group" aria-label="创作模式">
              <button type="button" aria-pressed={modelKind === "chat"} onClick={() => switchMode("chat")}><Icon name="sparkles" />Chat</button>
              <button type="button" aria-pressed={modelKind === "image"} onClick={() => switchMode("image")}><Icon name="image" />Image</button>
              <button type="button" aria-pressed={modelKind === "video"} onClick={() => switchMode("video")}><Icon name="video" />Video</button>
            </div>
            <label className="composer-select model-select"><span className="sr-only">模型</span><select aria-label="模型" value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
              {!activeModelOptions.includes(settings.model) && <option value={settings.model}>{settings.model}</option>}
              {activeModelOptions.map((model) => <option value={model} key={model}>{model}</option>)}
            </select><Icon name="chevron-down" /></label>
            {modelKind === "image" && <label className="composer-select compact-select"><span className="sr-only">图片尺寸</span><select aria-label="图片尺寸" value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
              <option value="1024x1024">1:1</option><option value="1024x768">4:3</option><option value="768x1024">3:4</option>
            </select><Icon name="chevron-down" /></label>}
            {modelKind === "video" && <>
              <label className="composer-select compact-select"><span className="sr-only">画面比例</span><select aria-label="画面比例" value={settings.videoAspectRatio} onChange={(event) => updateSetting("videoAspectRatio", event.target.value as RequestSettings["videoAspectRatio"])}>
                <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
              </select><Icon name="chevron-down" /></label>
              <label className="composer-select compact-select"><span className="sr-only">视频时长</span><select aria-label="视频时长" value={settings.videoDurationSeconds} onChange={(event) => updateSetting("videoDurationSeconds", event.target.value as RequestSettings["videoDurationSeconds"])}>
                <option value="3">3s</option><option value="5">5s</option>
              </select><Icon name="chevron-down" /></label>
            </>}
            <span className="composer-spacer" />{activePending
              ? <button type="button" className="send stop" onClick={stopGeneration} aria-label="停止生成" title="停止生成"><Icon name="stop" /></button>
              : <button className="send" disabled={pending || !draft.trim()} aria-label="发送" title="发送"><Icon name="arrow-up" /></button>}
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
