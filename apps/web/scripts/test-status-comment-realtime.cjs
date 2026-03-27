const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStorySlug = "feed-author-public-story";
const targetStoryTitle = "Feed author public story";

async function signIn(page) {
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
}

async function waitForReplyCountChange(page, previousValue, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const text = await page.locator(".chapter-thread-footer h3").innerText().catch(() => "");
    const match = text.match(/\d+/);
    const value = match ? Number(match[0]) : previousValue;
    if (value !== previousValue) {
      return { value, latencyMs: Date.now() - start, text };
    }
    await page.waitForTimeout(100);
  }

  return { value: previousValue, latencyMs: null, text: null };
}

async function waitForStatusBubbleCount(page, previousValue, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const count = await page.locator(".status-scroll .status-bubble").count();
    if (count > previousValue) {
      return { visible: true, latencyMs: Date.now() - start, count };
    }
    await page.waitForTimeout(100);
  }

  return { visible: false, latencyMs: null, count: previousValue };
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const context = await browser.newContext();
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  await signIn(pageA);
  await signIn(pageB);

  const openStoryFromFeed = async (page) => {
    await page.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
    const targetCard = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
    await targetCard.waitFor({ state: "visible", timeout: 15000 });
    await targetCard.locator(".feed-card-actions button").nth(1).click();
    await page.waitForURL(new RegExp(`/feed/story/${targetStorySlug}$`), { timeout: 20000 });
  };

  await openStoryFromFeed(pageA);
  await pageA.locator(".story-reader-stage h1").waitFor({ state: "visible", timeout: 10000 });
  const replyCountTextBefore = await pageA.locator(".chapter-thread-footer h3").innerText();
  const replyCountBefore = Number((replyCountTextBefore.match(/\d+/) || ["0"])[0]);

  await openStoryFromFeed(pageB);
  await pageB.locator(".story-reader-stage h1").waitFor({ state: "visible", timeout: 10000 });
  const commentText = `Realtime comment ${Date.now()}`;
  await pageB.locator(".feed-thread-reply textarea").fill(commentText);
  await pageB.locator(".feed-thread-reply button").click();

  const replyCountAfter = await waitForReplyCountChange(pageA, replyCountBefore);
  const matchingComments = await pageA.locator(".feed-thread-list .feed-thread-item").filter({ hasText: commentText }).count();

  await pageA.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  const statusBubbleCountBefore = await pageA.locator(".status-scroll .status-bubble").count();

  await pageB.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  const statusMarker = `Realtime status ${Date.now()}`;
  await pageB.locator(".status-scroll .status-bubble").first().click();
  await pageB.locator(".status-compose-input").fill(statusMarker);
  await pageB.getByRole("button", { name: /^Post status$/i }).click();

  const statusAppeared = await waitForStatusBubbleCount(pageA, statusBubbleCountBefore);

  console.log(
    JSON.stringify(
      {
        replyCountBefore,
        replyCountAfter,
        matchingComments,
        statusBubbleCountBefore,
        statusAppeared
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
