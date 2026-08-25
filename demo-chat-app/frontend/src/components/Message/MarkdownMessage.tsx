import {
  isValidElement,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import { Icon } from "../Icon/Icon.js";
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
  const language = codeLanguage(children);

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
    <div className="code-block-header"><span>{language || "Code"}</span><button type="button" onClick={() => void copy()}>
      <Icon name="copy" />{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制代码"}
    </button></div>
    <pre {...props}>{children}</pre>
  </div>;
}

function codeLanguage(node: ReactNode): string {
  const child = Array.isArray(node) ? node[0] : node;
  if (!isValidElement<{ className?: string }>(child)) return "";
  const match = child.props.className?.match(/language-([\w-]+)/);
  if (!match) return "";
  const language = match[1];
  return language === "ts" ? "TypeScript" : language === "js" ? "JavaScript" : language;
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}
