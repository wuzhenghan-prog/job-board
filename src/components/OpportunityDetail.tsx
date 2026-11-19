import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import { STAGES } from "../shared/domain";
import type { Category, Opportunity } from "../types";
import OpportunityForm from "./OpportunityForm";

export default function OpportunityDetail({
  categories
}: {
  categories: Category[];
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [round, setRound] = useState({
    roundType: "技术面",
    scheduledAt: "",
    result: "",
    notes: ""
  });

  const load = async () => {
    const data = await api<Opportunity>(`/api/opportunities/${id}`);
    setOpportunity(data);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const updateStage = async (stage: string) => {
    try {
      await api<Opportunity>(`/api/opportunities/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage })
      });
      await load();
      setMessage("阶段已更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新失败");
    }
  };

  const addInterviewRound = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api(`/api/opportunities/${id}/interview-rounds`, {
        method: "POST",
        body: JSON.stringify({
          roundType: round.roundType,
          scheduledAt: round.scheduledAt ? new Date(round.scheduledAt).toISOString() : null,
          result: round.result || null,
          notes: round.notes || null
        })
      });
      setRound({ roundType: "技术面", scheduledAt: "", result: "", notes: "" });
      await load();
      setMessage("面试记录已添加");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "添加失败");
    }
  };

  const deleteOpportunity = async () => {
    if (!opportunity) return;
    if (!window.confirm("删除岗位后，关联截图和面试记录也会删除。确定继续吗？")) return;
    try {
      await api(`/api/opportunities/${opportunity.id}`, { method: "DELETE" });
      navigate("/library");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  if (!opportunity) {
    return <section className="page"><p className="muted">正在读取岗位…</p></section>;
  }

  if (editing) {
    return (
      <section className="page">
        <OpportunityForm
          categories={categories}
          initial={opportunity}
          onSaved={(saved) => {
            setOpportunity(saved);
            setEditing(false);
            setMessage("岗位信息已更新");
          }}
          onCancel={() => setEditing(false)}
        />
      </section>
    );
  }

  return (
    <section className="page detail-page">
      <header className="page-header">
        <div>
          <h1>{opportunity.title}</h1>
          <p>
            {opportunity.company ?? "未识别公司"} · {opportunity.location ?? "未识别地点"} ·{" "}
            {opportunity.salary ?? "薪资未识别"} ·{" "}
            {categories.find((category) => category.id === opportunity.categoryId)?.name ?? opportunity.categoryName}
          </p>
        </div>
        <div className="header-actions">
          <select
            className={`stage-select tone-${STAGES.find((stage) => stage.value === opportunity.stage)?.tone ?? "slate"}`}
            value={opportunity.stage}
            onChange={(event) => void updateStage(event.target.value)}
          >
            {STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>{stage.label}</option>
            ))}
          </select>
          {opportunity.sourceUrl && (
            <a className="ghost-button" href={opportunity.sourceUrl} target="_blank" rel="noreferrer">打开原岗位</a>
          )}
          <Link
            className="ghost-button"
            to={`/assistant/new?opportunity=${opportunity.id}`}
          >
            询问 AI
          </Link>
          <button className="ghost-button" onClick={() => setEditing(true)}>编辑</button>
          <button className="danger-button" onClick={() => void deleteOpportunity()}>删除</button>
        </div>
      </header>

      {message && <p className="muted">{message}</p>}

      <div className="detail-grid">
        <section className="panel">
          <h2>岗位信息</h2>
          <dl className="info-list">
            <div><dt>公司</dt><dd>{opportunity.company ?? "未识别"}</dd></div>
            <div><dt>地点</dt><dd>{opportunity.location ?? "未识别"}</dd></div>
            <div><dt>薪资</dt><dd>{opportunity.salary ?? "未识别"}</dd></div>
            <div><dt>截止日期</dt><dd>{opportunity.deadline ?? "未填写"}</dd></div>
            <div><dt>来源链接</dt><dd>{opportunity.sourceUrl ?? "未填写"}</dd></div>
          </dl>
          <h3>职责</h3>
          <ul>{opportunity.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
          <h3>要求</h3>
          <ul>{opportunity.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>

        <section className="panel">
          <h2>能力画像</h2>
          <div className="ability-grid">
            <div><h3>硬技能</h3><ul className="ability-tags">{opportunity.abilities.hard.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>通用能力</h3><ul className="ability-tags">{opportunity.abilities.general.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h3>经验要求</h3><ul className="ability-tags">{opportunity.abilities.experience.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
          <h3>匹配分析</h3>
          <p className={`match-label ${opportunity.match.level}`}>
            {opportunity.match.level === "high" ? "高匹配" : opportunity.match.level === "medium" ? "中匹配" : "低匹配"}
          </p>
          <div className="match-grid">
            <div><h4>优势</h4><ul>{opportunity.match.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>缺口</h4><ul>{opportunity.match.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><h4>依据</h4><ul>{opportunity.match.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
          </div>
        </section>

        <section className="panel">
          <h2>截图</h2>
          <div className="image-grid">
            {opportunity.images.map((image) => (
              <img key={image.id} src={image.url} alt="岗位截图" />
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>面试记录</h2>
          <form className="round-form" onSubmit={addInterviewRound}>
            <input
              value={round.roundType}
              onChange={(event) => setRound({ ...round, roundType: event.target.value })}
              placeholder="轮次类型，如技术面"
            />
            <input
              type="datetime-local"
              value={round.scheduledAt}
              onChange={(event) => setRound({ ...round, scheduledAt: event.target.value })}
            />
            <input
              value={round.result}
              onChange={(event) => setRound({ ...round, result: event.target.value })}
              placeholder="结果，如通过"
            />
            <input
              value={round.notes}
              onChange={(event) => setRound({ ...round, notes: event.target.value })}
              placeholder="备注"
            />
            <button type="submit">添加面试轮次</button>
          </form>
          <div className="round-list">
            {opportunity.interviewRounds.map((interviewRound) => (
              <div className="round-item" key={interviewRound.id}>
                <strong>{interviewRound.roundType}</strong>
                <span>{interviewRound.scheduledAt ?? "未定时间"}</span>
                <span>{interviewRound.result ?? "待结果"}</span>
                <p>{interviewRound.notes}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>备注与阶段记录</h2>
          <p>{opportunity.notes ?? "暂无备注"}</p>
          <h3>阶段变化</h3>
          <ul>
            {opportunity.statusHistory.map((history) => (
              <li key={history.id}>
                {history.previousStage ?? "新建"} → {history.newStage} ·{" "}
                {new Date(history.changedAt).toLocaleString("zh-CN")}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
