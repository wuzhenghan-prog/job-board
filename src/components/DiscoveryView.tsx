import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import type { DiscoveryOverview, DiscoveryPreferences } from "../shared/discovery";
import type { Category } from "../types";

function splitList(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function joinList(value: string[]): string {
  return value.join(", ");
}

function runStatusLabel(status: string | undefined): string {
  switch (status) {
    case "queued": return "等待运行";
    case "running": return "正在搜索";
    case "completed": return "搜索完成";
    case "failed": return "搜索失败";
    default: return "尚未运行";
  }
}

export default function DiscoveryView({ categories }: { categories: Category[] }) {
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [remoteAllowed, setRemoteAllowed] = useState(false);
  const [salaryFloorK, setSalaryFloorK] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [includeKeywords, setIncludeKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [enabled, setEnabled] = useState(false);

  const configured = useMemo(() => {
    if (!overview) return false;
    return overview.preferences.targetTitles.length > 0 || overview.preferences.categoryIds.length > 0;
  }, [overview]);

  const hydrate = (preferences: DiscoveryPreferences) => {
    setTitles(joinList(preferences.targetTitles));
    setLocations(joinList(preferences.locations));
    setSelectedCategories(preferences.categoryIds);
    setRemoteAllowed(preferences.remoteAllowed);
    setSalaryFloorK(preferences.salaryFloorK?.toString() ?? "");
    setExperienceLevel(preferences.experienceLevel);
    setIncludeKeywords(joinList(preferences.includeKeywords));
    setExcludeKeywords(joinList(preferences.excludeKeywords));
    setEnabled(preferences.enabled);
  };

  const load = async () => {
    const data = await api<DiscoveryOverview>("/api/discovery");
    setOverview(data);
    hydrate(data.preferences);
    if (!data.preferences.targetTitles.length && !data.preferences.categoryIds.length) {
      setShowPreferences(true);
    }
  };

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "读取推荐失败"));
  }, []);

  useEffect(() => {
    if (overview?.lastRun?.status !== "queued" && overview?.lastRun?.status !== "running") return;
    const timer = setTimeout(() => void load().catch(() => {}), 3000);
    return () => clearTimeout(timer);
  }, [overview?.lastRun?.status]);

  const savePreferences = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api<DiscoveryPreferences>("/api/discovery/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          targetTitles: splitList(titles),
          categoryIds: selectedCategories,
          locations: splitList(locations),
          remoteAllowed,
          salaryFloorK: salaryFloorK ? Number(salaryFloorK) : null,
          experienceLevel: experienceLevel.trim(),
          includeKeywords: splitList(includeKeywords),
          excludeKeywords: splitList(excludeKeywords),
          enabled
        })
      });
      setShowPreferences(false);
      setMessage("求职偏好已保存");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "偏好保存失败");
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/discovery/runs", { method: "POST" });
      setMessage("岗位发现任务已开始，请稍候刷新");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法开始搜索");
    } finally {
      setBusy(false);
    }
  };

  const ignore = async (id: string) => {
    if (!window.confirm("忽略后该岗位不会再次出现在推荐中，确定继续吗？")) return;
    await api(`/api/discovery/recommendations/${id}/ignore`, { method: "POST" });
    await load();
  };

  return (
    <section className="page discovery-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Daily discovery</p>
          <h1>发现推荐</h1>
          <p>每日搜索公开岗位，只有你确认后才进入正式岗位库</p>
        </div>
        <div className="header-actions">
          <Link className="ghost-button" to="/library">我的岗位</Link>
          <button className="ghost-button" onClick={() => setShowPreferences((value) => !value)}>偏好设置</button>
          <button className="primary-button" disabled={busy || !configured || !overview?.canRunNow} onClick={() => void runNow()}>立即刷新</button>
        </div>
      </header>

      <nav className="discovery-tabs" aria-label="岗位库视图">
        <Link to="/library">我的岗位</Link>
        <span className="active">发现推荐</span>
      </nav>

      {message && <p className="muted">{message}</p>}

      <section className="discovery-status">
        <div><span>自动发现</span><strong>{overview?.preferences.enabled ? "已启用 · 每日 08:00" : "未启用"}</strong></div>
        <div><span>上次运行</span><strong>{runStatusLabel(overview?.lastRun?.status)}</strong></div>
        <div><span>候选数</span><strong>{overview?.lastRun?.candidateCount ?? 0}</strong></div>
        <div><span>通过硬过滤数</span><strong>{overview?.lastRun?.hardFilteredCount ?? 0}</strong></div>
        <div><span>模型排除数</span><strong>{overview?.lastRun?.modelExcludedCount ?? 0}</strong></div>
        <div><span>新推荐</span><strong>{overview?.recommendations.length ?? 0}</strong></div>
        <div><span>手动刷新</span><strong>{overview?.manualRunsToday ?? 0}/{overview?.manualRunLimit ?? 3}</strong></div>
      </section>

      {showPreferences && (
        <form className="discovery-preferences panel" onSubmit={savePreferences}>
          <div className="form-header">
            <h2>求职偏好</h2>
            <label className="discovery-toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />启用每日自动发现</label>
          </div>
          <p className="muted">目标岗位/分类与城市是硬过滤；其他条件用于匹配评分。</p>
          <div className="form-grid">
            <label className="span-2"><span>目标岗位，用逗号分隔</span><input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="产品经理, 数据产品, 项目管理" /></label>
            <label className="span-2"><span>城市，用逗号分隔</span><input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="成都, 北京, 上海" /></label>
            <label className="span-2"><span>目标分类</span><div className="discovery-category-options">{categories.map((category) => <label key={category.id}><input type="checkbox" checked={selectedCategories.includes(category.id)} onChange={(e) => setSelectedCategories((current) => e.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id))} />{category.name}</label>)}</div></label>
            <label><span>接受远程</span><select value={remoteAllowed ? "yes" : "no"} onChange={(e) => setRemoteAllowed(e.target.value === "yes")}><option value="no">否</option><option value="yes">是</option></select></label>
            <label><span>期望月薪下限（K）</span><input type="number" min={0} max={1000} value={salaryFloorK} onChange={(e) => setSalaryFloorK(e.target.value)} /></label>
            <label><span>经验级别</span><input value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} placeholder="实习 / 初级 / 中级" /></label>
            <label><span>必须包含词</span><input value={includeKeywords} onChange={(e) => setIncludeKeywords(e.target.value)} placeholder="AI, 数据" /></label>
            <label><span>排除词</span><input value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} placeholder="销售, 外包" /></label>
          </div>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? "保存中…" : "保存偏好"}</button>
        </form>
      )}

      {!configured ? (
        <div className="empty-state">
          <p>先配置求职偏好，自动发现才会开始工作。</p>
          <button className="primary-button" onClick={() => setShowPreferences(true)}>配置偏好</button>
        </div>
      ) : (overview?.recommendations.length ?? 0) === 0 ? (
        <div className="empty-state">
          <p>目前没有待处理推荐。</p>
          <p className="muted">每日北京时间 08:00 自动搜索，也可以使用“立即刷新”。</p>
        </div>
      ) : (
        <div className="discovery-list">
          {overview?.recommendations.map((recommendation) => (
            <article className="discovery-card" key={recommendation.id}>
              <div className="discovery-card-main">
                <div className="discovery-card-title">
                  <div>
                    <span className={`level ${recommendation.match.level}`}>{recommendation.match.score} · {recommendation.match.level === "high" ? "高匹配" : recommendation.match.level === "medium" ? "中匹配" : "低匹配"}</span>
                    <h2>{recommendation.title}</h2>
                    <p>{recommendation.company ?? "公司未知"} · {recommendation.location ?? "地点未知"} · {recommendation.salary ?? "薪资未知"}</p>
                  </div>
                  <a href={recommendation.sourceUrl} target="_blank" rel="noopener noreferrer">{recommendation.sourceDomain}</a>
                </div>
                <div className="discovery-reasons">
                  <div><strong>匹配理由</strong>{recommendation.match.strengths.length ? <ul>{recommendation.match.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂无</p>}</div>
                  <div><strong>待补能力</strong>{recommendation.match.gaps.length ? <ul>{recommendation.match.gaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂无</p>}</div>
                </div>
                {recommendation.missingFields.length > 0 && <p className="discovery-missing">缺失字段：{recommendation.missingFields.join("、")}</p>}
              </div>
              <div className="discovery-card-actions">
                <button className="ghost-button" onClick={() => void ignore(recommendation.id)}>忽略</button>
                <Link className="ghost-button" to={`/library/discovery/${recommendation.id}/save`}>保存到岗位库</Link>
                {recommendation.sourceUrl && (
                  <a
                    className="primary-button"
                    href={recommendation.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    前往平台投递
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
