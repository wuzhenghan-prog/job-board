import { Copy } from "lucide-react";

import type { AssistantMessage } from "../../types";
import AiMarkdown from "./AiMarkdown";
import CitationCard from "./CitationCard";

const statusLabel: Record<AssistantMessage["status"], string> = {
  streaming: "正在生成",
  completed: "回答完成",
  stopped: "已停止生成",
  failed: "生成失败"
};

export default function MessageList({
  messages,
  onRetry,
  onCopy
}: {
  messages: AssistantMessage[];
  onRetry: (id: string) => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="assistant-message-list" aria-live="polite">
      {messages.map((message) =>
        message.role === "user" ? (
          <article className="assistant-message user" key={message.id}>
            <p>{message.content}</p>
          </article>
        ) : (
          <article className="assistant-message assistant" key={message.id}>
            {message.content ? (
              <AiMarkdown text={message.content} />
            ) : (
              <p className="muted">
                {message.status === "streaming" ? "正在检索资料并组织回答…" : "没有生成内容。"}
              </p>
            )}
            <div className="assistant-message-meta">
              <span className={`assistant-status ${message.status}`}>
                {statusLabel[message.status]}
              </span>
              {message.content && (
                <button
                  className="assistant-copy"
                  type="button"
                  onClick={() => onCopy(message.content)}
                >
                  <Copy size={14} aria-hidden="true" />
                  复制
                </button>
              )}
              {(message.status === "failed" || message.status === "stopped") && (
                <button
                  className="assistant-copy"
                  type="button"
                  onClick={() => onRetry(message.id)}
                >
                  重试
                </button>
              )}
              {message.replacesMessageId && (
                <span className="assistant-status">第 {message.attempt} 次回答</span>
              )}
            </div>
            {message.citations.length > 0 && (
              <div className="assistant-citations">
                {message.citations.map((citation) => (
                  <CitationCard citation={citation} key={citation.id} />
                ))}
              </div>
            )}
          </article>
        )
      )}
    </div>
  );
}
