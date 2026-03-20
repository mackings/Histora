const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";
const targetStorySlug = "feed-author-public-story";

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
      body: body.slice(0, 500)
    });
  });

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

  const targetCard = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await targetCard.waitFor({ state: "visible", timeout: 15000 });

  const feedButtons = targetCard.locator(".feed-card-actions button");
  const feedLikeButton = feedButtons.nth(0);
  const feedCommentButton = feedButtons.nth(1);
  const feedBookmarkButton = feedButtons.nth(2);

  await feedLikeButton.click();
  await page.waitForTimeout(1000);
  const feedLikeActive = await feedLikeButton.evaluate((node) => node.className.includes("active-feed-action-pill"));

  await feedBookmarkButton.click();
  await page.waitForTimeout(1000);
  const feedBookmarkActive = await feedBookmarkButton.evaluate((node) => node.className.includes("active-feed-action-pill"));

  await feedCommentButton.click();
  await page.waitForURL(new RegExp(`/feed/story/${targetStorySlug}$`), { timeout: 20000 });
  await page.waitForLoadState("networkidle");

  const storyTitle = await page.locator(".story-reader-stage h1").innerText().catch(() => null);
  const topFollowButton = page.getByRole("button", { name: /^FOLLOW$|^UNFOLLOW$/i }).first();
  const initialFollowText = await topFollowButton.innerText();

  await topFollowButton.click();
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some((button) => button.textContent?.trim() === "UNFOLLOW");
    },
    undefined,
    { timeout: 10000 }
  );
  const afterFollowText = await topFollowButton.innerText();

  await topFollowButton.click();
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some((button) => button.textContent?.trim() === "FOLLOW");
    },
    undefined,
    { timeout: 10000 }
  );
  const afterUnfollowText = await topFollowButton.innerText();

  const commentText = `Playwright feed comment ${Date.now()}`;
  const replyBox = page.locator(".feed-thread-reply textarea").first();
  await replyBox.fill(commentText);
  const postReplyButton = page.locator(".feed-thread-reply button").first();
  const replyBoxValue = await replyBox.inputValue();
  await postReplyButton.click();
  await page.waitForTimeout(1500);

  const commentEvents = apiEvents.filter((event) => event.url.includes("/api/comments"));
  const commentVisible = await page.locator(".feed-thread-list").innerText().catch(() => "");

  console.log(
    JSON.stringify(
      {
        feedLikeActive,
        feedBookmarkActive,
        storyTitle,
        initialFollowText,
        afterFollowText,
        afterUnfollowText,
        replyBoxValue,
        commentFound: commentVisible.includes(commentText),
        commentEvents,
        recentApiEvents: apiEvents.filter((event) => {
          return (
            event.url.includes("/stories/") ||
            event.url.includes("/comments") ||
            event.url.includes("/profile/follows/")
          );
        }).slice(-12)
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
