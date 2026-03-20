const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox"
    ]
  });
  const context = await browser.newContext({
    permissions: ["microphone"]
  });
  const page = await context.newPage();
  const apiEvents = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }

    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "<unreadable>";
    }

    apiEvents.push({
      method: response.request().method(),
      url,
      status: response.status(),
      body: body.slice(0, 400)
    });
  });

  await page.goto("http://localhost:3000/signin", { waitUntil: "networkidle" });
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
  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill("Playwright preview probe test");
  await storySetup
    .locator("textarea")
    .first()
    .fill(
      "This is a preview probe summary with enough words so the preview path should serialize the story payload into session storage for the preview page to consume."
    );
  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(
    "This preview probe body exists to verify whether the preview payload is actually written into session storage before navigating to the preview route."
  );

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await page.waitForTimeout(2500);

  const snapshot = await page.evaluate(() => ({
    path: window.location.pathname,
    heading: document.querySelector(".studio-preview-reader h1")?.textContent ?? null,
    summary: document.querySelector(".preview-summary")?.textContent ?? null,
    previewStorage: window.sessionStorage.getItem("histora-studio-preview"),
    publishStorage: window.sessionStorage.getItem("histora-studio-publish-payload")
  }));

  console.log(JSON.stringify({ snapshot, recentApiEvents: apiEvents.slice(-12) }, null, 2));
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
