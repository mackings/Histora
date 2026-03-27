const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const email = studioUser.email;
const password = studioUser.password;
const deviceIdentity = studioUser.deviceIdentity;

const summaryText =
  "This regression summary is intentionally long enough to satisfy the minimum so the selected live story can be published and then reopened safely in studio.";
const bodyText =
  "This regression body exists to verify three linked behaviors in Histora. First, a published selected story created by the signed in user should still appear in that same user's feed. Second, when that live story is reopened inside the studio editor, the chapter body should render immediately without forcing a switch to another chapter and back again. Third, once the writer edits the live story, auto save must not demote the published record back into draft and remove it from the feed.";
const updatedSentence = "This extra sentence proves the live story can be edited without disappearing from the feed.";

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

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const storyTitle = `Playwright live feed regression ${Date.now()}`;

  await signIn(page);
  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1800);

  if (!(await page.locator(".studio-library-panel").isVisible())) {
    throw new Error("Studio did not open in story-library mode.");
  }

  await page.getByRole("button", { name: /^NEW STORY$/i }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /^selected$/i }).click();

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill(storyTitle);
  await storySetup.locator("textarea").first().fill(summaryText);

  const editor = page.locator(".editor-surface");
  await editor.click();
  await editor.fill(bodyText);

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Publish$/i }).click();
  try {
    await page.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  } catch (error) {
    const publishProbe = await page.evaluate(() => ({
      path: window.location.pathname,
      feedback: document.querySelector(".status-feedback")?.textContent ?? null,
      previewStorage: window.sessionStorage.getItem("histora-studio-preview"),
      publishStorage: window.sessionStorage.getItem("histora-studio-publish-payload"),
      bodyPreview: document.body.textContent?.slice(0, 2000) ?? null
    }));
    console.log(JSON.stringify({ publishProbe }, null, 2));
    throw error;
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    window.history.pushState({}, "", "/feed");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/feed$/, { timeout: 10000 });
  let visibleInFeedAfterPublish = false;
  try {
    await page.getByText(storyTitle).first().waitFor({ state: "visible", timeout: 15000 });
    visibleInFeedAfterPublish = true;
  } catch {
    visibleInFeedAfterPublish = false;
  }
  if (!visibleInFeedAfterPublish) {
    throw new Error("Newly published selected story was not visible in the signed-in user's feed.");
  }

  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1800);
  await page.locator(".studio-library-card").filter({ hasText: storyTitle }).filter({ hasText: "LIVE" }).first().click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(600);

  const editorTextOnOpen = await page.locator(".editor-surface").innerText();
  const liveChapterLabel = await page.locator(".chapter-pill").first().innerText();

  if (!editorTextOnOpen.includes("This regression body exists")) {
    throw new Error(`Published story body did not appear immediately in the editor: ${editorTextOnOpen}`);
  }
  if (!/LIVE/i.test(liveChapterLabel)) {
    throw new Error(`Published chapter did not show a LIVE label: ${liveChapterLabel}`);
  }

  await editor.click();
  await editor.press("End");
  await editor.type(` ${updatedSentence}`);
  await page.waitForTimeout(2600);

  await page.evaluate(() => {
    window.history.pushState({}, "", "/feed");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForURL(/\/feed$/, { timeout: 10000 });
  let visibleInFeedAfterEdit = false;
  try {
    await page.getByText(storyTitle).first().waitFor({ state: "visible", timeout: 15000 });
    visibleInFeedAfterEdit = true;
  } catch {
    visibleInFeedAfterEdit = false;
  }
  if (!visibleInFeedAfterEdit) {
    throw new Error("Live story disappeared from the feed after local edits and autosave.");
  }

  const result = {
    storyTitle,
    visibleInFeedAfterPublish,
    visibleInFeedAfterEdit,
    editorTextPreview: editorTextOnOpen.slice(0, 180),
    liveChapterLabel
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
