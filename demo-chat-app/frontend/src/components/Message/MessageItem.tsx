import { Icon } from "../Icon/Icon.js";
import { getModelKind } from "../../features/settings/model.js";
import type { Message } from "../../types/conversation.js";
import { MarkdownMessage } from "./MarkdownMessage.js";
import { StudioResultSurface } from "./StudioResultSurface.js";
import { ThinkingBlock } from "./ThinkingBlock.js";

type MessageItemProps = {
  message: Message;
  currentModel: string;
  pending: boolean;
  copied: boolean;
  active: boolean;
  developerMode: boolean;
  onCopy(message: Message): void;
  onEdit(message: Message): void;
  onReuse(message: Message): void;
  onRetryChat(message: Message): void;
  onRetryImage(message: Message): void;
  onRetryVideo(message: Message): void;
  onStop(): void;
};

export function MessageItem({
  message,
  currentModel,
  pending,
  copied,
  active,
  developerMode,
  onCopy,
  onEdit,
  onReuse,
  onRetryChat,
  onRetryImage,
  onRetryVideo,
  onStop,
}: MessageItemProps) {
  const kind = getModelKind(message.model ?? currentModel);
  const generating = message.status === "pending" || message.status === "streaming";
  const studioMessage = message.role === "assistant" && kind !== "chat";

  return <article className={`${message.role} ${message.status}`}>
    {message.role === "assistant" && <div className="avatar" aria-hidden="true">A</div>}
    <div className="message-body">
      {message.role === "assistant" && <div className="message-identity"><span>Agnes</span>{generating && <small>正在生成</small>}</div>}
      {!studioMessage && message.role === "assistant" && message.reasoningContent && <ThinkingBlock
        reasoningContent={message.reasoningContent}
        answerStarted={Boolean(message.content)
          && message.status !== "failed"
          && message.status !== "cancelled"}
        generating={generating}
      />}
      {studioMessage
        ? <StudioResultSurface kind={kind === "image" ? "image" : "video"} message={message} developerMode={developerMode} />
        : message.content && (message.role === "assistant"
        ? <MarkdownMessage content={message.content} />
        : <p>{message.content}</p>)}
      {!studioMessage && generating && (message.content
        ? <span className="streaming-cursor" aria-label="正在生成" />
        : !message.reasoningContent && <div className="message-pending" aria-label="正在生成"><span />准备回复</div>)}
      <div className="message-actions" aria-label={message.role === "assistant" ? "回复操作" : "消息操作"}>
        {message.content && <button type="button" onClick={() => onCopy(message)} title="复制"><Icon name="copy" />{copied ? "已复制" : "复制"}</button>}
        {message.role === "user" && kind === "chat" && <button type="button" disabled={pending} onClick={() => onEdit(message)} title="编辑并重发"><Icon name="edit" />编辑并重发</button>}
        {message.role === "user" && kind !== "chat" && <button type="button" disabled={pending} onClick={() => onReuse(message)} title="复用提示词"><Icon name="refresh" />复用提示词</button>}
        {message.role === "assistant" && kind === "chat" && message.status === "completed" && <button type="button" disabled={pending} onClick={() => onRetryChat(message)} title="重新生成"><Icon name="refresh" />重新生成</button>}
        {message.role === "assistant" && kind === "chat" && (message.status === "failed" || message.status === "cancelled") && <button type="button" disabled={pending} onClick={() => onRetryChat(message)} title="重试"><Icon name="refresh" />重试</button>}
        {message.role === "assistant" && kind === "image" && message.status === "completed" && <button type="button" disabled={pending} onClick={() => onRetryImage(message)} title="重新生成图片"><Icon name="refresh" />重新生成图片</button>}
        {message.role === "assistant" && kind === "image" && message.status === "failed" && <button type="button" disabled={pending} onClick={() => onRetryImage(message)} title="重试图片"><Icon name="refresh" />重试图片</button>}
        {message.role === "assistant" && kind === "video" && message.status === "failed" && <button type="button" disabled={pending} onClick={() => onRetryVideo(message)} title="重试视频"><Icon name="refresh" />重试视频</button>}
        {message.media?.kind === "image" && <a className="download-media" href={message.media.url} download="agnes-image.png" target="_blank" rel="noreferrer"><Icon name="arrow-up" />下载图片</a>}
        {active && <button type="button" className="stop-action" onClick={onStop} title="停止生成"><Icon name="stop" />停止生成</button>}
      </div>
    </div>
  </article>;
}
