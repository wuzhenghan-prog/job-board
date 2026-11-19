import { useState } from "react";

import { api } from "../api";

export default function LoginPage({
  onAuthenticated
}: {
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await api<{ ok: boolean }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ accessCode })
        });
      } else {
        await api<{ ok: boolean }>("/api/auth/setup", {
          method: "POST",
          body: JSON.stringify({ accessCode })
        });
      }
      onAuthenticated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-title">
          <span className="brand-mark large">J</span>
          <p className="eyebrow">Opportunity index</p>
          <h1>机会档案</h1>
          <p>识别岗位，整理能力，持续向前。</p>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "setup" ? "active" : ""}
            onClick={() => setMode("setup")}
          >
            首次设置
          </button>
        </div>
        <label className="field">
          <span>{mode === "login" ? "访问码" : "设置访问码"}</span>
          <input
            type="password"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder={mode === "login" ? "输入你的访问码" : "至少 12 位，建议混合字母与数字"}
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {mode === "login" ? "进入看板" : "保存并进入"}
        </button>
      </form>
    </div>
  );
}
