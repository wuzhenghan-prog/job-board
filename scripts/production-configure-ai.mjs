import { chromium } from "@playwright/test";

const site = "https://job-board-pages-5qp.pages.dev";
const accessCode = process.env.JOB_BOARD_ACCESS_CODE ?? "REPLACE_WITH_YOUR_ACCESS_CODE";
const apiKey = process.env.JOB_BOARD_AI_KEY;
if (!apiKey) {
  console.error("JOB_BOARD_AI_KEY is required");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
await context.addInitScript((key) => {
  window.__JOB_BOARD_AI_KEY = key;
}, apiKey);
const page = await context.newPage();
await page.goto(site, { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill(accessCode);
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();

const result = await page.evaluate(async () => {
  const response = await fetch("/api/ai-settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      baseUrl: "https://www-api.u2608605.nyat.app:57955/v1",
      model: "z-ai/glm-5.3-flash",
      apiKey: window.__JOB_BOARD_AI_KEY,
      dailyLimit: 30
    })
  });
  return { status: response.status, body: await response.json() };
});
console.log(JSON.stringify(result));
await browser.close();
