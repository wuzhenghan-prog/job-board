import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = process.env.JOB_BOARD_LOCAL_SITE ?? "http://127.0.0.1:5173";
const output = ".codex-visual/assistant";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await desktop.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(site, { waitUntil: "networkidle" });
if (await page.getByLabel("访问码").isVisible().catch(() => false)) {
  await page.getByLabel("访问码").fill(process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE");
  await page.getByRole("button", { name: "进入看板" }).click();
}
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "AI", exact: true }).first().click();
await page.getByRole("heading", { name: "AI 助理" }).waitFor();
await page.screenshot({ path: `${output}/assistant-desktop.png`, fullPage: true });
const body = await page.locator("body").innerText();
console.log(JSON.stringify({
  readOnlyNotice: body.includes("AI 只读，不会修改岗位数据"),
  suggestions: body.includes("比较我目前的高匹配岗位"),
  desktopWidth: await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth })),
  errors
}));

await page.getByRole("link", { name: "资料库" }).first().click();
await page.getByRole("heading", { name: "资料库" }).waitFor();
await page.screenshot({ path: `${output}/documents-desktop.png`, fullPage: true });
console.log(JSON.stringify({
  privacyNotice: (await page.locator("body").innerText()).includes("上传前请遮盖身份证、手机号")
}));

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true
});
const mobilePage = await mobile.newPage();
await mobilePage.goto(site, { waitUntil: "networkidle" });
if (await mobilePage.getByLabel("访问码").isVisible().catch(() => false)) {
  await mobilePage.getByLabel("访问码").fill(process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE");
  await mobilePage.getByRole("button", { name: "进入看板" }).click();
}
await mobilePage.getByRole("heading", { name: "概览" }).waitFor();
await mobilePage.getByRole("link", { name: "AI", exact: true }).last().click();
await mobilePage.getByRole("heading", { name: "AI 助理" }).waitFor();
await mobilePage.screenshot({ path: `${output}/assistant-mobile.png`, fullPage: true });
console.log(JSON.stringify({
  mobileWidth: await mobilePage.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth })),
  historyButton: await mobilePage.getByRole("button", { name: "对话历史" }).isVisible()
}));
await browser.close();
