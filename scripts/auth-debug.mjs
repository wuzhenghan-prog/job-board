import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
});
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
page.on("response", async (response) => {
  if (response.url().includes("/api/")) {
    console.log(`RESPONSE ${response.status()} ${response.url()}`);
    console.log(`SET_COOKIE ${response.headers()["set-cookie"] ?? "none"}`);
  }
});
page.on("console", (message) => console.log(`CONSOLE ${message.type()} ${message.text()}`));
page.on("pageerror", (error) => console.log(`PAGEERROR ${error.message}`));
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.getByLabel("访问码").fill("local-browser-test-2026");
await page.getByRole("button", { name: "进入看板" }).click();
await page.waitForTimeout(1000);
console.log(`COOKIES ${JSON.stringify(await context.cookies())}`);
console.log(`URL ${page.url()}`);
console.log(`BODY ${(await page.locator("body").innerText()).slice(0, 300)}`);
await browser.close();
