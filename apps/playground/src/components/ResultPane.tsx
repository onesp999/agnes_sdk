import type { ApiJson } from "../api";
import type { ReactNode } from "react";

interface ResultPaneProps {
  title: string;
  result?: ApiJson;
  error?: string;
  children?: ReactNode;
}

export function ResultPane({ title, result, error, children }: ResultPaneProps) {
  return (
    <section className="result-pane" aria-label={title}>
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {error && <div className="error-box">{error}</div>}
      {children}
      <pre>{result ? JSON.stringify(result, null, 2) : "No response yet."}</pre>
    </section>
  );
}
