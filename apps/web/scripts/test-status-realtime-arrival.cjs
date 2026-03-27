const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const usernameLabel = "@studioe2e";

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

async function getStatusSnapshot(page) {
  const bubbles = page.locator(".status-scroll .status-bubble");
  const bubbleCount = await bubbles.count();
  const targetBubble = bubbles.filter({ hasText: usernameLabel }).first();
  const targetCount = await targetBubble.count();

  if (!targetCount) {
    return {
      totalBubbles: bubbleCount,
      userBubbleVisible: false,
      badgeValue: 0
    };
  }

  const badge = targetBubble.locator(".status-bubble-count").first();
  const badgeText = (await badge.innerText().catch(() => "")) || "";
  const badgeValue = badgeText ? Number(badgeText) || 1 : 1;

  return {
    totalBubbles: bubbleCount,
    userBubbleVisible: true,
    badgeValue
  };
}

async function waitForStatusIncrement(page, previousBadgeValue, timeout = 7000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const snapshot = await getStatusSnapshot(page);
    if (snapshot.userBubbleVisible && snapshot.badgeValue >= previousBadgeValue + 1) {
      return {
        ...snapshot,
        latencyMs: Date.now() - startedAt
      };
    }
    await page.waitForTimeout(150);
  }

  return {
    ...(await getStatusSnapshot(page)),
    latencyMs: null
  };
}

async function postStatus(page, text) {
  const addBubble = page.locator(".status-scroll .status-bubble").first();
  await addBubble.waitFor({ state: "visible", timeout: 20000 });
  await addBubble.click();
  await page.locator(".status-compose-input").fill(text);
  await page.getByRole("button", { name: /^Post status$/i }).click();
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
  await pageA.locator(".status-scroll .status-bubble").first().waitFor({ state: "visible", timeout: 20000 });

  await pageB.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  await pageB.locator(".status-scroll .status-bubble").first().waitFor({ state: "visible", timeout: 20000 });
  await pageA.waitForTimeout(1200);
  await pageB.waitForTimeout(1200);

  const beforeA = await getStatusSnapshot(pageA);
  const beforeB = await getStatusSnapshot(pageB);

  const statusText = `Realtime arrival status ${Date.now()}`;
  await postStatus(pageA, statusText);

  const afterA = await waitForStatusIncrement(pageA, beforeA.badgeValue);
  const afterB = await waitForStatusIncrement(pageB, beforeB.badgeValue);

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

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
