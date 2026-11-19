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
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(site, { waitUntil: "networkidle" });
if (await page.getByLabel("访问码").isVisible().catch(() => false)) {
  await page.getByLabel("访问码").fill(process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE");
  await page.getByRole("button", { name: "进入看板" }).click();
}
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "AI", exact: true }).first().click();
await page.getByRole("heading", { name: "AI 助理" }).waitFor();

const before = await page.evaluate(async () => {
  const response = await fetch("/api/assistant/conversations", {
    credentials: "same-origin"
  });
  return response.json();
});
await page.getByRole("button", { name: "新建对话" }).first().click();
await page.waitForURL(/\/assistant\/chat\//);
const conversationId = new URL(page.url()).pathname.split("/").at(-1);

const question = "请根据站内岗位简要分析我应该优先准备什么，不要修改任何数据。";
await page.getByLabel("向 AI 助理提问").fill(question);
await page.getByRole("button", { name: "发送问题" }).click();
await page.getByText("回答完成").waitFor({ timeout: 120000 });
await page.screenshot({ path: `${output}/assistant-answer.png`, fullPage: true });
const bodyText = await page.locator("body").innerText();

const detail = await page.evaluate(async (id) => {
  const response = await fetch(`/api/assistant/conversations/${id}`, {
    credentials: "same-origin"
  });
  return response.json();
}, conversationId);
const usage = await page.evaluate(async () => {
  const response = await fetch("/api/assistant/usage", {
    credentials: "same-origin"
  });
  return response.json();
});

console.log(JSON.stringify({
  conversationId,
  previousConversationCount: before.length,
  answered: bodyText.includes("回答完成"),
  hasUserQuestion: bodyText.includes(question),
  messages: detail.messages.map((message) => ({
    role: message.role,
    status: message.status,
    contentLength: message.content.length,
    citations: message.citations.length
  })),
  usage,
  errors
}));
await browser.close();
