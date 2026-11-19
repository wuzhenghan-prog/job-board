import { useEffect, useState } from "react";

import { api } from "../api";
import {
  extractProfileFileText,
  parseProfileText
} from "../profileImport";
import type { AISettings, Profile } from "../types";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile>({
    summary: "",
    skills: [],
    experiences: [],
    strengths: [],
    gaps: []
  });
  const [aiSettings, setAiSettings] = useState<AISettings>({
    baseUrl: "",
    model: "",
    dailyLimit: 30,
    assistantDailyLimit: 50,
    hasApiKey: false
  });
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void (async () => {
      const [profileData, settingsData] = await Promise.all([
        api<Profile>("/api/profile"),
        api<AISettings>("/api/ai-settings")
      ]);
      setProfile(profileData);
      setAiSettings(settingsData);
    })();
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(profile)
      });
      setMessage("能力档案已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const saveAI = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const updated = await api<AISettings>("/api/ai-settings", {
        method: "PATCH",
        body: JSON.stringify({
          baseUrl: aiSettings.baseUrl,
          model: aiSettings.model,
          apiKey,
          dailyLimit: aiSettings.dailyLimit,
          assistantDailyLimit: aiSettings.assistantDailyLimit ?? 50
        })
      });
      setAiSettings(updated);
      setApiKey("");
      setMessage("AI 设置已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const importProfile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await extractProfileFileText(file);
      const imported = parseProfileText(text);
      if (
        !imported.summary &&
        imported.skills.length === 0 &&
        imported.experiences.length === 0
      ) {
        throw new Error("没有从文件中识别到能力档案内容，可以手动填写或更换文件");
      }
      setProfile(imported);
      setMessage("能力档案已读取，请核对后点击保存");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "无法读取这份能力档案"
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>设置</h1>
          <p>维护能力档案与视觉模型连接</p>
        </div>
      </header>
      {message && <p className="muted">{message}</p>}

      <div className="settings-grid">
        <form className="panel" onSubmit={saveProfile}>
          <h2>能力档案</h2>
          <label className="file-import">
            <span>从 Markdown、TXT、Word（.docx）或 PDF 导入</span>
            <input
              type="file"
              accept=".md,.markdown,.txt,.docx,.pdf,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={importing}
              onChange={(event) => void importProfile(event.target.files?.[0])}
            />
            <small>
              文件只在浏览器中提取文字，不会上传；旧版 .doc 请先另存为 .docx。
            </small>
          </label>
          <label><span>概览</span><textarea value={profile.summary} onChange={(e) => setProfile({ ...profile, summary: e.target.value })} /></label>
          <label><span>技能，每行一条</span><textarea value={profile.skills.join("\n")} onChange={(e) => setProfile({ ...profile, skills: e.target.value.split("\n") })} /></label>
          <label><span>经历，每行一条</span><textarea value={profile.experiences.join("\n")} onChange={(e) => setProfile({ ...profile, experiences: e.target.value.split("\n") })} /></label>
          <label><span>优势，每行一条</span><textarea value={profile.strengths.join("\n")} onChange={(e) => setProfile({ ...profile, strengths: e.target.value.split("\n") })} /></label>
          <label><span>缺口，每行一条</span><textarea value={profile.gaps.join("\n")} onChange={(e) => setProfile({ ...profile, gaps: e.target.value.split("\n") })} /></label>
          <button className="primary-button" type="submit">保存能力档案</button>
        </form>

        <form className="panel" onSubmit={saveAI}>
          <h2>AI 模型连接</h2>
          <label><span>兼容接口地址</span><input value={aiSettings.baseUrl} onChange={(e) => setAiSettings({ ...aiSettings, baseUrl: e.target.value })} placeholder="https://.../v1/chat/completions" /></label>
          <label><span>模型名称</span><input value={aiSettings.model} onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })} placeholder="vision-model" /></label>
          <label><span>API Key</span><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={aiSettings.hasApiKey ? "已保存；留空可保留原 Key" : "首次配置必须填写"} /></label>
          <label><span>每日识别上限</span><input type="number" min={1} max={100} value={aiSettings.dailyLimit} onChange={(e) => setAiSettings({ ...aiSettings, dailyLimit: Number(e.target.value) })} /></label>
          <label><span>每日问答上限</span><input type="number" min={1} max={100} value={aiSettings.assistantDailyLimit ?? 50} onChange={(e) => setAiSettings({ ...aiSettings, assistantDailyLimit: Number(e.target.value) })} /></label>
          <button className="primary-button" type="submit">保存 AI 设置</button>
        </form>
      </div>
      <p className="muted">
        AI 助理只读取岗位、能力档案和资料，不会修改业务数据。截图识别与问答的每日额度分别计算。
      </p>
    </section>
  );
}
