const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";

async function signIn(page) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.localStorage.setItem(
      "histora-device-identity-v1",
      JSON.stringify({
        deviceId: "test-device-000000000001",
        deviceName: "Playwright Test Device"
      })
    );
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("studioe2e@gmail.com");
  await page.locator('input[type="password"]').first().fill("TestPassword123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const apiEvents = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }

    apiEvents.push({
      method: response.request().method(),
      url,
      status: response.status(),
      at: Date.now()
    });
  });

  await signIn(page);

  const card = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  const initialFeedCalls = apiEvents.filter((event) => event.url.includes("/stories/feed")).length;
  const initialStatusesCalls = apiEvents.filter((event) => event.url.endsWith("/statuses")).length;
  const initialMineCalls = apiEvents.filter((event) => event.url.includes("/statuses/mine")).length;

  await page.locator('.rail-nav a[href="/profile"]').first().click();
  await page.waitForURL(/\/profile$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");

  const beforeReturnEventCount = apiEvents.length;
  const returnStartedAt = Date.now();
  await page.getByRole("link", { name: /back to feed/i }).click();
  await page.waitForURL(/\/feed$/, { timeout: 20000 });
  await card.waitFor({ state: "visible", timeout: 10000 });
  const returnCardVisibleMs = Date.now() - returnStartedAt;

  await page.waitForLoadState("networkidle");

  const returnEvents = apiEvents.slice(beforeReturnEventCount);
  const returnFeedCalls = returnEvents.filter((event) => event.url.includes("/stories/feed"));
  const returnStatusesCalls = returnEvents.filter((event) => event.url.endsWith("/statuses"));
  const returnMineCalls = returnEvents.filter((event) => event.url.includes("/statuses/mine"));

  console.log(
    JSON.stringify(
      {
        initialFeedCalls,
        initialStatusesCalls,
        initialMineCalls,
        returnCardVisibleMs,
        returnFeedCalls,
        returnStatusesCalls,
        returnMineCalls
      },
      null,
      2
    )
  );

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
