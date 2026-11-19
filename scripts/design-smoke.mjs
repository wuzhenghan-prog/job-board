import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const output = ".codex-visual/design";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});

async function login(page) {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.getByLabel("访问码").fill("local-browser-test-2026");
  await page.getByRole("button", { name: "进入看板" }).click();
  await page.getByRole("heading", { name: "概览" }).waitFor();
  await page.waitForLoadState("networkidle");
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
await login(desktop);
await desktop.screenshot({ path: `${output}/desktop-overview.png`, fullPage: true });
await desktop.getByRole("link", { name: "岗位库" }).click();
await desktop.getByRole("heading", { name: "岗位库" }).waitFor();
await desktop.getByText("正在筛选岗位…").waitFor({ state: "hidden" });
await desktop.screenshot({ path: `${output}/desktop-library.png`, fullPage: true });
const firstCard = desktop.locator(".library-card a").first();
if (await firstCard.count()) {
  await firstCard.click();
  await desktop.locator(".detail-grid").waitFor();
  await desktop.screenshot({ path: `${output}/desktop-detail.png`, fullPage: true });
}
await desktop.getByRole("link", { name: "设置" }).click();
await desktop.getByRole("heading", { name: "设置" }).waitFor();
await desktop.screenshot({ path: `${output}/desktop-settings.png`, fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await login(mobile);
await mobile.screenshot({ path: `${output}/mobile-overview.png`, fullPage: true });
await mobile.getByRole("link", { name: "岗位库" }).last().click();
await mobile.getByRole("heading", { name: "岗位库" }).waitFor();
await mobile.getByText("正在筛选岗位…").waitFor({ state: "hidden" });
await mobile.screenshot({ path: `${output}/mobile-library.png`, fullPage: true });

await browser.close();
