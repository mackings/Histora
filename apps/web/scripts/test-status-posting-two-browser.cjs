const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const usernameLabel = "@studioe2e";
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

async function waitForFeedReady(page) {
  const card = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(1500);
}

async function getUserBubbleSnapshot(page) {
  const bubbles = page.locator(".status-scroll .status-bubble");
  const userBubble = bubbles.filter({ hasText: usernameLabel }).first();
  const visible = (await userBubble.count()) > 0;

  if (!visible) {
    return { visible: false, badgeValue: 0, totalBubbles: await bubbles.count() };
  }

  const badge = userBubble.locator(".status-bubble-count").first();
  const badgeCount = await badge.count();
  const badgeText = badgeCount ? ((await badge.innerText().catch(() => "")) || "") : "";

  return {
    visible: true,
    badgeValue: badgeText ? Number(badgeText) || 1 : 1,
    totalBubbles: await bubbles.count()
  };
}

async function waitForUserBubbleIncrement(page, previousBadgeValue, timeout = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const snapshot = await getUserBubbleSnapshot(page);
    if (snapshot.visible && snapshot.badgeValue >= previousBadgeValue + 1) {
      return { ...snapshot, latencyMs: Date.now() - startedAt };
    }
    await page.waitForTimeout(150);
  }

  return { ...(await getUserBubbleSnapshot(page)), latencyMs: null };
}

async function postStatus(page, text) {
  const addBubble = page.locator(".status-scroll .status-bubble").filter({ hasText: "Add" }).first();
  await addBubble.waitFor({ state: "visible", timeout: 20000 });
  await addBubble.click();
  await page.locator(".status-compose-input").fill(text);
  await page.getByRole("button", { name: /^Post status$/i }).click();
  const closeButton = page.locator(".story-viewer-close-row button").first();
  if (await closeButton.count()) {
    await closeButton.click().catch(() => undefined);
  }
}

async function run() {
  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  await signIn(pageA);
  await signIn(pageB);
  await waitForFeedReady(pageA);
  await waitForFeedReady(pageB);

  const beforeA = await getUserBubbleSnapshot(pageA);
  const beforeB = await getUserBubbleSnapshot(pageB);

  await postStatus(pageA, `Two-browser status post ${Date.now()}`);

  const afterA = await waitForUserBubbleIncrement(pageA, beforeA.badgeValue);
  const afterB = await waitForUserBubbleIncrement(pageB, beforeB.badgeValue);

  console.log(
    JSON.stringify(
      {
        beforeA,
        beforeB,
        afterA,
        afterB
      },
      null,
      2
    )
  );

  await browserA.close();
  await browserB.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
