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
await page.goto(site, { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("REPLACE_WITH_YOUR_ACCESS_CODE");
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "识别岗位" }).first().click();
await page.getByRole("heading", { name: "识别岗位" }).waitFor();
await page.locator('input[type="file"]').setInputFiles(
  ".codex-visual/jd-sample.png"
);
await page.getByRole("button", { name: "上传并识别" }).click();
await page.getByRole("heading", { name: "识别任务" }).waitFor();

const statuses = [];
for (let attempt = 0; attempt < 30; attempt += 1) {
  const text = await page.locator("body").innerText();
  const match = text.match(/状态：(\w+)/);
  statuses.push(match?.[1] ?? "unknown");
  if (match?.[1] === "awaiting_review" || match?.[1] === "failed") break;
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: `${output}/extraction-status.png`, fullPage: true });
console.log(`STATUSES=${statuses.join(",")}`);
console.log(`BODY=${(await page.locator("body").innerText()).slice(0, 1800)}`);
await browser.close();
