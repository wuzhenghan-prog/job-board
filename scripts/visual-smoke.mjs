import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = ".codex-visual";
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
desktop.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
desktop.on("pageerror", (error) => consoleErrors.push(error.message));

await desktop.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await desktop.screenshot({ path: `${outputDirectory}/desktop-current.png`, fullPage: true });
console.log(`TITLE=${await desktop.title()}`);
console.log(`BODY=${(await desktop.locator("body").innerText()).slice(0, 500)}`);
console.log(`ERRORS=${JSON.stringify(consoleErrors)}`);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await mobile.screenshot({ path: `${outputDirectory}/mobile-current.png`, fullPage: true });
console.log(`MOBILE_BUTTONS=${await mobile.locator("button").count()}`);

await browser.close();
