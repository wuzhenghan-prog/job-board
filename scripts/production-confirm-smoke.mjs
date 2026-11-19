import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = "https://job-board-pages-5qp.pages.dev";
const output = ".codex-visual/production";
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(site, { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("REPLACE_WITH_YOUR_ACCESS_CODE");
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "识别岗位" }).first().click();
await page.getByRole("heading", { name: "识别岗位" }).waitFor();
await page.locator('input[type="file"]').setInputFiles(".codex-visual/jd-sample.png");
await page.getByRole("button", { name: "上传并识别" }).click();
await page.getByRole("heading", { name: "确认识别结果" }).waitFor({ timeout: 90_000 });

const title = await page.getByLabel("岗位名称").inputValue();
const company = await page.getByLabel("公司").inputValue();
await page.getByRole("button", { name: "确认并保存" }).click();
await page.getByRole("heading", { name: title }).waitFor({ timeout: 30_000 });
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${output}/opportunity-detail-desktop.png`, fullPage: true });

const detailText = await page.locator("body").innerText();
console.log(JSON.stringify({
  title,
  company,
  detailLoaded: detailText.includes(title),
  imageCount: await page.locator(".image-grid img").count(),
  errors
}));
await browser.close();
