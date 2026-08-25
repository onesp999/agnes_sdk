import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Message } from "../../types/conversation.js";
import { StudioResultSurface } from "./StudioResultSurface.js";

const queuedVideo: Message = {
  id: "video-message",
  role: "assistant",
  content: "视频任务已创建。\n任务 ID：private-task-id\n状态：queued",
  status: "streaming",
  model: "agnes-video-v2.0",
  createdAt: "2026-08-25T00:00:00.000Z",
  videoId: "private-task-id",
  videoStatus: "queued",
};

describe("StudioResultSurface", () => {
  it("presents video processing without fake progress or raw diagnostics", () => {
    const html = renderToStaticMarkup(<StudioResultSurface kind="video" message={queuedVideo} developerMode={false} />);

    expect(html).toContain("正在生成视频");
    expect(html).toContain("这可能需要一些时间");
    expect(html).not.toContain("private-task-id");
    expect(html).not.toContain("%");
    expect(html).not.toContain("Diagnostics");
  });

  it("reveals raw diagnostics only in Developer Mode", () => {
    const html = renderToStaticMarkup(<StudioResultSurface kind="video" message={queuedVideo} developerMode />);

    expect(html).toContain("Diagnostics");
    expect(html).toContain("private-task-id");
  });
});
