import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api } from "../api";
import type { JobRecommendation } from "../shared/discovery";
import type { Category, Opportunity } from "../types";
import OpportunityForm from "./OpportunityForm";

export default function DiscoverySavePage({ categories }: { categories: Category[] }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recommendation, setRecommendation] = useState<JobRecommendation | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api<{ recommendations: JobRecommendation[] }>("/api/discovery")
      .then((overview) => {
        const found = overview.recommendations.find((item) => item.id === id);
        if (!found) throw new Error("推荐不存在或已经处理");
        setRecommendation(found);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "推荐读取失败"));
  }, [id]);

  if (!recommendation) {
    return <section className="page"><p className="muted">{message || "正在读取推荐…"}</p></section>;
  }

  const categoryId = categories.find((category) => category.name === recommendation.categoryName)?.id ?? categories[0]?.id ?? "other";
  const initial: Opportunity = {
    id: recommendation.id,
    company: recommendation.company,
    title: recommendation.title,
    location: recommendation.location,
    salary: recommendation.salary,
    categoryId,
    categoryName: recommendation.categoryName,
    stage: "to_evaluate",
    responsibilities: recommendation.responsibilities,
    requirements: recommendation.requirements,
    abilities: recommendation.abilities,
    match: {
      level: recommendation.match.level,
      strengths: recommendation.match.strengths,
      gaps: recommendation.match.gaps,
      evidence: recommendation.match.evidence
    },
    deadline: recommendation.sourceValidThrough,
    sourceUrl: recommendation.sourceUrl,
    notes: `来自自动岗位发现：${recommendation.sourceDomain}`,
    version: 1,
    createdAt: recommendation.discoveredAt,
    updatedAt: recommendation.discoveredAt,
    images: [],
    interviewRounds: [],
    statusHistory: []
  };

  return (
    <section className="page discovery-save-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Review before saving</p>
          <h1>确认加入岗位库</h1>
          <p>核对公开岗位信息后，才会创建正式岗位</p>
        </div>
      </header>
      <OpportunityForm
        categories={categories}
        initial={initial}
        submitPath={`/api/discovery/recommendations/${recommendation.id}/save`}
        formTitle="推荐岗位确认"
        submitLabel="确认加入岗位库"
        onSaved={(saved) => navigate(`/opportunities/${saved.id}`)}
        onCancel={() => navigate("/library?view=discovery")}
      />
    </section>
  );
}
