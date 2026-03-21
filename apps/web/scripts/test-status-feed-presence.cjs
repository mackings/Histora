const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";

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
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const apiEvents = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }
    apiEvents.push({
      method: response.request().method(),
      url,
      status: response.status()
    });
  });

  await signIn(page);
  const postVisible = await page.locator("article.post-card").first().isVisible().catch(() => false);
  const statusSectionCount = await page.locator('section[aria-label="Status updates"]').count();
  const bubbleCount = await page.locator(".status-scroll .status-bubble").count();
  const feedHtml = await page.locator("main.page-shell").innerText().catch(() => "");

  console.log(
    JSON.stringify(
      {
        url: page.url(),
        postVisible,
        statusSectionCount,
        bubbleCount,
        feedSnippet: feedHtml.slice(0, 800),
        recentApiEvents: apiEvents.slice(-12)
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
