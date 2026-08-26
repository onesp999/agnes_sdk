import { useEffect, useId, useRef, useState } from "react";
import { MarkdownMessage } from "./MarkdownMessage.js";

type ThinkingBlockProps = {
  reasoningContent: string;
  answerStarted: boolean;
  generating: boolean;
};

export function ThinkingBlock({
  reasoningContent,
  answerStarted,
  generating,
}: ThinkingBlockProps) {
  const contentId = useId();
  const [expanded, setExpanded] = useState(generating && !answerStarted);
  const wasAnswerStarted = useRef(answerStarted);

  useEffect(() => {
    const answerJustStarted = !wasAnswerStarted.current && answerStarted;
    wasAnswerStarted.current = answerStarted;
    if (answerJustStarted) setExpanded(false);
  }, [answerStarted]);

  const label = generating && !answerStarted ? "正在思考" : "已思考";

  return <section className={`thinking-block${expanded ? " is-expanded" : ""}`}>
    <button
      type="button"
      className="thinking-toggle"
      aria-expanded={expanded}
      aria-controls={contentId}
      onClick={() => setExpanded((current) => !current)}
    >
      <span>{label}</span>
      <span className="thinking-chevron" aria-hidden="true">›</span>
    </button>
    {expanded && <div id={contentId} className="thinking-content">
      <MarkdownMessage content={reasoningContent} />
    </div>}
  </section>;
}
