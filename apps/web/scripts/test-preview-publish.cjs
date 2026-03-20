const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const email = "studioe2e@gmail.com";
const password = "TestPassword123";
const deviceIdentity = {
  deviceId: "test-device-000000000001",
  deviceName: "Playwright Test Device"
};

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox"
    ]
  });
  const context = await browser.newContext({
    permissions: ["microphone"]
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
      body: body.slice(0, 600)
    });
  });

  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((identity) => {
    window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
  }, deviceIdentity);
  await page.reload({ waitUntil: "networkidle" });

  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });

  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill("Playwright preview publish test");
  await storySetup
    .locator("textarea")
    .first()
    .fill(
      "This is a publish test summary with more than twenty words so the studio preview and publish flow can be verified end to end without schema validation failures appearing."
    );
  await page.getByRole("button", { name: /^public$/i }).click();

  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(
    "This publish test body is long enough to complete the chapter requirement. It should appear in preview, remain present after the save, and then be visible in the published reader after the publish button is pressed from preview. The goal is to verify the whole studio flow end to end."
  );

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles("/tmp/histora-test-1.png");
  await page.waitForTimeout(1500);

  const voiceSlot = page.getByRole("button", { name: /voice slot 1/i });
  if (await voiceSlot.count()) {
    await voiceSlot.click();
    await page.waitForTimeout(2500);
    const stopButton = page.getByRole("button", { name: /^STOP$/i });
    if (await stopButton.count()) {
      await stopButton.click();
      await page.waitForTimeout(5000);
    }
  }

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForFunction(
      () => document.querySelector(".studio-preview-reader h1")?.textContent !== "Preview unavailable",
      undefined,
      { timeout: 10000 }
    );
  } catch (error) {
    const previewProbe = await page.evaluate(() => ({
      path: window.location.pathname,
      previewStorage: window.sessionStorage.getItem("histora-studio-preview"),
      publishStorage: window.sessionStorage.getItem("histora-studio-publish-payload"),
      heading: document.querySelector(".studio-preview-reader h1")?.textContent ?? null,
      summary: document.querySelector(".preview-summary")?.textContent ?? null
    }));
    console.log(JSON.stringify({ previewProbe, recentApiEvents: apiEvents.slice(-12) }, null, 2));
    throw error;
  }

  const previewState = await page.evaluate(() => ({
    path: window.location.pathname,
    title: document.querySelector(".studio-preview-reader h1")?.textContent ?? null,
    summary: document.querySelector(".preview-summary")?.textContent ?? null,
    bodyText: document.querySelector(".preview-rich-text")?.textContent ?? null,
    imageCount: document.querySelectorAll(".preview-gallery .media-preview-image").length,
    voiceCount: document.querySelectorAll("audio.voice-player").length,
    timelineCount: document.querySelectorAll(".preview-timeline-row").length,
    error: document.querySelector(".status-feedback")?.textContent ?? null
  }));

  await page.getByRole("button", { name: /^Publish$/i }).click();
  await page.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  try {
    await page.waitForFunction(
      () => Boolean(document.querySelector(".feed-reader-stage h1")?.textContent),
      undefined,
      { timeout: 10000 }
    );
  } catch (error) {
    const publishedProbe = await page.evaluate(() => ({
      path: window.location.pathname,
      bodyText: document.body.textContent?.slice(0, 1000) ?? null,
      feedback: document.querySelector(".status-feedback")?.textContent ?? null
    }));
    console.log(JSON.stringify({ previewState, publishedProbe, recentApiEvents: apiEvents.slice(-14) }, null, 2));
    throw error;
  }

  const publishedState = await page.evaluate(() => ({
    path: window.location.pathname,
    storyTitle: document.querySelector(".feed-reader-stage h1")?.textContent ?? null,
    chapterTitle: document.querySelector(".chapter-reader-head h2")?.textContent ?? null,
    chapterBody: document.querySelector(".chapter-reader-copy")?.textContent ?? null,
    imageCount: document.querySelectorAll(".story-reader-image").length,
    audioCount: document.querySelectorAll(".voice-note-player").length,
    error: document.querySelector(".status-feedback")?.textContent ?? null
  }));

  console.log(
    JSON.stringify(
      {
        previewState,
        publishedState,
        recentApiEvents: apiEvents.slice(-14)
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
