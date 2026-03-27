const { chromium } = require("playwright");
const { studioUser } = require("../../api/scripts/test-env.cjs");

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const email = studioUser.email;
const password = studioUser.password;
const deviceIdentity = studioUser.deviceIdentity;

const summaryText =
  "This two browser regression summary is intentionally long enough to satisfy the studio minimum while we verify that a live story never disappears from another signed in session.";
const bodyText =
  "This two browser regression body exists to verify that a published story remains visible in a second Chromium session even after the first session re-enters the studio, restores local draft state, and makes fresh local edits.";
const updatedSentence =
  "This extra sentence is typed only in the first browser to create fresh local draft changes without republishing the live story.";

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
  await page.waitForLoadState("networkidle");
}

async function openFeedFresh(page) {
  await page.goto(`${baseUrl}/feed`, { waitUntil: "networkidle" });
  await page.waitForURL(/\/feed$/, { timeout: 20000 });
}

async function assertStoryVisibleInFeed(page, storyTitle, message) {
  await openFeedFresh(page);
  await page.getByText(storyTitle).first().waitFor({ state: "visible", timeout: 20000 });

  const visibleCards = await page.locator("article.post-card").filter({ hasText: storyTitle }).count();
  if (visibleCards < 1) {
    throw new Error(message);
  }
}

async function run() {
  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const contextA = await browserA.newContext();
  const contextB = await browserB.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const storyTitle = `Playwright two browser story visibility ${Date.now()}`;

  await signIn(pageA);
  await signIn(pageB);

  await pageA.getByRole("link", { name: /studio/i }).first().click();
  await pageA.waitForURL(/\/studio$/, { timeout: 20000 });
  await pageA.waitForLoadState("networkidle");
  await pageA.waitForTimeout(1800);
  await pageA.getByRole("button", { name: /^NEW STORY$/i }).click();
  await pageA.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });
  await pageA.getByRole("button", { name: /^selected$/i }).click();

  const storySetup = pageA.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill(storyTitle);
  await storySetup.locator("textarea").first().fill(summaryText);

  const editor = pageA.locator(".editor-surface");
  await editor.click();
  await editor.fill(bodyText);

  await pageA.getByRole("button", { name: /finish and preview/i }).click();
  await pageA.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await pageA.waitForLoadState("networkidle");
  await pageA.getByRole("button", { name: /^Publish$/i }).click();
  await pageA.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await pageA.waitForLoadState("networkidle");

  await assertStoryVisibleInFeed(
    pageB,
    storyTitle,
    "The second browser did not show the newly published story."
  );

  await pageA.goto(`${baseUrl}/studio`, { waitUntil: "networkidle" });
  await pageA.waitForURL(/\/studio$/, { timeout: 20000 });
  await pageA.waitForTimeout(2200);

  if (!(await pageA.locator(".studio-library-panel").isVisible())) {
    throw new Error("Studio did not reopen in story library mode.");
  }

  await assertStoryVisibleInFeed(
    pageB,
    storyTitle,
    "The second browser lost the live story after the first browser reopened studio."
  );

  await pageA.locator(".studio-library-card").filter({ hasText: storyTitle }).filter({ hasText: "LIVE" }).first().click();
  await pageA.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });
  await pageA.waitForTimeout(600);

  const liveChapterLabel = await pageA.locator(".chapter-pill").first().innerText();
  if (!/LIVE/i.test(liveChapterLabel)) {
    throw new Error(`Published chapter did not stay marked LIVE after reopening in studio: ${liveChapterLabel}`);
  }

  await editor.click();
  await editor.press("End");
  await editor.type(` ${updatedSentence}`);
  await pageA.waitForTimeout(2600);

  await assertStoryVisibleInFeed(
    pageB,
    storyTitle,
    "The second browser lost the live story after the first browser created local draft edits."
  );

  console.log(
    JSON.stringify(
      {
        storyTitle,
        visibleInSecondBrowserAfterPublish: true,
        visibleInSecondBrowserAfterStudioReopen: true,
        visibleInSecondBrowserAfterLocalEdit: true,
        liveChapterLabel
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
