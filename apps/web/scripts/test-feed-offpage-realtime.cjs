const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const targetStoryTitle = "Feed author public story";

async function signIn(page, deviceId) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((identity) => {
    window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
  }, {
    deviceId,
    deviceName: "Playwright Test Device"
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByLabel("Email").fill("studioe2e@gmail.com");
  await page.locator('input[type="password"]').first().fill("TestPassword123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

async function getMetric(card, index) {
  const text = (await card.locator(".feed-card-actions button").nth(index).innerText().catch(() => "")) || "";
  const match = text.match(/\d+/);
  return {
    text,
    value: match ? Number(match[0]) : 0,
    active: await card
      .locator(".feed-card-actions button")
      .nth(index)
      .evaluate((node) => node.className.includes("active-feed-action-pill"))
  };
}

async function waitForMetric(card, index, expectedValue, expectedActive, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current = await getMetric(card, index);
    if (current.value === expectedValue && current.active === expectedActive) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return getMetric(card, index);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const pageAApiEvents = [];
  const pageAWebsocketMessages = [];

  pageA.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }
    pageAApiEvents.push({
      method: response.request().method(),
      url,
      status: response.status(),
      at: Date.now()
    });
  });

  pageA.on("websocket", (websocket) => {
    websocket.on("framereceived", (event) => {
      pageAWebsocketMessages.push({
        url: websocket.url(),
        payload: String(event.payload).slice(0, 400)
      });
    });
  });

  await signIn(pageA, "test-device-000000000001");
  await signIn(pageB, "test-device-000000000001");

  const cardA = pageA.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  const cardB = pageB.locator("article.post-card").filter({ hasText: targetStoryTitle }).first();
  await cardA.waitFor({ state: "visible", timeout: 20000 });
  await cardB.waitFor({ state: "visible", timeout: 20000 });

  let likeBefore = await getMetric(cardA, 0);
  if (likeBefore.active) {
    await cardA.locator(".feed-card-actions button").nth(0).click();
    likeBefore = await waitForMetric(cardA, 0, Math.max(0, likeBefore.value - 1), false);
    await waitForMetric(cardB, 0, likeBefore.value, false);
  }

  await pageA.locator('.rail-nav a[href="/profile"]').first().click();
  await pageA.waitForURL(/\/profile$/, { timeout: 20000 });
  await pageA.waitForLoadState("networkidle");

  const likeCountBeforeAction = await getMetric(cardB, 0);
  await cardB.locator(".feed-card-actions button").nth(0).click();
  const likeAfterB = await waitForMetric(cardB, 0, likeCountBeforeAction.value + 1, true);

  const beforeReturnEventCount = pageAApiEvents.length;
  await pageA.getByRole("link", { name: /back to feed/i }).click();
  await pageA.waitForURL(/\/feed$/, { timeout: 20000 });
  await cardA.waitFor({ state: "visible", timeout: 10000 });
  const likeAfterReturn = await waitForMetric(cardA, 0, likeAfterB.value, likeAfterB.active);
  const returnEvents = pageAApiEvents.slice(beforeReturnEventCount);

  console.log(
    JSON.stringify(
      {
        likeBefore,
        likeAfterB,
        likeAfterReturn,
        pageAWebsocketMessages,
        returnFeedCalls: returnEvents.filter((event) => event.url.includes("/stories/feed")),
        returnStatusCalls: returnEvents.filter((event) => event.url.endsWith("/statuses")),
        returnMineCalls: returnEvents.filter((event) => event.url.includes("/statuses/mine"))
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
