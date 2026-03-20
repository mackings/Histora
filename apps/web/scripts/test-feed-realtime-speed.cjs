const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";
const targetStorySlug = "feed-author-public-story";

async function readFeedMetric(card, index) {
  const text = (await card.locator(".feed-card-actions button").nth(index).innerText().catch(() => "")) || "";
  const match = text.match(/\d+/);
  return {
    text,
    value: match ? Number(match[0]) : 0
  };
}

async function waitForFeedMetricChange(card, index, previousValue, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current = await readFeedMetric(card, index);
    if (current.value !== previousValue) {
      return {
        latencyMs: Date.now() - start,
        value: current.value,
        text: current.text
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    latencyMs: null,
    value: previousValue,
    text: null
  };
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await pageA.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await pageA.evaluate(() => {
    window.localStorage.setItem(
      "histora-device-identity-v1",
      JSON.stringify({
        deviceId: "test-device-000000000001",
        deviceName: "Playwright Test Device"
      })
    );
  });
  await pageA.reload({ waitUntil: "networkidle" });
  await pageA.getByLabel("Email").fill("studioe2e@gmail.com");
  await pageA.locator('input[type="password"]').first().fill("TestPassword123");
  await pageA.getByRole("button", { name: /sign in/i }).click();
  await pageA.waitForURL(/\/feed|\/$/, { timeout: 20000 });
  await pageA.waitForLoadState("networkidle");

  const feedNavStart = Date.now();
  await pageB.goto(`${baseUrl}/feed`, { waitUntil: "domcontentloaded" });
  const pageBTargetCard = pageB.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await pageBTargetCard.waitFor({ state: "visible", timeout: 15000 });
  const feedVisibleLatencyMs = Date.now() - feedNavStart;

  const pageATargetCard = pageA.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await pageATargetCard.waitFor({ state: "visible", timeout: 15000 });

  const likeBeforeB = await readFeedMetric(pageBTargetCard, 0);
  const bookmarkBeforeB = await readFeedMetric(pageBTargetCard, 2);

  const pageALikeButton = pageATargetCard.locator(".feed-card-actions button").nth(0);
  const pageABookmarkButton = pageATargetCard.locator(".feed-card-actions button").nth(2);
  const pageBCommentButton = pageBTargetCard.locator(".feed-card-actions button").nth(1);

  await pageALikeButton.click();
  const likeSyncResult = await waitForFeedMetricChange(pageBTargetCard, 0, likeBeforeB.value);

  await pageABookmarkButton.click();
  const bookmarkSyncResult = await waitForFeedMetricChange(pageBTargetCard, 2, bookmarkBeforeB.value);

  const openStart = Date.now();
  await pageBCommentButton.click();
  await pageB.waitForURL(new RegExp(`/feed/story/${targetStorySlug}$`), { timeout: 20000 });
  await pageB.locator(".story-reader-stage h1").waitFor({ state: "visible", timeout: 10000 });
  const storyOpenLatencyMs = Date.now() - openStart;
  const loadingFlashVisible = await pageB.locator("text=Loading story...").count();

  const storyLikeText = await pageB.locator(".story-reader-stage-actions button").nth(0).innerText().catch(() => "");
  const storyBookmarkText = await pageB.locator(".story-reader-stage-actions button").nth(1).innerText().catch(() => "");

  console.log(
    JSON.stringify(
      {
        feedVisibleLatencyMs,
        likeSyncResult,
        bookmarkSyncResult,
        storyOpenLatencyMs,
        loadingFlashVisible,
        storyLikeText,
        storyBookmarkText
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
