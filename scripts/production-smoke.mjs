import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = process.env.JOB_BOARD_SITE ?? "https://job-board-pages-5qp.pages.dev";
const accessCode = process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE";
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
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(site, { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill(accessCode);
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${output}/overview-mobile.png`, fullPage: true });

const overview = await page.locator("body").innerText();
console.log(`LOGIN_OK=${overview.includes("最近更新")}`);
console.log(`EMPTY_LIBRARY=${overview.includes("还没有岗位")}`);

await page.getByRole("link", { name: "岗位库" }).last().click();
await page.getByRole("heading", { name: "岗位库" }).waitFor();
await page.getByText("正在筛选岗位…").waitFor({ state: "hidden" });
await page.screenshot({ path: `${output}/library-mobile.png`, fullPage: true });

const apiResult = await page.evaluate(async () => {
  const response = await fetch("/api/opportunities", {
    credentials: "same-origin"
  });
  return { status: response.status, body: await response.json() };
});
console.log(`API_STATUS=${apiResult.status}`);
console.log(`OPPORTUNITIES=${apiResult.body.length}`);
console.log(`ERRORS=${JSON.stringify(errors)}`);

await browser.close();
