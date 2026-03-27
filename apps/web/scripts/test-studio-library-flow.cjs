const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const email = studioUser.email;
const password = studioUser.password;
const deviceIdentity = studioUser.deviceIdentity;

const summaryText =
  "This summary is long enough to clear the minimum threshold while proving the live counter updates as the writer types inside the story setup panel.";
const bodyText =
  "This chapter body exists to verify the new writing counter, the single chapter default, and the library first entry flow. It contains enough words to cross the chapter readiness threshold so preview and publish can proceed without validation blocking the browser test run. The story should remain coherent after timeline and link metadata are added below the media section.";

async function signIn(page) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate((identity) => {
    window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
  }, deviceIdentity);
  await page.reload({ waitUntil: "networkidle" });

  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/feed|\/$/, { timeout: 20000 });
}

async function captureOrder(page, firstText, secondText) {
  return page.evaluate(
    ({ firstText: firstHeading, secondText: secondHeading }) => {
      const headings = Array.from(document.querySelectorAll("h2, h3, .section-label"));
      const firstSearch = firstHeading.toLowerCase();
      const secondSearch = secondHeading.toLowerCase();
      const first = headings.find((heading) => heading.textContent?.toLowerCase().includes(firstSearch))?.closest("section, article");
      const second = headings.find((heading) => heading.textContent?.toLowerCase().includes(secondSearch))?.closest("section, article");

      if (!first || !second) {
        return { found: false, firstOffset: null, secondOffset: null };
      }

      const relation = first.compareDocumentPosition(second);
      return {
        found: true,
        firstOffset: first.getBoundingClientRect().top,
        secondOffset: second.getBoundingClientRect().top,
        firstBeforeSecond: Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING)
      };
    },
    { firstText, secondText }
  );
}

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

  await signIn(page);
  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1800);

  const libraryVisible = await page.locator(".studio-library-panel").isVisible();
  const editorVisibleOnEntry = await page.locator(".editor-surface").isVisible().catch(() => false);
  if (!libraryVisible || editorVisibleOnEntry) {
    throw new Error(`Unexpected studio entry state. libraryVisible=${libraryVisible} editorVisibleOnEntry=${editorVisibleOnEntry}`);
  }

  await page.getByRole("button", { name: /^NEW STORY$/i }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });

  const guideSpacing = await page.evaluate(() => {
    const guide = document.querySelector(".studio-flow-guide");
    const head = guide?.querySelector(".section-head");
    const grid = guide?.querySelector(".studio-step-grid");
    if (!guide || !head || !grid) {
      return null;
    }

    const guideRect = guide.getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    return {
      guidePaddingTop: Math.round(headRect.top - guideRect.top),
      headerToGridGap: Math.round(gridRect.top - headRect.bottom)
    };
  });

  const chapterCountOnStart = await page.locator(".chapter-pill").count();
  const initialTimelineRows = await page.locator(".timeline-editor-row").count();
  const initialSummaryCounter = await page.locator(".studio-word-counter").first().innerText();
  const initialBodyCounter = await page.locator(".studio-word-counter").nth(1).innerText();

  if (chapterCountOnStart !== 1) {
    throw new Error(`Expected exactly one chapter on a fresh story, got ${chapterCountOnStart}`);
  }
  if (initialTimelineRows !== 1) {
    throw new Error(`Expected exactly one timeline row on a fresh story, got ${initialTimelineRows}`);
  }
  if (!guideSpacing || guideSpacing.guidePaddingTop < 20 || guideSpacing.headerToGridGap < 16) {
    throw new Error(`Studio guide spacing is still too tight: ${JSON.stringify(guideSpacing)}`);
  }

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  const storyTitle = `Playwright studio library flow ${Date.now()}`;
  await storySetup.locator("input").first().fill(storyTitle);
  await storySetup.locator("textarea").first().fill(summaryText);
  await page.getByRole("button", { name: /^public$/i }).click();

  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(bodyText);
  await page.waitForTimeout(2200);

  const updatedSummaryCounter = await page.locator(".studio-word-counter").first().innerText();
  const updatedBodyCounter = await page.locator(".studio-word-counter").nth(1).innerText();

  await page.getByRole("button", { name: /story library/i }).click();
  await page.locator(".studio-library-panel").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: new RegExp(storyTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /story library/i }).click();
  await page.locator(".studio-library-panel").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /^NEW STORY$/i }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });

  const resetProbe = await page.evaluate(() => {
    const titleInput = document.querySelector("article input");
    const summaryInput = document.querySelector("article textarea");
    const editorSurface = document.querySelector(".editor-surface");
    const chapterPills = document.querySelectorAll(".chapter-pill");
    const timelineRows = document.querySelectorAll(".timeline-editor-row");

    return {
      titleValue: titleInput instanceof HTMLInputElement ? titleInput.value : null,
      summaryValue: summaryInput instanceof HTMLTextAreaElement ? summaryInput.value : null,
      editorHtml: editorSurface instanceof HTMLElement ? editorSurface.innerHTML.trim() : null,
      editorText: editorSurface instanceof HTMLElement ? editorSurface.textContent?.trim() ?? null : null,
      chapterCount: chapterPills.length,
      timelineRowCount: timelineRows.length
    };
  });

  if (
    !resetProbe ||
    resetProbe.titleValue !== "" ||
    resetProbe.summaryValue !== "" ||
    resetProbe.editorText !== "" ||
    resetProbe.chapterCount !== 1 ||
    resetProbe.timelineRowCount !== 1
  ) {
    throw new Error(`New story still carried over previous draft state: ${JSON.stringify(resetProbe)}`);
  }

  await storySetup.locator("input").first().fill(`${storyTitle} fresh`);
  await storySetup.locator("textarea").first().fill(summaryText);
  await editor.click();
  await editor.fill(bodyText);

  await page.getByRole("button", { name: /add moment/i }).click();
  await page.locator(".timeline-editor-row").nth(1).waitFor({ state: "visible", timeout: 10000 });
  await page.locator(".timeline-editor-row").first().getByPlaceholder("What happened?").fill("First verified milestone");
  await page.locator(".timeline-editor-row").first().getByPlaceholder("Write what happened at this point in your story.").fill("The timeline keeps only one starter row until the writer asks for more.");

  const studioOrder = await captureOrder(page, "Anchor the chapter to real time", "Attach supporting links to this story");
  if (!studioOrder.found || !studioOrder.firstBeforeSecond) {
    throw new Error(`Studio section order is wrong: ${JSON.stringify(studioOrder)}`);
  }

  await page.getByRole("button", { name: /^ADD LINK$/i }).click();
  await page.locator(".studio-link-row").first().getByPlaceholder("Google Drive folder").fill("Reference link");
  await page.locator(".studio-link-row").first().locator("select").selectOption("website");
  await page.locator(".studio-link-row").first().getByPlaceholder("https://...").fill("https://example.com/reference");

  const voiceSlot = page.getByRole("button", { name: /voice slot 1/i });
  if (await voiceSlot.count()) {
    await voiceSlot.click();
    await page.waitForTimeout(2500);
    const stopButton = page.getByRole("button", { name: /^STOP$/i });
    if (await stopButton.count()) {
      await stopButton.click();
      await page.waitForFunction(
        () => document.querySelectorAll("audio.voice-player").length > 0,
        undefined,
        { timeout: 12000 }
      );
    }
  }

  await page.getByRole("button", { name: /finish and preview/i }).click();
  try {
    await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  } catch (error) {
    const previewProbe = await page.evaluate(() => ({
      path: window.location.pathname,
      status: document.querySelector(".studio-status-bar strong")?.textContent ?? null,
      feedback: document.querySelector(".status-feedback")?.textContent ?? null,
      notice: document.querySelector(".studio-notice-copy")?.textContent ?? null,
      previewStorage: window.sessionStorage.getItem("histora-studio-preview"),
      publishStorage: window.sessionStorage.getItem("histora-studio-publish-payload")
    }));
    console.log(JSON.stringify({ previewProbe }, null, 2));
    throw error;
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const previewOrder = await captureOrder(page, "Voice notes", "Story links");
  const previewLinkIconCount = await page.locator(".preview-story-links .story-link-chip-icon").count();

  if (!previewOrder.found || !previewOrder.firstBeforeSecond) {
    throw new Error(`Preview section order is wrong: ${JSON.stringify(previewOrder)}`);
  }
  if (previewLinkIconCount < 1) {
    throw new Error("Preview story links did not render a link icon.");
  }

  await page.getByRole("button", { name: /^Publish$/i }).click();
  await page.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const feedOrder = await captureOrder(page, "Voice notes", "STORY LINKS");
  const feedLinkIconCount = await page.locator(".feed-reader-link-grid .story-link-chip-icon").count();

  if (!feedOrder.found || !feedOrder.firstBeforeSecond) {
    const feedProbe = await page.evaluate(() => ({
      labels: Array.from(document.querySelectorAll("h2, h3, .section-label")).map((node) => node.textContent?.trim()).filter(Boolean),
      bodyPreview: document.body.textContent?.slice(0, 2000) ?? null
    }));
    throw new Error(`Feed section order is wrong: ${JSON.stringify({ feedOrder, feedProbe })}`);
  }
  if (feedLinkIconCount < 1) {
    throw new Error("Feed story links did not render a link icon.");
  }

  const result = {
    libraryVisible,
    editorVisibleOnEntry,
    guideSpacing,
    chapterCountOnStart,
    initialTimelineRows,
    initialSummaryCounter,
    initialBodyCounter,
    updatedSummaryCounter,
    updatedBodyCounter,
    resetProbe,
    studioOrder,
    previewOrder,
    previewLinkIconCount,
    feedOrder,
    feedLinkIconCount
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
