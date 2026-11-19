import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = ".codex-visual";
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  `${outputDirectory}/jd-sample.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#ffffff"/><text x="60" y="90" font-size="44" font-family="Arial" fill="#111827">AI 数据运营实习生</text><text x="60" y="160" font-size="28" font-family="Arial" fill="#374151">星火科技 · 成都</text><text x="60" y="250" font-size="30" font-family="Arial" fill="#111827">岗位职责</text><text x="60" y="310" font-size="24" font-family="Arial" fill="#4b5563">负责数据标注流程优化，推进实验复盘。</text><text x="60" y="370" font-size="24" font-family="Arial" fill="#4b5563">与产品、研发跨团队协作。</text><text x="60" y="460" font-size="30" font-family="Arial" fill="#111827">岗位要求</text><text x="60" y="520" font-size="24" font-family="Arial" fill="#4b5563">本科及以上在读，每周到岗 4 天。</text><text x="60" y="580" font-size="24" font-family="Arial" fill="#4b5563">具备数据分析、流程优化能力。</text></svg>`
);

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const svgPage = await browser.newPage({ viewport: { width: 900, height: 1200 } });
await svgPage.setContent(await readFile(`${outputDirectory}/jd-sample.svg`, "utf8"));
await svgPage.screenshot({ path: `${outputDirectory}/jd-sample.png` });
await svgPage.close();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("local-browser-test-2026");
await page.getByRole("button", { name: "进入看板" }).click();
await page.getByRole("heading", { name: "概览" }).waitFor();
await page.getByRole("link", { name: "识别岗位" }).first().click();
await page.getByRole("heading", { name: "识别岗位" }).waitFor();
await page.locator("input[type=file]").setInputFiles(`${outputDirectory}/jd-sample.png`);
await page.getByRole("button", { name: "上传并识别" }).click();
await page.getByRole("heading", { name: "识别任务" }).waitFor();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${outputDirectory}/desktop-upload-status.png`, fullPage: true });
console.log(`BODY=${(await page.locator("body").innerText()).slice(0, 1200)}`);
await browser.close();
