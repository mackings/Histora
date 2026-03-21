const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const usernameLabel = "@studioe2e";

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

async function getUserStatusBubble(page) {
  return page.locator(".status-scroll .status-bubble").filter({ hasText: usernameLabel }).first();
}

async function getUserStatusBubbleCount(page) {
  return page.locator(".status-scroll .status-bubble").filter({ hasText: usernameLabel }).count();
}

async function getUserStatusBadgeValue(page) {
  const bubbleCount = await getUserStatusBubbleCount(page);
  if (!bubbleCount) {
    return 0;
  }
  const bubble = await getUserStatusBubble(page);
  const badge = bubble.locator(".status-bubble-count");
  const badgeCount = await badge.count();
  if (!badgeCount) {
    return 1;
  }
  const text = (await badge.first().innerText().catch(() => "")) || "";
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function waitForSingleBubbleWithCount(page, minimumCount, timeout = 7000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const bubbleCount = await getUserStatusBubbleCount(page);
    const badgeValue = await getUserStatusBadgeValue(page);
    if (bubbleCount === 1 && badgeValue >= minimumCount) {
      return { bubbleCount, badgeValue, latencyMs: Date.now() - startedAt };
    }
    await page.waitForTimeout(150);
  }

  return {
    bubbleCount: await getUserStatusBubbleCount(page),
    badgeValue: await getUserStatusBadgeValue(page),
    latencyMs: null
  };
}

async function postStatus(page, text) {
  const addBubble = page.locator(".status-scroll .status-bubble").first();
  await addBubble.waitFor({ state: "visible", timeout: 20000 });
  await addBubble.click();
  await page.locator(".status-compose-input").fill(text);
  await page.getByRole("button", { name: /^Post status$/i }).click();
  await page.waitForTimeout(800);
  const closeButton = page.locator(".story-viewer-close-row button").first();
  if (await closeButton.count()) {
    await closeButton.click().catch(() => undefined);
    await page.waitForTimeout(300);
  }
}

async function run() {
  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  await signIn(pageA);
  await signIn(pageB);

  await pageA.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  await pageB.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  await pageA.locator(".status-scroll .status-bubble").first().waitFor({ state: "visible", timeout: 20000 });
  await pageB.locator(".status-scroll .status-bubble").first().waitFor({ state: "visible", timeout: 20000 });
  await pageA.waitForTimeout(1200);
  await pageB.waitForTimeout(1200);

  const baselineBubbleCountA = await getUserStatusBubbleCount(pageA);
  const baselineBadgeValueA = await getUserStatusBadgeValue(pageA);
  const baselineBubbleCountB = await getUserStatusBubbleCount(pageB);
  const baselineBadgeValueB = await getUserStatusBadgeValue(pageB);

  const statusOne = `Realtime grouped status one ${Date.now()}`;
  await postStatus(pageA, statusOne);

  const pageAResult = await waitForSingleBubbleWithCount(pageA, baselineBadgeValueA + 1);
  const pageBResult = await waitForSingleBubbleWithCount(pageB, baselineBadgeValueB + 1);

  console.log(
    JSON.stringify(
      {
        baselineBubbleCountA,
        baselineBadgeValueA,
        baselineBubbleCountB,
        baselineBadgeValueB,
        pageAResult,
        pageBResult
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
