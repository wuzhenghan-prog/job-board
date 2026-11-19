import { ArrowUp, Square } from "lucide-react";

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  disabled,
  usage,
  webEnabled,
  onToggleWeb
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  usage: { used: number; limit: number };
  webEnabled: boolean;
  onToggleWeb: (enabled: boolean) => void;
}) {
  const nearLimit = usage.used >= usage.limit;
  return (
    <div className="assistant-composer">
      <div className="assistant-composer-meta">
        <label className="assistant-web-toggle">
          <input
            type="checkbox"
            checked={webEnabled}
            onChange={(event) => onToggleWeb(event.target.checked)}
          />
          <span>联网检索</span>
        </label>
        <span className={nearLimit ? "assistant-quota exhausted" : "assistant-quota"}>
          今日问答 {usage.used}/{usage.limit}
        </span>
      </div>
      <div className="assistant-composer-row">
        <textarea
          aria-label="向 AI 助理提问"
          value={value}
          maxLength={4000}
          rows={1}
          placeholder={nearLimit ? "今日问答额度已用完" : "询问岗位、匹配、面试或下一步建议"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!streaming) onSubmit();
            }
          }}
        />
        {streaming ? (
          <button
            className="assistant-send stop"
            type="button"
            onClick={onStop}
            aria-label="停止生成"
          >
            <Square size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            className="assistant-send"
            type="button"
            onClick={onSubmit}
            disabled={disabled || nearLimit || !value.trim()}
            aria-label="发送问题"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="assistant-disclaimer">
        对话会同步保存；AI 只读，不会修改岗位数据。
      </p>
    </div>
  );
}
