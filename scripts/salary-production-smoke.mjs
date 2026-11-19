import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const site = process.env.JOB_BOARD_SITE ?? "https://job-board-pages-5qp.pages.dev";
const output = ".codex-visual/salary-production";
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

const sample = await context.newPage();
await sample.setViewportSize({ width: 900, height: 1200 });
await sample.setContent(`
  <main style="font-family:Arial,'Microsoft YaHei',sans-serif;padding:56px;color:#171717">
    <h1 style="font-size:48px;margin:0 0 24px">数据产品实习生</h1>
    <p style="font-size:28px;margin:0 0 16px">星河数据科技有限公司 · 成都</p>
    <p style="font-size:32px;font-weight:700;margin:0 0 42px">薪资：18-25K·14薪</p>
    <h2 style="font-size:30px">岗位职责</h2>
    <p style="font-size:24px;line-height:1.7">负责数据产品需求分析、指标设计与项目复盘。</p>
    <h2 style="font-size:30px">岗位要求</h2>
    <p style="font-size:24px;line-height:1.7">本科及以上，每周到岗 4 天，具备数据分析能力。</p>
  </main>
`);
const screenshot = await sample.screenshot({ type: "png", fullPage: true });
await sample.close();

await page.getByRole("link", { name: "识别岗位" }).first().click();
await page.getByRole("heading", { name: "识别岗位" }).waitFor();
await page.locator('input[type="file"]').setInputFiles({
  name: "salary-jd.png",
  mimeType: "image/png",
  buffer: screenshot
});
await page.getByRole("button", { name: "上传并识别" }).click();
await page.getByRole("heading", { name: "确认识别结果" }).waitFor({ timeout: 120000 });
const salaryInput = page.getByLabel("薪资");
const recognizedSalary = await salaryInput.inputValue();
await page.screenshot({ path: `${output}/salary-review.png`, fullPage: true });
await page.getByRole("button", { name: "确认并保存" }).click();
await page.getByRole("heading", { name: "数据产品实习生" }).waitFor();
const detailText = await page.locator("body").innerText();
await page.screenshot({ path: `${output}/salary-detail.png`, fullPage: true });
const opportunityId = new URL(page.url()).pathname.split("/").at(-1);

const deleted = await page.evaluate(async (id) => {
  const response = await fetch(`/api/opportunities/${id}`, {
    method: "DELETE",
    credentials: "same-origin"
  });
  return response.status;
}, opportunityId);

console.log(JSON.stringify({
  recognizedSalary,
  detailHasSalary: detailText.includes(recognizedSalary),
  expectedSalaryVisible: recognizedSalary === "18-25K·14薪",
  deleted
}));
await browser.close();
