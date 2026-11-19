import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = ".codex-visual";
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("local-browser-test-2026");
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.waitForLoadState("networkidle");

console.log(`LOGGED_IN=${await page.getByRole("heading", { name: "概览" }).isVisible()}`);
await page.screenshot({ path: `${outputDirectory}/desktop-dashboard-empty.png`, fullPage: true });

await page.getByRole("link", { name: "岗位库" }).first().click();
await page.getByRole("heading", { name: "岗位库" }).waitFor();
await page.waitForLoadState("networkidle");
const manualButton = page.getByRole("button", { name: "手动新增" });
if (await manualButton.isVisible()) {
  await manualButton.click();
  await page.getByLabel("岗位名称").fill("AI 产品运营实习生");
  await page.getByLabel("公司").fill("星火科技");
  await page.getByLabel("地点").fill("成都");
  await page.getByLabel("分类").selectOption({ label: "产品" });
  await page.getByLabel("职责，每行一条").fill("负责产品数据复盘\n推进跨团队实验");
  await page.getByLabel("要求，每行一条", { exact: true }).fill("本科及以上在读\n每周到岗 4 天");
  await page.getByLabel("硬技能，每行一条").fill("数据分析\n产品规划");
  await page.getByLabel("通用能力，每行一条").fill("跨团队沟通\n项目推进");
  await page.getByLabel("匹配等级").selectOption("medium");
  await page.getByLabel("个人优势，每行一条").fill("项目管理");
  await page.getByLabel("能力缺口，每行一条").fill("缺少平台产品经验");
  await page.getByRole("button", { name: "保存岗位" }).click();
  await page.getByRole("link", { name: /AI 产品运营实习生/ }).first().waitFor();
}
await page.screenshot({ path: `${outputDirectory}/desktop-library.png`, fullPage: true });
console.log(`LIBRARY_TEXT=${(await page.locator("body").innerText()).slice(0, 800)}`);

const card = page.getByRole("link", { name: /AI 产品运营实习生/ }).first();
if (await card.isVisible()) {
  await card.click();
  await page.getByRole("heading", { name: "AI 产品运营实习生" }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${outputDirectory}/desktop-detail.png`, fullPage: true });
  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("岗位名称").fill("AI 产品运营负责人");
  await page.getByRole("button", { name: "保存岗位" }).click();
  await page.getByRole("heading", { name: "AI 产品运营负责人" }).waitFor();
  console.log(`EDITED=${await page.getByRole("heading", { name: "AI 产品运营负责人" }).isVisible()}`);
  await page.screenshot({ path: `${outputDirectory}/desktop-detail-edited.png`, fullPage: true });
}

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto("http://127.0.0.1:5173/library", { waitUntil: "networkidle" });
await mobile.screenshot({ path: `${outputDirectory}/mobile-library.png`, fullPage: true });
await mobile.getByRole("link", { name: /AI 产品运营负责人/ }).first().click();
await mobile.getByRole("heading", { name: "AI 产品运营负责人" }).waitFor();
await mobile.screenshot({ path: `${outputDirectory}/mobile-detail.png`, fullPage: true });
console.log(`ERRORS=${JSON.stringify(errors)}`);

await browser.close();
