import { useState } from "react";

import { api } from "../api";
import type { Category, Opportunity } from "../types";

export type OpportunityPayload = {
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  categoryId: string;
  stage: Opportunity["stage"];
  responsibilities: string[];
  requirements: string[];
  abilities: Opportunity["abilities"];
  match: Opportunity["match"];
  deadline: string | null;
  sourceUrl: string | null;
  notes: string | null;
  version?: number;
};

const stageOptions = [
  ["to_evaluate", "待评估"],
  ["preparing", "准备投递"],
  ["submitted", "已投递"],
  ["interviewing", "面试中"],
  ["offer", "Offer"],
  ["closed", "已结束"]
] as const;

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export default function OpportunityForm({
  categories,
  defaultCategoryId,
  initial,
  submitPath,
  formTitle,
  submitLabel,
  onSaved,
  onCancel
}: {
  categories: Category[];
  defaultCategoryId?: string;
  initial?: Opportunity;
  submitPath?: string;
  formTitle?: string;
  submitLabel?: string;
  onSaved: (opportunity: Opportunity) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [salary, setSalary] = useState(initial?.salary ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "other"
  );
  const [stage, setStage] = useState<Opportunity["stage"]>(initial?.stage ?? "to_evaluate");
  const [responsibilities, setResponsibilities] = useState(initial?.responsibilities.join("\n") ?? "");
  const [requirements, setRequirements] = useState(initial?.requirements.join("\n") ?? "");
  const [hard, setHard] = useState(initial?.abilities.hard.join("\n") ?? "");
  const [general, setGeneral] = useState(initial?.abilities.general.join("\n") ?? "");
  const [experience, setExperience] = useState(initial?.abilities.experience.join("\n") ?? "");
  const [level, setLevel] = useState<Opportunity["match"]["level"]>(initial?.match.level ?? "low");
  const [strengths, setStrengths] = useState(initial?.match.strengths.join("\n") ?? "");
  const [gaps, setGaps] = useState(initial?.match.gaps.join("\n") ?? "");
  const [evidence, setEvidence] = useState(initial?.match.evidence.join("\n") ?? "");
  const [deadline, setDeadline] = useState(toDateInput(initial?.deadline ?? null));
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const updateMode = Boolean(initial && !submitPath);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload: OpportunityPayload = {
      title: title.trim(),
      company: company.trim() || null,
      location: location.trim() || null,
      salary: salary.trim() || null,
      categoryId,
      stage,
      responsibilities: linesToArray(responsibilities),
      requirements: linesToArray(requirements),
      abilities: {
        hard: linesToArray(hard),
        general: linesToArray(general),
        experience: linesToArray(experience)
      },
      match: {
        level,
        strengths: linesToArray(strengths),
        gaps: linesToArray(gaps),
        evidence: linesToArray(evidence)
      },
      deadline: deadline ? `${deadline}T00:00:00.000Z` : null,
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim() || null,
      ...(updateMode && initial ? { version: initial.version } : {})
    };

    try {
      const saved = await api<Opportunity>(
        submitPath ?? (initial ? `/api/opportunities/${initial.id}` : "/api/opportunities"),
        {
          method: updateMode ? "PATCH" : "POST",
          body: JSON.stringify(payload)
        }
      );
      onSaved(saved);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="opportunity-form panel" onSubmit={submit}>
      <div className="form-header">
        <h2>{formTitle ?? (initial ? "编辑岗位" : "手动新增岗位")}</h2>
        <button type="button" className="text-button" onClick={onCancel}>取消</button>
      </div>
      <div className="form-grid">
        <label><span>岗位名称</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label><span>公司</span><input value={company} onChange={(event) => setCompany(event.target.value)} /></label>
        <label><span>地点</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <label><span>薪资</span><input maxLength={80} value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="如 15-25K·14薪 或 面议" /></label>
        <label><span>分类</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label><span>投递阶段</span><select value={stage} onChange={(event) => setStage(event.target.value as Opportunity["stage"])}>{stageOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>截止日期</span><input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
        <label className="span-2"><span>来源链接</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://" /></label>
      </div>
      <div className="form-grid text-grid">
        <label><span>职责，每行一条</span><textarea value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} /></label>
        <label><span>要求，每行一条</span><textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} /></label>
        <label><span>硬技能，每行一条</span><textarea value={hard} onChange={(event) => setHard(event.target.value)} /></label>
        <label><span>通用能力，每行一条</span><textarea value={general} onChange={(event) => setGeneral(event.target.value)} /></label>
        <label><span>经验要求，每行一条</span><textarea value={experience} onChange={(event) => setExperience(event.target.value)} /></label>
      </div>
      <div className="form-grid">
        <label><span>匹配等级</span><select value={level} onChange={(event) => setLevel(event.target.value as Opportunity["match"]["level"])}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
      </div>
      <div className="form-grid text-grid">
        <label><span>个人优势，每行一条</span><textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} /></label>
        <label><span>能力缺口，每行一条</span><textarea value={gaps} onChange={(event) => setGaps(event.target.value)} /></label>
        <label><span>匹配依据，每行一条</span><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
      </div>
      <label><span>备注</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      {error && <p className="error-text">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : submitLabel ?? "保存岗位"}</button>
    </form>
  );
}
