import type { AssistantConversation } from "../../types";

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onClose
}: {
  conversations: AssistantConversation[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
}) {
  return (
    <aside className="assistant-history" aria-label="会话历史">
      <div className="assistant-history-actions">
        <button className="primary-button" type="button" onClick={onCreate}>
          新建对话
        </button>
        {onClose && (
          <button className="ghost-button" type="button" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
      <div className="assistant-history-list">
        {conversations.length === 0 ? (
          <p className="muted">还没有对话。</p>
        ) : (
          conversations.map((conversation) => (
            <div
              className={`assistant-history-row ${conversation.id === activeId ? "active" : ""}`}
              key={conversation.id}
            >
              <button
                type="button"
                className="assistant-history-title"
                onClick={() => {
                  onSelect(conversation.id);
                  onClose?.();
                }}
              >
                <strong>{conversation.title}</strong>
                <small>
                  {new Date(conversation.updatedAt).toLocaleDateString("zh-CN")}
                </small>
              </button>
              <button
                type="button"
                className="assistant-history-delete"
                aria-label={`删除会话 ${conversation.title}`}
                onClick={() => onDelete(conversation.id)}
              >
                删除
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
