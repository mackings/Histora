const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const imageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRkQAAAABJRU5ErkJggg==",
  "base64"
);

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

function getMyStatusBubble(page) {
  return page.locator(".my-status-bubble-shell .my-status-bubble").first();
}

async function getMyStatusBadgeValue(page) {
  const bubble = getMyStatusBubble(page);
  const badge = bubble.locator(".status-bubble-count");
  if (!(await badge.count())) {
    return (await bubble.count()) ? 1 : 0;
  }

  const text = (await badge.first().innerText().catch(() => "")) || "";
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

async function getDuplicatedOwnBubbleCount(page) {
  return page
    .locator(".status-scroll > .status-bubble")
    .filter({ hasText: "@studioe2e" })
    .count();
}

async function waitForMyStatusCount(page, expectedMinimum, timeout = 9000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const badgeValue = await getMyStatusBadgeValue(page);
    const duplicateOwnBubbles = await getDuplicatedOwnBubbleCount(page);
    if (badgeValue >= expectedMinimum && duplicateOwnBubbles === 0) {
      return { badgeValue, duplicateOwnBubbles, latencyMs: Date.now() - startedAt };
    }
    await page.waitForTimeout(150);
  }

  return {
    badgeValue: await getMyStatusBadgeValue(page),
    duplicateOwnBubbles: await getDuplicatedOwnBubbleCount(page),
    latencyMs: null
  };
}

async function postStatusWithImage(page, text) {
  await getMyStatusBubble(page).waitFor({ state: "visible", timeout: 20000 });
  await page.locator(".my-status-bubble-shell .status-bubble-add-button").click();
  await page.locator(".status-compose-input").fill(text);
  await page.locator('input[type="file"]').setInputFiles({
    name: "status-photo.png",
    mimeType: "image/png",
    buffer: imageBuffer
  });
  await page.locator(".status-photo-preview").waitFor({ state: "visible", timeout: 10000 });
  await page.getByText("Attached to this status").waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("button", { name: /^Post status$/i }).click();
  await page.locator(".status-stage-image").waitFor({ state: "visible", timeout: 20000 });
}

async function openMyStatusAndRead(page) {
  await getMyStatusBubble(page).click();
  await page.locator(".status-stage-image").waitFor({ state: "visible", timeout: 15000 });
  return {
    authorLabel: (await page.locator(".story-viewer-author strong").first().innerText()).trim(),
    imageVisible: await page.locator(".status-stage-image").first().isVisible(),
    stageTag: (await page.locator(".story-stage-card .story-tag").first().innerText()).trim()
  };
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
  await getMyStatusBubble(pageA).waitFor({ state: "visible", timeout: 20000 });
  await getMyStatusBubble(pageB).waitFor({ state: "visible", timeout: 20000 });

  const baselineBadgeValueA = await getMyStatusBadgeValue(pageA);
  const baselineBadgeValueB = await getMyStatusBadgeValue(pageB);
  const baselineDuplicatesA = await getDuplicatedOwnBubbleCount(pageA);
  const baselineDuplicatesB = await getDuplicatedOwnBubbleCount(pageB);

  const statusText = `WhatsApp style status image regression ${Date.now()}`;
  await postStatusWithImage(pageA, statusText);

  const pageAResult = await waitForMyStatusCount(pageA, baselineBadgeValueA + 1);
  const pageBResult = await waitForMyStatusCount(pageB, baselineBadgeValueB + 1);
  const pageBViewer = await openMyStatusAndRead(pageB);

  console.log(
    JSON.stringify(
      {
        baselineBadgeValueA,
        baselineBadgeValueB,
        baselineDuplicatesA,
        baselineDuplicatesB,
        pageAResult,
        pageBResult,
        pageBViewer
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
