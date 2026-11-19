import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../../api";
import { detectProfileFileKind, extractProfileFileText } from "../../profileImport";
import type { LibraryDocument } from "../../types";

const kindLabels: Record<LibraryDocument["kind"], string> = {
  resume: "简历",
  job: "岗位资料",
  project: "项目笔记",
  interview: "面试记录",
  other: "其他"
};

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<LibraryDocument["kind"]>("resume");
  const [tags, setTags] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setDocuments(await api<LibraryDocument[]>("/api/assistant/documents"));
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("请选择一个资料文件");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      detectProfileFileKind(file.name);
      const content = await extractProfileFileText(file);
      if (!title.trim()) throw new Error("请填写资料标题");
      const form = new FormData();
      form.set("file", file);
      form.set("title", title.trim());
      form.set("kind", kind);
      form.set("tags", JSON.stringify(
        tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean)
      ));
      form.set("content", content);
      await api<LibraryDocument>("/api/assistant/documents", {
        method: "POST",
        body: form
      });
      if (fileRef.current) fileRef.current.value = "";
      setTitle("");
      setTags("");
      setMessage("资料已保存并启用检索");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "资料上传失败");
    } finally {
      setUploading(false);
    }
  };

  const toggle = async (document: LibraryDocument) => {
    await api<LibraryDocument>(`/api/assistant/documents/${document.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !document.enabled })
    });
    await load();
  };

  const remove = async (document: LibraryDocument) => {
    if (!window.confirm(`永久删除“${document.title}”及其原件？`)) return;
    await api(`/api/assistant/documents/${document.id}`, { method: "DELETE" });
    await load();
  };

  return (
    <section className="page assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Private library</p>
          <h1>资料库</h1>
          <p>用于 AI 检索的简历、项目与面试资料</p>
        </div>
        <Link className="ghost-button" to="/assistant">返回 AI 助理</Link>
      </header>
      {message && <p className="muted">{message}</p>}

      <section className="assistant-upload-panel">
        <div className="assistant-upload-intro">
          <h2>添加资料</h2>
          <p>上传前请遮盖身份证、手机号、住址等敏感信息。原件仅限登录后访问。</p>
        </div>
        <div className="assistant-upload-form">
          <label className="assistant-file-field">
            <span>Markdown、TXT、DOCX 或 PDF</span>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt,.docx,.pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
          <label><span>标题</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>
            <span>类型</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as LibraryDocument["kind"])}>
              {Object.entries(kindLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </select>
          </label>
          <label><span>标签，用逗号分隔</span><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="产品, 数据分析" /></label>
          <button className="primary-button" type="button" disabled={uploading} onClick={() => void upload()}>
            {uploading ? "正在读取并保存…" : "上传资料"}
          </button>
        </div>
      </section>

      <section className="assistant-document-section">
        <div className="panel-header">
          <h2>已保存资料</h2>
          <span className="muted">{documents.length} 份</span>
        </div>
        {documents.length === 0 ? (
          <p className="muted">还没有资料。上传后可在对话中检索。</p>
        ) : (
          <div className="assistant-document-list">
            {documents.map((document) => (
              <div className="assistant-document-row" key={document.id}>
                <Link to={`/assistant/documents/${document.id}`}>
                  <strong>{document.title}</strong>
                  <p>{kindLabels[document.kind]} · {document.fileName}</p>
                  <div className="assistant-tags">
                    {document.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                </Link>
                <div className="assistant-document-actions">
                  <button type="button" onClick={() => void toggle(document)}>
                    {document.enabled ? "停用检索" : "启用检索"}
                  </button>
                  <button type="button" className="danger-text" onClick={() => void remove(document)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
