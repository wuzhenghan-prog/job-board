import { Link } from "react-router-dom";

import type { AssistantCitation } from "../../types";
import { readableCitationSnippet } from "../../shared/assistant";

const labels = {
  opportunity: "岗位",
  document: "资料",
  web: "网页"
} as const;

export default function CitationCard({
  citation
}: {
  citation: AssistantCitation;
}) {
  const deleted = !citation.url;
  const content = (
    <>
      <div className="citation-heading">
        <span>{labels[citation.type]}</span>
        <strong>{citation.title}</strong>
        {deleted && <em>来源已删除</em>}
      </div>
      <p className="citation-snippet">
        {readableCitationSnippet(citation.snippet) || "暂无摘要"}
      </p>
      {citation.type === "web" && (
        <small>{new URL(citation.url).hostname}</small>
      )}
    </>
  );

  if (deleted) {
    return <div className="citation-card deleted">{content}</div>;
  }
  if (citation.type === "web") {
    return (
      <a
        className="citation-card"
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  }
  return (
    <Link className="citation-card" to={citation.url}>
      {content}
    </Link>
  );
}
