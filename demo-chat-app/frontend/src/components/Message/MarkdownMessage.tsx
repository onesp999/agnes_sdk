import {
  isValidElement,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import { copyText } from "../../utils/clipboard.js";

export function MarkdownMessage({ content }: { content: string }) {
  return <div className="markdown-content">
    <ReactMarkdown
      skipHtml
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
        pre: CodeBlock,
      }}
    >{content}</ReactMarkdown>
  </div>;
}

function CodeBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timeout = window.setTimeout(() => setCopyState("idle"), 1_500);
    return () => window.clearTimeout(timeout);
  }, [copyState]);

  async function copy() {
    try {
      await copyText(nodeText(children).replace(/\n$/, ""));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return <div className="code-block">
    <button type="button" onClick={() => void copy()}>
      {copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制代码"}
    </button>
    <pre {...props}>{children}</pre>
  </div>;
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}
