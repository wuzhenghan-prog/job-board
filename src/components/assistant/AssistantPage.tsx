import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { api } from "../../api";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantUsage
} from "../../types";
import Composer from "./Composer";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";

const suggestions = [
  "比较我目前的高匹配岗位，哪些值得优先投递？",
  "哪些岗位最近截止，我接下来应该先做什么？",
  "分析当前岗位与我的能力差距，并给出准备顺序。",
  "根据岗位和资料，帮我准备下一轮面试。"
];

export default function AssistantPage() {
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [conversation, setConversation] = useState<AssistantConversation | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [usage, setUsage] = useState<AssistantUsage>({ day: "", used: 0, limit: 50 });
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyTrigger = useRef<HTMLButtonElement>(null);

  const loadConversations = async () => {
    setConversations(await api<AssistantConversation[]>("/api/assistant/conversations"));
  };

  const loadConversation = async (conversationId: string) => {
    const detail = await api<AssistantConversation>(
      `/api/assistant/conversations/${conversationId}`
    );
    setConversation(detail);
    setMessages(detail.messages ?? []);
  };

  useEffect(() => {
    void Promise.all([
      loadConversations(),
      api<AssistantUsage>("/api/assistant/usage").then((value) => {
        setUsage(value);
      })
    ]).catch((error) =>
      setMessage(error instanceof Error ? error.message : "AI 助理读取失败")
    );
  }, []);

  useEffect(() => {
    if (id) {
      void loadConversation(id).catch((error) =>
        setMessage(error instanceof Error ? error.message : "会话读取失败")
      );
    } else {
      setConversation(null);
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    if (!id && search.get("opportunity") && !conversation) {
      void createConversation();
    }
  }, [id, search]);

  const createConversation = async () => {
    const opportunityId = search.get("opportunity");
    try {
      const created = await api<AssistantConversation>("/api/assistant/conversations", {
        method: "POST",
        body: JSON.stringify({ opportunityId })
      });
      await loadConversations();
      navigate(`/assistant/chat/${created.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新建会话失败");
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!window.confirm("删除这段对话？")) return;
    await api(`/api/assistant/conversations/${conversationId}`, { method: "DELETE" });
    await loadConversations();
    if (conversationId === id) navigate("/assistant");
  };

  const renameConversation = async () => {
    if (!conversation) return;
    const title = window.prompt("会话标题", conversation.title)?.trim();
    if (!title || title === conversation.title) return;
    const updated = await api<AssistantConversation>(
      `/api/assistant/conversations/${conversation.id}`,
      { method: "PATCH", body: JSON.stringify({ title }) }
    );
    setConversation(updated);
    await loadConversations();
  };

  const ensureConversation = async () => {
    if (conversation) return conversation;
    const opportunityId = search.get("opportunity");
    const created = await api<AssistantConversation>("/api/assistant/conversations", {
      method: "POST",
      body: JSON.stringify({ opportunityId })
    });
    setConversation(created);
    await loadConversations();
    navigate(`/assistant/chat/${created.id}`, { replace: true });
    return created;
  };

  const sendQuestion = async () => {
    await sendQuestionValue(question);
  };

  const sendQuestionValue = async (
    value: string,
    replacesMessageId?: string
  ) => {
    if (!value.trim() || streaming) return;
    setStreaming(true);
    setMessage("");
    const currentQuestion = value.trim();
    setQuestion("");
    try {
      const target = await ensureConversation();
      const requestId = crypto.randomUUID();
      const localUser: AssistantMessage = {
        id: `local-user-${requestId}`,
        conversationId: target.id,
        role: "user",
        content: currentQuestion,
        status: "completed",
        attempt: 1,
        replacesMessageId: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        citations: []
      };
      const localAssistant: AssistantMessage = {
        ...localUser,
        id: `local-assistant-${requestId}`,
        role: "assistant",
        content: "",
        status: "streaming",
        completedAt: null
      };
      setMessages((current) =>
        replacesMessageId
          ? [...current, localAssistant]
          : [...current, localUser, localAssistant]
      );
      const response = await fetch(
        `/api/assistant/conversations/${target.id}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: currentQuestion,
            requestId,
            replacesMessageId
          })
        }
      );
      if (!response.ok || !response.body) {
        const raw = await response.text();
        try {
          throw new Error((JSON.parse(raw) as { error?: string }).error ?? "AI 回答失败");
        } catch (error) {
          throw error instanceof SyntaxError ? new Error(raw) : error;
        }
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let assistantId = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const type = event.match(/^event: (.+)$/m)?.[1];
          const dataLine = event.match(/^data: (.+)$/m)?.[1];
          if (!type || !dataLine) continue;
          const data = JSON.parse(dataLine) as {
            text?: string;
            messageId?: string;
            status?: string;
            citations?: AssistantMessage["citations"];
          };
          if (type === "meta" && data.messageId) {
            assistantId = data.messageId;
            setMessages((current) =>
              current.map((item) =>
                item.id === localAssistant.id
                  ? { ...item, id: assistantId }
                  : item
              )
            );
          }
          if (type === "delta" && data.text) {
            answer += data.text;
            setMessages((current) =>
              current.map((item) =>
                item.id === localAssistant.id || item.id === assistantId
                  ? { ...item, content: answer }
                  : item
              )
            );
          }
          if (type === "done") {
            setMessages((current) =>
              current.map((item) =>
                item.id === localAssistant.id || item.id === assistantId
                  ? { ...item, id: data.messageId ?? item.id, status: "completed" }
                  : item
              )
            );
          }
          if (type === "error") {
            setMessages((current) =>
              current.map((item) =>
                item.id === localAssistant.id || item.id === assistantId
                  ? { ...item, status: "failed" }
                  : item
              )
            );
          }
          if (type === "stopped") {
            setMessages((current) =>
              current.map((item) =>
                item.id === localAssistant.id || item.id === assistantId
                  ? { ...item, status: "stopped" }
                  : item
              )
            );
          }
        }
      }
      const refreshedUsage = await api<AssistantUsage>("/api/assistant/usage");
      setUsage(refreshedUsage);
      await loadConversation(target.id);
      await loadConversations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 回答失败");
      setMessages((current) =>
        current.map((item) =>
          item.role === "assistant" && item.status === "streaming"
            ? { ...item, status: "failed" }
            : item
        )
      );
    } finally {
      setStreaming(false);
    }
  };

  const stop = async () => {
    const active = messages.find(
      (item) => item.role === "assistant" && item.status === "streaming"
    );
    if (active && !active.id.startsWith("local-")) {
      await api(`/api/assistant/messages/${active.id}/stop`, { method: "POST" });
    }
    setStreaming(false);
    setMessages((current) =>
      current.map((item) =>
        item.role === "assistant" && item.status === "streaming"
          ? { ...item, status: "stopped" }
          : item
      )
    );
  };

  const toggleWeb = async (enabled: boolean) => {
    const target = await ensureConversation();
    const updated = await api<AssistantConversation>(
      `/api/assistant/conversations/${target.id}`,
      { method: "PATCH", body: JSON.stringify({ webSearchEnabled: enabled }) }
    );
    setConversation(updated);
  };

  return (
    <section className="page assistant-page">
      <header className="page-header assistant-page-header">
        <div>
          <p className="eyebrow">Read-only career assistant</p>
          <h1>AI 助理</h1>
          <p>基于岗位、能力档案和资料，给出有依据的求职建议</p>
        </div>
        <div className="header-actions">
          <button
            ref={historyTrigger}
            className="ghost-button assistant-history-trigger"
            onClick={() => setHistoryOpen(true)}
          >
            对话历史
          </button>
          <Link className="ghost-button" to="/assistant/documents">资料库</Link>
          <button className="primary-button" onClick={() => void createConversation()}>新建对话</button>
        </div>
      </header>
      {message && <p className="auth-message">{message}</p>}
      {copied && <p className="muted" role="status">回答已复制</p>}
      <div className="assistant-layout">
        <div className="assistant-history-desktop">
          <ConversationList
            conversations={conversations}
            activeId={id}
            onSelect={(conversationId) => navigate(`/assistant/chat/${conversationId}`)}
            onCreate={() => void createConversation()}
            onDelete={(conversationId) => void deleteConversation(conversationId)}
          />
        </div>
        <main className="assistant-main">
          {conversation && (
            <div className="assistant-context-bar">
              <div>
                <strong>{conversation.title}</strong>
                <button type="button" onClick={() => void renameConversation()}>
                  重命名
                </button>
              </div>
              <span>
                {conversation.opportunityId ? "已锁定岗位 · " : ""}
                最近 10 轮上下文
              </span>
            </div>
          )}
          <div className="assistant-scroll">
            {messages.length === 0 ? (
              <div className="assistant-welcome">
                <p className="eyebrow">Start with a question</p>
                <h2>把求职问题整理成下一步行动。</h2>
                <p>AI 只读取站内岗位与资料，不会修改你的看板。</p>
                <div className="assistant-suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => setQuestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <MessageList
                messages={messages}
                onRetry={async (messageId) => {
                  try {
                    const result = await api<{
                      question: string;
                      replacementFor: string;
                    }>(`/api/assistant/messages/${messageId}/retry`, {
                      method: "POST"
                    });
                    await sendQuestionValue(result.question, result.replacementFor);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "重试失败");
                  }
                }}
                onCopy={async (text) => {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              />
            )}
          </div>
          <Composer
            value={question}
            onChange={setQuestion}
            onSubmit={() => void sendQuestion()}
            onStop={() => void stop()}
            streaming={streaming}
            disabled={!question.trim()}
            usage={usage}
            webEnabled={conversation?.webSearchEnabled ?? false}
            onToggleWeb={(enabled) => void toggleWeb(enabled)}
          />
        </main>
      </div>
      {historyOpen && (
        <div className="assistant-drawer-layer" role="presentation">
          <button
            type="button"
            className="assistant-drawer-backdrop"
            aria-label="关闭对话历史"
            onClick={() => {
              setHistoryOpen(false);
              historyTrigger.current?.focus();
            }}
          />
          <ConversationList
            conversations={conversations}
            activeId={id}
            onSelect={(conversationId) => navigate(`/assistant/chat/${conversationId}`)}
            onCreate={() => void createConversation()}
            onDelete={(conversationId) => void deleteConversation(conversationId)}
            onClose={() => {
              setHistoryOpen(false);
              historyTrigger.current?.focus();
            }}
          />
        </div>
      )}
    </section>
  );
}
