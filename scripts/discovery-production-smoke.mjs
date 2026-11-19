import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = process.env.JOB_BOARD_SITE ?? "https://job-board-pages-5qp.pages.dev";
const output = ".codex-visual/discovery-production";
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
await page.getByRole("link", { name: /发现推荐/ }).click();
await page.getByRole("heading", { name: "发现推荐" }).waitFor();

await page.evaluate(async () => {
  const response = await fetch("/api/discovery/preferences", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      targetTitles: ["产品经理", "数据产品"],
      categoryIds: ["product", "data"],
      locations: ["成都"],
      remoteAllowed: true,
      salaryFloorK: 15,
      experienceLevel: "实习/初级",
      includeKeywords: ["AI", "数据"],
      excludeKeywords: ["培训", "课程", "销售"],
      enabled: false
    })
  });
  if (!response.ok) throw new Error(await response.text());
});
await page.reload({ waitUntil: "networkidle" });
const beforeJobs = await page.evaluate(async () => {
  const response = await fetch("/api/opportunities", { credentials: "same-origin" });
  return (await response.json()).length;
});
const runResponse = await page.evaluate(async () => {
  const response = await fetch("/api/discovery/runs", {
    method: "POST",
    credentials: "same-origin"
  });
  return { status: response.status, body: await response.json() };
});

let overview;
for (let attempt = 0; attempt < 45; attempt += 1) {
  overview = await page.evaluate(async () => {
    const response = await fetch("/api/discovery", { credentials: "same-origin" });
    return response.json();
  });
  if (!["queued", "running"].includes(overview.lastRun?.status)) break;
  await page.waitForTimeout(2000);
}
await page.reload({ waitUntil: "networkidle" });
await page.screenshot({ path: `${output}/discovery-desktop.png`, fullPage: true });

const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(`${site}/library?view=discovery`, { waitUntil: "networkidle" });
await mobile.getByRole("heading", { name: "发现推荐" }).waitFor();
await mobile.screenshot({ path: `${output}/discovery-mobile.png`, fullPage: true });
const mobileWidth = await mobile.evaluate(() => ({ body: document.body.scrollWidth, viewport: innerWidth }));
const afterJobs = await page.evaluate(async () => {
  const response = await fetch("/api/opportunities", { credentials: "same-origin" });
  return (await response.json()).length;
});

console.log(JSON.stringify({
  runStatus: runResponse.status,
  lastRun: overview?.lastRun,
  recommendations: overview?.recommendations?.length ?? 0,
  beforeJobs,
  afterJobs,
  mobileWidth
}));
await browser.close();
