import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import { api } from "../api";
import { computeDashboardSignals } from "../dashboardSignals";
import { STAGES } from "../shared/domain";
import type { DiscoveryOverview } from "../shared/discovery";
import type { Category, Opportunity } from "../types";

export default function Dashboard({ categories }: { categories: Category[] }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [discoveryCount, setDiscoveryCount] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<Opportunity[]>("/api/opportunities");
        setOpportunities(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void api<DiscoveryOverview>("/api/discovery")
      .then((data) => setDiscoveryCount(data.recommendations.length))
      .catch(() => setDiscoveryCount(0));
  }, []);

  const counts = STAGES.map((stage) => ({
    ...stage,
    count: opportunities.filter((opportunity) => opportunity.stage === stage.value).length
  }));

  const recent = [...opportunities]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);
  const signals = computeDashboardSignals(opportunities);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Opportunity index</p>
          <h1>概览</h1>
          <p>今天的求职机会轨道与最新变化</p>
        </div>
        <div className="header-actions">
          <Link className="ghost-button" to="/library?view=discovery">
            发现推荐{discoveryCount > 0 ? ` · ${discoveryCount}` : ""}
          </Link>
          <Link className="primary-button" to="/upload">识别新岗位</Link>
        </div>
      </header>

      <div className="stage-track">
        {counts.map((stage) => (
          <Link
            key={stage.value}
            className={`stage-node tone-${stage.tone}`}
            to={`/library?stage=${stage.value}`}
          >
            <span>{stage.count}</span>
            <strong>{stage.label}</strong>
          </Link>
        ))}
      </div>

      <section className="signal-band" aria-label="能力信号">
        <div className="signal-intro">
          <p className="eyebrow">Ability signals</p>
          <h2>能力足够清晰，机会才有方向。</h2>
        </div>
        <div className="signal-metrics">
          <div className="signal-metric">
            <span>高频能力</span>
            {signals.topAbilities.length > 0 ? (
              <div className="signal-chips">
                {signals.topAbilities.map((ability) => (
                  <span key={ability}>{ability}</span>
                ))}
              </div>
            ) : (
              <strong className="signal-empty">上传岗位后生成</strong>
            )}
          </div>
          <div className="signal-metric">
            <span>覆盖分类</span>
            <strong>{signals.categoryCount}</strong>
          </div>
          <div className="signal-metric tone-security">
            <span>14 天内截止</span>
            <strong>{signals.dueSoonCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel-list">
        <div className="panel-header">
          <h2>最近更新</h2>
          <span className="muted">{opportunities.length} 个岗位</span>
        </div>
        {loading ? (
          <p className="muted">正在读取岗位…</p>
        ) : recent.length === 0 ? (
          <div className="empty-state">
            <p>还没有岗位。</p>
            <Link className="primary-button" to="/upload">上传第一份 JD 截图</Link>
          </div>
        ) : (
          <div className="opportunity-grid">
            {recent.map((opportunity) => (
              <Link
                key={opportunity.id}
                className="opportunity-card"
                to={`/opportunities/${opportunity.id}`}
              >
                <div className="card-top">
                  <strong>{opportunity.title}</strong>
                  <span className="category-chip">
                    {categories.find((category) => category.id === opportunity.categoryId)?.name ?? opportunity.categoryName}
                  </span>
                </div>
                <div className="card-meta">
                  <span>{opportunity.company ?? "未识别公司"}</span>
                  <span>{opportunity.location ?? "未识别地点"}</span>
                  <span>{opportunity.salary ?? "薪资未识别"}</span>
                </div>
                <div className="ability-bars">
                  <div style={{ width: `${Math.min(opportunity.abilities.hard.length * 20, 100)}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
