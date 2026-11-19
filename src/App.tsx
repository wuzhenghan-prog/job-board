import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";

import Dashboard from "./components/Dashboard";
import Library from "./components/Library";
import OpportunityDetail from "./components/OpportunityDetail";
import UploadPage from "./components/UploadPage";
import SettingsPage from "./components/SettingsPage";
import LoginPage from "./components/LoginPage";
import AssistantPage from "./components/assistant/AssistantPage";
import DocumentLibrary from "./components/assistant/DocumentLibrary";
import DocumentPreview from "./components/assistant/DocumentPreview";
import DiscoverySavePage from "./components/DiscoverySavePage";
import { api } from "./api";
import type { Category } from "./types";

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const location = useLocation();

  const refreshCategories = async () => {
    const categories = await api<Category[]>("/api/categories");
    setCategories(categories);
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
  };

  useEffect(() => {
    (async () => {
      try {
        await api<Category[]>("/api/categories");
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
      }
    })();
  }, [location.pathname]);

  useEffect(() => {
    if (authenticated) {
      void refreshCategories();
    }
  }, [authenticated]);

  if (authenticated === null) {
    return <div className="app-loading">正在进入机会看板…</div>;
  }

  if (!authenticated) {
    return <LoginPage onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            <span className="brand-mark">J</span>
            <span>机会档案</span>
          </Link>
          <nav className="top-nav" aria-label="主导航">
            <Link className={location.pathname === "/" ? "active" : ""} to="/">概览</Link>
            <Link className={location.pathname.startsWith("/library") ? "active" : ""} to="/library">岗位库</Link>
            <Link className={location.pathname.startsWith("/upload") ? "active" : ""} to="/upload">识别岗位</Link>
            <Link className={location.pathname.startsWith("/assistant") ? "active" : ""} to="/assistant">AI</Link>
            <Link className={location.pathname.startsWith("/settings") ? "active" : ""} to="/settings">设置</Link>
          </nav>
          <button className="logout-link" onClick={() => void logout()}>退出</button>
        </div>
      </header>
      <main className="content">
        <Routes>
          <Route
            path="/"
            element={<Dashboard categories={categories} />}
          />
          <Route
            path="/library"
            element={<Library categories={categories} onCategoriesChanged={refreshCategories} />}
          />
          <Route
            path="/library/discovery/:id/save"
            element={<DiscoverySavePage categories={categories} />}
          />
          <Route
            path="/opportunities/:id"
            element={<OpportunityDetail categories={categories} />}
          />
          <Route
            path="/upload"
            element={<UploadPage categories={categories} />}
          />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/assistant/chat/:id" element={<AssistantPage />} />
          <Route path="/assistant/documents" element={<DocumentLibrary />} />
          <Route path="/assistant/documents/:id" element={<DocumentPreview />} />
          <Route
            path="/settings"
            element={<SettingsPage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav">
        <Link className={location.pathname === "/" ? "active" : ""} to="/">概览</Link>
        <Link className={location.pathname.startsWith("/library") ? "active" : ""} to="/library">岗位库</Link>
        <Link className={location.pathname.startsWith("/upload") ? "active" : ""} to="/upload">识别</Link>
        <Link className={location.pathname.startsWith("/assistant") ? "active" : ""} to="/assistant">AI</Link>
        <Link className={location.pathname.startsWith("/settings") ? "active" : ""} to="/settings">设置</Link>
      </nav>
    </div>
  );
}
