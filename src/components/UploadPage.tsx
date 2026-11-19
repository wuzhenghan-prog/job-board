import { useEffect, useState } from "react";

import { api } from "../api";
import type { Category, ExtractionJob } from "../types";

type Draft = {
  title: string;
  company: string;
  location: string;
  salary: string;
  categoryId: string;
  responsibilities: string[];
  requirements: string[];
  abilities: {
    hard: string[];
    general: string[];
    experience: string[];
  };
  match: {
    level: string;
    strengths: string[];
    gaps: string[];
    evidence: string[];
  };
  missingFields: string[];
};

export default function UploadPage({ categories }: { categories: Category[] }) {
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [polling, setPolling] = useState(false);
  const [newJobPending, setNewJobPending] = useState(false);

  useEffect(() => {
    if (
      !job ||
      (job.status !== "queued" && job.status !== "processing") ||
      newJobPending
    ) return;
    setPolling(true);
    const interval = setInterval(async () => {
      const updated = await api<ExtractionJob>(`/api/extraction-jobs/${job.id}`);
      setJob(updated);
      if (updated.status === "awaiting_review" || updated.status === "failed") {
        setPolling(false);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job, newJobPending]);

  const retry = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<ExtractionJob>(`/api/extraction-jobs/${job.id}/retry`, {
        method: "POST"
      });
      setJob(updated);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重试失败");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) {
      setError("请选择同一岗位的截图");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of files) {
        form.append("images", file);
      }
      const response = await fetch("/api/extraction-jobs", {
        method: "POST",
        credentials: "same-origin",
        body: form
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const created = await response.json() as ExtractionJob;
      setNewJobPending(false);
      setJob(created);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (job?.status === "awaiting_review" && job.result && !draft) {
      const category = categories.find((item) => item.name === job.result?.categoryName);
      setDraft({
        title: job.result.title ?? "",
        company: job.result.company ?? "",
        location: job.result.location ?? "",
        salary: job.result.salary ?? "",
        categoryId: category?.id ?? "other",
        responsibilities: job.result.responsibilities,
        requirements: job.result.requirements,
        abilities: job.result.abilities,
        match: job.result.match,
        missingFields: []
      });
    }
  }, [job, categories, draft]);

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!job || !draft) return;
    setBusy(true);
    try {
      const response = await api<{ id: string }>(
        `/api/extraction-jobs/${job.id}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            ...draft,
            company: draft.company || null,
            location: draft.location || null,
            salary: draft.salary || null,
            title: draft.title,
            stage: "to_evaluate",
            deadline: null,
            sourceUrl: null,
            notes: null
          })
        }
      );
      window.location.assign(`/opportunities/${response.id}`);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Capture & extract</p>
          <h1>识别岗位</h1>
          <p>把同一岗位的多张截图放进一个识别任务</p>
        </div>
      </header>

      {(!job || job.status === "confirmed") && (
        <form className="upload-form" onSubmit={upload}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <p className="muted">PNG、JPEG、WebP，最多 8 张，单张 10MB。</p>
          {job?.status === "confirmed" && (
            <p className="success-text">上一岗位已保存，可以继续识别下一个岗位。</p>
          )}
          <button className="primary-button" type="submit" disabled={busy}>
            上传并识别
          </button>
        </form>
      )}

      {job && job.status !== "awaiting_review" && (
        <div className="panel">
          <h2>识别任务</h2>
          <p>状态：{job.status}</p>
          {job.images.length > 0 && (
            <div className="image-grid">
              {job.images.map((image) => <img key={image.id} src={image.url} alt="待识别截图" />)}
            </div>
          )}
          {job.error && <p className="error-text">{job.error}</p>}
          {polling && <p className="muted">正在识别，请稍候…</p>}
          {job.status === "failed" && (
            <div className="inline-actions">
              <button className="ghost-button" onClick={() => void retry()} disabled={busy}>重新尝试</button>
              <button
                className="text-button"
                onClick={() => {
                  setNewJobPending(true);
                  setJob(null);
                  setFiles([]);
                  setDraft(null);
                  setError(null);
                }}
              >
                改为手动新增
              </button>
            </div>
          )}
        </div>
      )}

      {job && draft && (
        <form className="confirm-form" onSubmit={confirm}>
          <h2>确认识别结果</h2>
          <div className="confirm-grid">
            <label><span>岗位名称</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label><span>公司</span><input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} /></label>
            <label><span>地点</span><input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></label>
            <label><span>薪资</span><input maxLength={80} value={draft.salary} onChange={(e) => setDraft({ ...draft, salary: e.target.value })} placeholder="如 15-25K·14薪 或 面议" /></label>
            <label>
              <span>分类</span>
              <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label><span>职责</span><textarea value={draft.responsibilities.join("\n")} onChange={(e) => setDraft({ ...draft, responsibilities: e.target.value.split("\n") })} /></label>
          <label><span>要求</span><textarea value={draft.requirements.join("\n")} onChange={(e) => setDraft({ ...draft, requirements: e.target.value.split("\n") })} /></label>
          <label><span>硬技能</span><textarea value={draft.abilities.hard.join("\n")} onChange={(e) => setDraft({ ...draft, abilities: { ...draft.abilities, hard: e.target.value.split("\n") } })} /></label>
          <label><span>通用能力</span><textarea value={draft.abilities.general.join("\n")} onChange={(e) => setDraft({ ...draft, abilities: { ...draft.abilities, general: e.target.value.split("\n") } })} /></label>
          <label><span>经验要求</span><textarea value={draft.abilities.experience.join("\n")} onChange={(e) => setDraft({ ...draft, abilities: { ...draft.abilities, experience: e.target.value.split("\n") } })} /></label>
          <div className="match-grid">
            <label><span>匹配等级</span>
              <select value={draft.match.level} onChange={(e) => setDraft({ ...draft, match: { ...draft.match, level: e.target.value } })}>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>确认并保存</button>
        </form>
      )}
    </section>
  );
}
