import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("local-browser-test-2026");
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "岗位库" }).first().click();
await page.getByRole("heading", { name: "岗位库" }).waitFor();
await page.waitForLoadState("networkidle");
await page.getByText("正在筛选岗位…").waitFor({ state: "hidden" });

const firstDelete = page.getByRole("button", { name: /^删除 / }).first();
const countBefore = await page.getByRole("button", { name: /^删除 / }).count();
if (countBefore > 0) {
  page.once("dialog", (dialog) => dialog.accept());
  await firstDelete.click();
  await page.getByText("岗位已删除").waitFor();
}
const countAfter = await page.getByRole("button", { name: /^删除 / }).count();
console.log(JSON.stringify({ countBefore, countAfter }));
await browser.close();
