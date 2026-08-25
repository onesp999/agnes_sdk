import { Icon } from "../Icon/Icon.js";
import type { Message } from "../../types/conversation.js";

export function StudioResultSurface({
  kind,
  message,
  developerMode,
}: {
  kind: "image" | "video";
  message: Message;
  developerMode: boolean;
}) {
  const failed = message.status === "failed";
  const processing = message.status === "pending" || message.status === "streaming";
  const completed = message.status === "completed";
  const hasMedia = message.media?.kind === kind;
  const statusLabel = failed ? "Failed" : processing ? "Generating" : completed ? "Completed" : "Stopped";
  const title = failed
    ? kind === "image" ? "图片生成失败" : "视频生成失败"
    : processing
      ? kind === "image" ? "正在创作图片" : "正在生成视频"
      : kind === "image" ? "图片生成完成" : hasMedia ? "视频生成完成" : "视频任务已完成";
  const description = failed
    ? message.content
    : processing
      ? kind === "image" ? "Agnes 正在把提示词转化为画面。" : "这可能需要一些时间，任务完成后会自动更新。"
      : kind === "video" && !hasMedia
        ? "本次任务没有返回可播放地址。你可以稍后重试，或在 Developer Mode 查看诊断。"
        : kind === "image" ? "作品已经准备好，可以下载或复用提示词继续创作。" : "作品已经准备好，可以直接预览。";

  return <section className={`studio-result ${kind} ${failed ? "is-failed" : processing ? "is-processing" : "is-completed"}`} aria-label={`${kind === "image" ? "图片" : "视频"}生成结果`}>
    <header>
      <span className="studio-result-icon"><Icon name={kind} /></span>
      <div><small>{kind === "image" ? "Image studio" : "Video studio"} · {statusLabel}</small><strong>{title}</strong></div>
      <span className="studio-status"><i />{failed ? "失败" : processing ? "生成中" : "已完成"}</span>
    </header>
    {hasMedia && message.media?.kind === "image" && <div className="studio-preview image-preview"><img className="generated-media" src={message.media.url} alt="Agnes 生成的图片" /></div>}
    {hasMedia && message.media?.kind === "video" && <div className="studio-preview video-preview"><video className="generated-media" src={message.media.url} controls /></div>}
    {!hasMedia && <div className="studio-placeholder"><span>{processing && <i />}</span><p>{description}</p></div>}
    {hasMedia && <p className="studio-description">{description}</p>}
    <footer><span>{message.model || "Agnes"}</span>{kind === "video" && message.videoStatus && <span>状态：{message.videoStatus}</span>}</footer>
    {developerMode && message.content && <details className="studio-diagnostics"><summary>Diagnostics</summary><pre>{message.content}</pre></details>}
  </section>;
}
