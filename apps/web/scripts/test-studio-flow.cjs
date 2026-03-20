const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const email = "studioe2e@gmail.com";
const password = "TestPassword123";
const deviceIdentity = {
  deviceId: "test-device-000000000001",
  deviceName: "Playwright Test Device"
};

const longSummary =
  "This is a grounded test summary with more than twenty words so the studio can validate it correctly and allow preview without schema confusion.";
const longBody =
  "This is a browser test body for Histora studio. It contains enough words to cross the chapter threshold and verify that the main story body actually persists after refresh. " +
  "We are writing this to confirm autosave, preview, and upload behavior. The text should remain visible after reloading the page, and the saved draft should keep the chapter content intact while media uploads complete in the background.";

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

  page.on("console", (message) => {
    console.log(`[browser:${message.type()}] ${message.text()}`);
  });

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
      url,
      status: response.status(),
      body
    });

    console.log(`[api] ${response.request().method()} ${url} ${response.status()} ${body.slice(0, 500)}`);
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

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill("Playwright studio upload test");
  await storySetup.locator("textarea").first().fill(longSummary);

  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(longBody);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles("/tmp/histora-test-1.png");
  await page.waitForTimeout(1500);
  await fileInput.setInputFiles("/tmp/histora-test-2.png");
  await page.waitForTimeout(3000);

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

  const beforeRefresh = {
    bodyText: await editor.innerText().catch(() => ""),
    imageCount: await page.locator(".media-preview-image").count(),
    voiceCount: await page.locator("audio.voice-player").count(),
    studioMessage: await page.locator(".studio-status-bar strong").innerText().catch(() => "")
  };

  console.log(`[assert] before refresh ${JSON.stringify(beforeRefresh)}`);

  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const afterRefresh = {
    path: new URL(page.url()).pathname,
    bodyText: await page.locator(".editor-surface").innerText().catch(() => ""),
    imageCount: await page.locator(".media-preview-image").count(),
    voiceCount: await page.locator("audio.voice-player").count(),
    studioMessage: await page.locator(".studio-status-bar strong").innerText().catch(() => "")
  };

  console.log(`[assert] after refresh ${JSON.stringify(afterRefresh)}`);

  const refreshProbe = await page.evaluate(() => {
    const editor = document.querySelector(".editor-surface");
    const draftRaw = window.localStorage.getItem("histora-studio-local-draft-v1");
    const draft = draftRaw ? JSON.parse(draftRaw) : null;
    const imageElements = Array.from(document.querySelectorAll(".media-preview-image"));
    const voiceElements = Array.from(document.querySelectorAll("audio.voice-player"));

    return {
      heading: document.querySelector(".chapter-heading-row h2")?.textContent ?? null,
      editorInnerHTML: editor?.innerHTML ?? null,
      editorTextContent: editor?.textContent ?? null,
      activeDraftChapter: draft?.activeChapter ?? null,
      imageSrcs: imageElements.map((element) => element.getAttribute("src")),
      voiceSrcs: voiceElements.map((element) => element.getAttribute("src")),
      draftChapterBodies: Array.isArray(draft?.chapters)
        ? draft.chapters.map((chapter) => ({
            title: chapter.title,
            bodyPreview: String(chapter.body ?? "").slice(0, 160),
            imageCount: Array.isArray(chapter.imageAttachments) ? chapter.imageAttachments.length : 0,
            voiceCount: Array.isArray(chapter.voiceNotes) ? chapter.voiceNotes.length : 0
          }))
        : []
    };
  });

  console.log(`[probe] after refresh ${JSON.stringify(refreshProbe)}`);

  if (afterRefresh.path !== "/studio") {
    console.log(
      JSON.stringify({
        beforeRefresh,
        afterRefresh,
        refreshSessionLost: true,
        recentApiEvents: apiEvents.slice(-12)
      }, null, 2)
    );
    await browser.close();
    return;
  }

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForTimeout(5000);

  const urlAfterPreviewClick = page.url();
  const previewError = await page.locator(".status-feedback").innerText().catch(() => "");
  const noticeText = await page.locator(".studio-notice-copy").innerText().catch(() => "");

  console.log(
    JSON.stringify({
      beforeRefresh,
      afterRefresh,
      urlAfterPreviewClick,
      previewError,
      noticeText,
      recentApiEvents: apiEvents.slice(-12)
    }, null, 2)
  );

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
