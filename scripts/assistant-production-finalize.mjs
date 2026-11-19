import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = "https://job-board-pages-5qp.pages.dev";
const output = ".codex-visual/assistant-production";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1280, height: 980 } });
const page = await context.newPage();
await page.goto(site, { waitUntil: "networkidle" });
if (await page.getByLabel("访问码").isVisible().catch(() => false)) {
  await page.getByLabel("访问码").fill(process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE");
  await page.getByRole("button", { name: "进入看板" }).click();
}
await page.getByRole("heading", { name: "概览" }).waitFor();

const conversations = await page.evaluate(async () => {
  const response = await fetch("/api/assistant/conversations", {
    credentials: "same-origin"
  });
  return response.json();
});
for (const conversation of conversations) {
  await page.evaluate(async (id) => {
    const response = await fetch(`/api/assistant/conversations/${id}`, {
      method: "DELETE",
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error(`delete conversation ${id}: ${response.status}`);
  }, conversation.id);
}

const documentResult = await page.evaluate(async () => {
  const form = new FormData();
  form.set(
    "file",
    new File(
      ["产品实习项目复盘\n负责数据分析与产品运营。"],
      "assistant-smoke.md",
      { type: "text/markdown" }
    )
  );
  form.set("title", "AI 验收资料");
  form.set("kind", "project");
  form.set("tags", JSON.stringify(["验收", "产品"]));
  form.set("content", "产品实习项目复盘\n负责数据分析与产品运营。");
  const response = await fetch("/api/assistant/documents", {
    method: "POST",
    credentials: "same-origin",
    body: form
  });
  return { status: response.status, body: await response.json() };
});
if (documentResult.status !== 201) throw new Error(JSON.stringify(documentResult));

const previewStatus = await page.evaluate(async (id) => {
  const response = await fetch(`/api/assistant/documents/${id}`, {
    credentials: "same-origin"
  });
  return response.status;
}, documentResult.body.id);

const download = await page.evaluate(async (id) => {
  const response = await fetch(`/api/assistant/documents/${id}/file`, {
    credentials: "same-origin"
  });
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type")
  };
}, documentResult.body.id);

const deleteStatus = await page.evaluate(async (id) => {
  const response = await fetch(`/api/assistant/documents/${id}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  return response.status;
}, documentResult.body.id);

await page.goto(`${site}/assistant`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "AI 助理" }).waitFor();
await page.screenshot({ path: `${output}/assistant-clean.png`, fullPage: true });
console.log(JSON.stringify({
  deletedConversations: conversations.length,
  documentStatus: documentResult.status,
  previewStatus,
  downloadStatus: download.status,
  downloadType: download.contentType,
  downloadTextLength: download.text.length,
  deleteStatus
}));
await browser.close();
