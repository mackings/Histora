const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const storySlug = process.env.HISTORA_TEST_STORY_SLUG || "playwright-studio-library-flow-1774110545632";
const email = studioUser.email;
const password = studioUser.password;
const deviceIdentity = studioUser.deviceIdentity;

async function signIn(page) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((identity) => {
    window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
  }, deviceIdentity);
  await page.reload({ waitUntil: "networkidle" });

  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  await signIn(page);
  await page.evaluate((slug) => {
    window.history.pushState({}, "", `/feed/story/${slug}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, storySlug);
  await page.waitForURL(/\/feed\/story\//, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const snapshot = await page.evaluate(() => ({
    labels: Array.from(document.querySelectorAll(".section-label")).map((node) => node.textContent?.trim()).filter(Boolean),
    headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((node) => node.textContent?.trim()).filter(Boolean),
    linkIconCount: document.querySelectorAll(".feed-reader-link-grid .story-link-chip-icon").length,
    linkCount: document.querySelectorAll(".feed-reader-link-grid .story-link-chip").length,
    bodyPreview: document.body.textContent?.slice(0, 2000) ?? null
  }));

  console.log(JSON.stringify(snapshot, null, 2));
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
