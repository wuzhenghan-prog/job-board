import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { api } from "../api";
import OpportunityForm from "./OpportunityForm";
import DiscoveryView from "./DiscoveryView";
import { STAGES } from "../shared/domain";
import type { Category, Opportunity } from "../types";

export default function Library({
  categories,
  onCategoriesChanged
}: {
  categories: Category[];
  onCategoriesChanged: () => void;
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchParams] = useSearchParams();

  const load = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set("search", search);
      if (stage) query.set("stage", stage);
      if (categoryId) query.set("categoryId", categoryId);
      const data = await api<Opportunity[]>(`/api/opportunities?${query.toString()}`);
      setOpportunities(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, stage, categoryId]);

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await api<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName.trim() })
      });
      setNewCategoryName("");
      onCategoriesChanged();
      setMessage("分类已添加");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "添加失败");
    }
  };

  const grouped = useMemo(() => {
    return STAGES.map((stage) => ({
      ...stage,
      items: opportunities.filter((opportunity) => opportunity.stage === stage.value)
    }));
  }, [opportunities]);

  const moveOpportunity = async (id: string, nextStage: string) => {
    const previous = opportunities.find((opportunity) => opportunity.id === id);
    if (!previous || previous.stage === nextStage) return;
    setOpportunities((current) =>
      current.map((opportunity) =>
        opportunity.id === id
          ? { ...opportunity, stage: nextStage as Opportunity["stage"] }
          : opportunity
      )
    );
    try {
      await api(`/api/opportunities/${id}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: nextStage })
      });
    } catch (error) {
      setOpportunities((current) =>
        current.map((opportunity) =>
          opportunity.id === id ? previous : opportunity
        )
      );
      setMessage(error instanceof Error ? error.message : "阶段更新失败");
    }
  };

  const deleteOpportunity = async (opportunity: Opportunity) => {
    const label = opportunity.company
      ? `${opportunity.company} · ${opportunity.title}`
      : opportunity.title;
    const confirmed = window.confirm(
      `确定删除“${label}”吗？截图、面试记录和阶段历史也会一并删除。`
    );
    if (!confirmed) return;

    const previous = opportunities;
    setOpportunities((current) =>
      current.filter((item) => item.id !== opportunity.id)
    );
    try {
      await api(`/api/opportunities/${opportunity.id}`, { method: "DELETE" });
      setMessage("岗位已删除");
    } catch (error) {
      setOpportunities(previous);
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  if (searchParams.get("view") === "discovery") {
    return <DiscoveryView categories={categories} />;
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Opportunity library</p>
          <h1>岗位库</h1>
          <p>按阶段、分类与关键词筛选你的目标岗位</p>
        </div>
        <div className="header-actions">
          <Link className="ghost-button" to="/library?view=discovery">发现推荐</Link>
          <button className="primary-button" onClick={() => setShowCreateForm(true)}>手动新增</button>
        </div>
      </header>

      {showCreateForm && (
        <OpportunityForm
          categories={categories}
          defaultCategoryId="product"
          onSaved={(saved) => {
            setOpportunities((current) => [saved, ...current]);
            setShowCreateForm(false);
            setMessage("岗位已新增");
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      <div className="filter-bar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索公司、岗位、地点"
        />
        <select value={stage} onChange={(event) => setStage(event.target.value)}>
          <option value="">全部阶段</option>
          {STAGES.map((stage) => (
            <option key={stage.value} value={stage.value}>{stage.label}</option>
          ))}
        </select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">全部分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>

      <div className="category-form">
        <form onSubmit={addCategory}>
          <input
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="新增分类，如：算法研究"
          />
          <button type="submit">添加分类</button>
        </form>
        {message && <p className="muted">{message}</p>}
      </div>

      {loading ? (
        <p className="muted">正在筛选岗位…</p>
      ) : opportunities.length === 0 ? (
        <div className="empty-state">
          <p>没有符合条件的岗位。</p>
          <Link className="primary-button" to="/upload">识别新岗位</Link>
        </div>
      ) : (
        <div className="library-columns">
          {grouped.map((group) => (
            <div
              className={`library-column tone-${group.tone}`}
              key={group.value}
            >
              <header>
                <strong>{group.label}</strong>
                <span>{group.items.length}</span>
              </header>
              {group.items.map((opportunity) => (
                <div
                  className="library-card draggable-card"
                  key={opportunity.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/opportunity-id", opportunity.id)}
                >
                  <Link to={`/opportunities/${opportunity.id}`}>
                    <strong>{opportunity.title}</strong>
                    <span>{opportunity.company ?? "未识别公司"}</span>
                    <span>{opportunity.location ?? "未识别地点"}</span>
                    <span>{opportunity.salary ?? "薪资未识别"}</span>
                  </Link>
                  <div className="library-card-footer">
                    <span className={`level ${opportunity.match.level}`}>
                      {opportunity.match.level === "high" ? "高匹配" : opportunity.match.level === "medium" ? "中匹配" : "低匹配"}
                    </span>
                    <select
                      aria-label={`更改 ${opportunity.title} 阶段`}
                      value={opportunity.stage}
                      onChange={(event) => void moveOpportunity(opportunity.id, event.target.value)}
                    >
                      {STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                    </select>
                    <button
                      className="card-delete-button"
                      type="button"
                      aria-label={`删除 ${opportunity.title}`}
                      onClick={() => void deleteOpportunity(opportunity)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              <div
                className="drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/opportunity-id");
                  if (id) void moveOpportunity(id, group.value);
                }}
              >
                拖到这里
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
