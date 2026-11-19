import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "../../api";
import type { LibraryDocument } from "../../types";

const kindLabels: Record<LibraryDocument["kind"], string> = {
  resume: "简历",
  job: "岗位资料",
  project: "项目笔记",
  interview: "面试记录",
  other: "其他"
};

export default function DocumentPreview() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<LibraryDocument | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void api<LibraryDocument>(`/api/assistant/documents/${id}`)
      .then(setDocument)
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "资料读取失败")
      );
  }, [id]);

  if (!document) {
    return <section className="page"><p className="muted">{message || "正在读取资料…"}</p></section>;
  }

  return (
    <section className="page assistant-document-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Source preview</p>
          <h1>{document.title}</h1>
          <p>{kindLabels[document.kind]} · {document.fileName} · {document.enabled ? "检索中" : "已停用"}</p>
        </div>
        <div className="header-actions">
          <a className="ghost-button" href={`/api/assistant/documents/${document.id}/file`}>下载原件</a>
          <Link className="ghost-button" to="/assistant/documents">返回资料库</Link>
        </div>
      </header>
      <div className="assistant-tags">
        {document.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <section className="assistant-document-content">
        <div className="panel-header">
          <h2>提取正文</h2>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void navigator.clipboard.writeText(document.content ?? "")}
          >
            复制正文
          </button>
        </div>
        <pre>{document.content}</pre>
      </section>
    </section>
  );
}
