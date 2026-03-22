const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const email = "studioe2e@gmail.com";
const password = "TestPassword123";
const deviceIdentity = {
  deviceId: "test-device-000000000001",
  deviceName: "Playwright Test Device"
};

const bodyText =
  "This anonymous story body is long enough to cross the chapter readiness threshold and confirm the published result opens in the full story reader instead of being treated like a quick status.";

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

  const storyTitle = `Playwright anonymous story ${Date.now()}`;
  const storySummary =
    `This anonymous story summary is unique for ${storyTitle} and intentionally long enough to satisfy studio validation while remaining easy to spot in the feed and anonymous hub.`;

  await signIn(page);
  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /^NEW STORY$/i }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill(storyTitle);
  await storySetup.locator("textarea").first().fill(storySummary);
  await page
    .locator(".toggle-row")
    .filter({ hasText: "Post this chapter anonymously for advice" })
    .locator('input[type="checkbox"]')
    .first()
    .check();

  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(bodyText);

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Publish$/i }).click();
  await page.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  const publishedStoryPath = new URL(page.url()).pathname;

  await page.evaluate(() => {
    window.history.pushState({}, "", "/anonymous");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/anonymous$/, { timeout: 10000 });
  const anonymousStoryCard = page.locator(".anonymous-hub-card").filter({ hasText: storyTitle }).first();
  try {
    await anonymousStoryCard.waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    const anonymousHubProbe = await page.evaluate(() => ({
      postedHeadings: Array.from(document.querySelectorAll(".anonymous-hub-card strong")).map((node) => node.textContent?.trim()).filter(Boolean),
      postedBodies: Array.from(document.querySelectorAll(".anonymous-hub-card p")).map((node) => node.textContent?.trim()).filter(Boolean),
      pagePreview: document.body.textContent?.slice(0, 4000) ?? null
    }));
    console.log(JSON.stringify({ anonymousHubProbe }, null, 2));
    throw error;
  }
  const anonymousStoryLabel = await anonymousStoryCard.locator("strong").first().innerText();
  if (anonymousStoryLabel !== storyTitle) {
    throw new Error(`Anonymous hub did not surface the story title: ${anonymousStoryLabel}`);
  }
  await anonymousStoryCard.getByRole("button", { name: /open story/i }).click();
  await page.waitForURL(new RegExp(`${publishedStoryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 15000 });
  const anonymousFollowButtonCount = await page.getByRole("button", { name: /^follow$/i }).count();
  if (anonymousFollowButtonCount !== 0) {
    throw new Error(`Anonymous story reader still shows a follow button. count=${anonymousFollowButtonCount}`);
  }

  await page.evaluate(() => {
    window.history.pushState({}, "", "/feed");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/feed$/, { timeout: 10000 });
  await page.getByRole("heading", { name: /anonymous posts readers are opening/i }).waitFor({ state: "visible", timeout: 15000 });
  const feedAnonymousStoryCard = page.locator(".anonymous-message-card").filter({ hasText: storyTitle }).first();
  try {
    await feedAnonymousStoryCard.waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    const feedProbe = await page.evaluate(() => ({
      titles: Array.from(document.querySelectorAll(".anonymous-message-card strong")).map((node) => node.textContent?.trim()).filter(Boolean),
      previews: Array.from(document.querySelectorAll(".anonymous-message-card p")).map((node) => node.textContent?.trim()).filter(Boolean),
      pagePreview: document.body.textContent?.slice(0, 4000) ?? null
    }));
    console.log(JSON.stringify({ feedProbe }, null, 2));
    throw error;
  }
  const feedAnonymousStoryLabel = await feedAnonymousStoryCard.locator("strong").innerText();
  if (feedAnonymousStoryLabel !== storyTitle) {
    throw new Error(`Feed anonymous strip did not surface the story title: ${feedAnonymousStoryLabel}`);
  }
  await feedAnonymousStoryCard.click();
  await page.waitForURL(new RegExp(`${publishedStoryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 15000 });

  console.log(
    JSON.stringify(
      {
        storyTitle,
        publishedStoryPath,
        anonymousStoryLabel,
        feedAnonymousStoryLabel,
        anonymousFollowProbe: "hidden"
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
