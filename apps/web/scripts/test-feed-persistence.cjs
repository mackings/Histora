const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";
const targetStorySlug = "feed-author-public-story";

async function getFeedCard(page) {
  const card = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  return card;
}

async function getFeedMetric(button) {
  const text = (await button.innerText().catch(() => "")) || "";
  const match = text.match(/\d+/);
  return {
    text,
    value: match ? Number(match[0]) : 0,
    active: await button.evaluate((node) => node.className.includes("active-feed-action-pill"))
  };
}

async function waitForMetricValue(button, expectedValue, expectedActive, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current = await getFeedMetric(button);
    if (current.value === expectedValue && current.active === expectedActive) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return getFeedMetric(button);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"]
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

  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((identity) => {
    window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
  }, studioUser.deviceIdentity);
  await page.reload({ waitUntil: "networkidle" });

  await page.getByLabel("Email").fill(studioUser.email);
  await page.locator('input[type="password"]').first().fill(studioUser.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");

  const targetCard = await getFeedCard(page);
  const feedButtons = targetCard.locator(".feed-card-actions button");
  const likeButton = feedButtons.nth(0);
  const commentButton = feedButtons.nth(1);
  const bookmarkButton = feedButtons.nth(2);
  const shareButton = feedButtons.nth(3);

  const initialLike = await getFeedMetric(likeButton);
  if (initialLike.active) {
    await likeButton.click();
    await waitForMetricValue(likeButton, Math.max(0, initialLike.value - 1), false);
  }

  const initialBookmark = await getFeedMetric(bookmarkButton);
  if (initialBookmark.active) {
    await bookmarkButton.click();
    await waitForMetricValue(bookmarkButton, Math.max(0, initialBookmark.value - 1), false);
  }

  const likeBefore = await getFeedMetric(likeButton);
  await likeButton.click();
  const likeAfterTap = await waitForMetricValue(likeButton, likeBefore.value + 1, true);
  await page.reload({ waitUntil: "networkidle" });
  const likeAfterRefresh = await getFeedMetric((await getFeedCard(page)).locator(".feed-card-actions button").nth(0));

  const refreshedButtons = (await getFeedCard(page)).locator(".feed-card-actions button");
  const likeButtonAfterRefresh = refreshedButtons.nth(0);
  const bookmarkButtonAfterRefresh = refreshedButtons.nth(2);
  const shareButtonAfterRefresh = refreshedButtons.nth(3);

  await likeButtonAfterRefresh.click();
  const unlikeAfterTap = await waitForMetricValue(likeButtonAfterRefresh, likeBefore.value, false);
  await page.reload({ waitUntil: "networkidle" });
  const likeAfterUnlikeRefresh = await getFeedMetric((await getFeedCard(page)).locator(".feed-card-actions button").nth(0));

  const bookmarkBefore = await getFeedMetric(bookmarkButtonAfterRefresh);
  await bookmarkButtonAfterRefresh.click();
  const bookmarkAfterTap = await waitForMetricValue(bookmarkButtonAfterRefresh, bookmarkBefore.value + 1, true);
  await page.reload({ waitUntil: "networkidle" });
  const bookmarkAfterRefresh = await getFeedMetric((await getFeedCard(page)).locator(".feed-card-actions button").nth(2));

  const shareBefore = await getFeedMetric(shareButtonAfterRefresh);
  await shareButtonAfterRefresh.click();
  await page.getByRole("button", { name: /copy link/i }).click();
  const shareAfterTap = await waitForMetricValue((await getFeedCard(page)).locator(".feed-card-actions button").nth(3), shareBefore.value + 1, false);
  await page.reload({ waitUntil: "networkidle" });
  const shareAfterRefresh = await getFeedMetric((await getFeedCard(page)).locator(".feed-card-actions button").nth(3));

  await ((await getFeedCard(page)).locator(".feed-card-actions button").nth(1)).click();
  await page.waitForURL(new RegExp(`/feed/story/${targetStorySlug}$`), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  const storyButtons = page.locator(".story-reader-stage-actions button");
  const readerLikeText = await storyButtons.nth(0).innerText().catch(() => "");
  const readerBookmarkText = await storyButtons.nth(1).innerText().catch(() => "");
  const readerShareText = await storyButtons.nth(2).innerText().catch(() => "");

  console.log(
    JSON.stringify(
      {
        likeBefore,
        likeAfterTap,
        likeAfterRefresh,
        unlikeAfterTap,
        likeAfterUnlikeRefresh,
        bookmarkBefore,
        bookmarkAfterTap,
        bookmarkAfterRefresh,
        shareBefore,
        shareAfterTap,
        shareAfterRefresh,
        readerLikeText,
        readerBookmarkText,
        readerShareText,
        recentApiEvents: apiEvents.filter((event) =>
          event.url.includes("/stories/feed") ||
          event.url.includes(`/stories/public/${targetStorySlug}`) ||
          event.url.includes("/reactions") ||
          event.url.includes("/share")
        )
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
