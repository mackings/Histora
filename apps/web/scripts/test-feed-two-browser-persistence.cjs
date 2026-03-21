const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";

async function signIn(page, deviceId) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((value) => {
    window.localStorage.setItem(
      "histora-device-identity-v1",
      JSON.stringify({
        deviceId: value,
        deviceName: `Playwright ${value}`
      })
    );
  }, deviceId);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("studioe2e@gmail.com");
  await page.locator('input[type="password"]').first().fill("TestPassword123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function getTargetCard(page) {
  const card = page.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  return card;
}

async function readMetric(button) {
  const text = (await button.innerText().catch(() => "")) || "";
  const match = text.match(/\d+/);
  return {
    text,
    value: match ? Number(match[0]) : 0,
    active: await button.evaluate((node) => node.className.includes("active-feed-action-pill"))
  };
}

async function waitForValue(button, expectedValue, expectedActive, timeout = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const metric = await readMetric(button);
    if (metric.value === expectedValue && metric.active === expectedActive) {
      return metric;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return readMetric(button);
}

async function run() {
  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const contextA = await browserA.newContext();
  const contextB = await browserB.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signIn(pageA, "test-device-000000000001");
  await signIn(pageB, "test-device-000000000001");

  const cardA = await getTargetCard(pageA);
  const cardB = await getTargetCard(pageB);
  const likeA = cardA.locator(".feed-card-actions button").nth(0);
  const likeB = cardB.locator(".feed-card-actions button").nth(0);
  const bookmarkA = cardA.locator(".feed-card-actions button").nth(2);
  const bookmarkB = cardB.locator(".feed-card-actions button").nth(2);

  const initialLikeA = await readMetric(likeA);
  const initialLikeB = await readMetric(likeB);
  const initialBookmarkA = await readMetric(bookmarkA);
  const initialBookmarkB = await readMetric(bookmarkB);

  if (initialLikeA.active) {
    await likeA.click();
    await waitForValue(likeA, Math.max(0, initialLikeA.value - 1), false);
    await waitForValue(likeB, Math.max(0, initialLikeB.value - 1), false);
  }

  if (initialBookmarkA.active) {
    await bookmarkA.click();
    await waitForValue(bookmarkA, Math.max(0, initialBookmarkA.value - 1), false);
    await waitForValue(bookmarkB, Math.max(0, initialBookmarkB.value - 1), false);
  }

  const cleanLikeA = await readMetric(likeA);
  const cleanLikeB = await readMetric(likeB);
  await likeA.click();
  const likeSyncA = await waitForValue(likeA, cleanLikeA.value + 1, true);
  const likeSyncB = await waitForValue(likeB, cleanLikeB.value + 1, true);

  const cleanBookmarkA = await readMetric(bookmarkA);
  const cleanBookmarkB = await readMetric(bookmarkB);
  await bookmarkA.click();
  const bookmarkSyncA = await waitForValue(bookmarkA, cleanBookmarkA.value + 1, true);
  const bookmarkSyncB = await waitForValue(bookmarkB, cleanBookmarkB.value + 1, true);

  console.log(
    JSON.stringify(
      {
        likeSyncA,
        likeSyncB,
        bookmarkSyncA,
        bookmarkSyncB
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
