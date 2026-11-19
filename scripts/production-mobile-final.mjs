import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = "https://job-board-pages-5qp.pages.dev";
const output = ".codex-visual/production";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true
});
const page = await context.newPage();
await page.goto(site, { waitUntil: "networkidle" });
if (await page.getByLabel("访问码").isVisible()) {
  await page.getByLabel("访问码").fill("REPLACE_WITH_YOUR_ACCESS_CODE");
  await page.getByRole("button", { name: "进入看板" }).click();
}
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${output}/mobile-final-overview.png`, fullPage: true });
await page.getByRole("link", { name: "岗位库" }).last().click();
await page.getByRole("heading", { name: "岗位库" }).waitFor();
await page.getByText("正在筛选岗位…").waitFor({ state: "hidden" });
await page.screenshot({ path: `${output}/mobile-final-library.png`, fullPage: true });
const outputText = await page.locator("body").innerText();
console.log(JSON.stringify({
  hasSavedOpportunity: outputText.includes("AI 数据运营实习生"),
  hasCompany: outputText.includes("星火科技"),
  width: await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: window.innerWidth
  }))
}));
await browser.close();
