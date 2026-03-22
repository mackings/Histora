const { chromium } = require("playwright");

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const email = "studioe2e@gmail.com";
const password = "TestPassword123";
const deviceIdentity = {
  deviceId: "test-device-000000000001",
  deviceName: "Playwright Test Device"
};

const localDraftSentence = "First sentence stays in the correct typing order.";
const appendedSentence = "Second sentence keeps writing at the end.";
const publishSummary =
  "This summary is long enough to satisfy the studio requirements while verifying that a locally saved draft can be reopened, completed, published anonymously, and then shared without server errors.";
const publishBody =
  `${localDraftSentence} ${appendedSentence} ` +
  "The rest of this body pushes the chapter beyond readiness so preview and publishing can complete in the browser regression without any manual repair steps or hidden editor workarounds.";

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();
const normalizeOrderedText = (value) => normalizeText(value).replace(/\s+/g, "");

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
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__historaCopiedText = text;
        }
      }
    });
  });
  const page = await context.newPage();

  const storyTitle = `Playwright local draft ${Date.now()}`;

  await signIn(page);
  await page.getByRole("link", { name: /studio/i }).first().click();
  await page.waitForURL(/\/studio$/, { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1800);

  await page.getByRole("button", { name: /^NEW STORY$/i }).click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });

  const storySetup = page.locator("article").filter({ hasText: "Story identity" }).first();
  await storySetup.locator("input").first().fill(storyTitle);

  const editor = page.locator(".editor-surface");
  await editor.click();
  await page.keyboard.type(localDraftSentence, { delay: 20 });
  await page.keyboard.type(` ${appendedSentence}`, { delay: 20 });
  const textAfterFirstTyping = normalizeOrderedText(await editor.evaluate((node) => node.textContent?.trim() ?? ""));
  const expectedInitialText = normalizeOrderedText(`${localDraftSentence} ${appendedSentence}`);
  if (textAfterFirstTyping !== expectedInitialText) {
    throw new Error(`Editor text order broke after initial typing: ${JSON.stringify({ textAfterFirstTyping, expectedInitialText })}`);
  }

  await page.getByRole("button", { name: /story library/i }).click();
  await page.locator(".studio-library-panel").waitFor({ state: "visible", timeout: 10000 });

  const localDraftCard = page.locator(".studio-library-card").filter({ hasText: storyTitle }).first();
  await localDraftCard.waitFor({ state: "visible", timeout: 10000 });
  const localDraftMeta = await localDraftCard.innerText();
  if (!/saved on this device/i.test(localDraftMeta)) {
    throw new Error(`Local draft card did not identify itself as device-saved: ${localDraftMeta}`);
  }

  await localDraftCard.click();
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 10000 });

  const restoredTitle = await storySetup.locator("input").first().inputValue();
  const restoredText = await editor.evaluate((node) => node.textContent?.trim() ?? "");
  if (restoredTitle !== storyTitle || normalizeOrderedText(restoredText) !== expectedInitialText) {
    throw new Error(`Local draft restore failed: ${JSON.stringify({ restoredTitle, restoredText })}`);
  }

  await storySetup.locator("textarea").first().fill(publishSummary);
  await page
    .locator(".toggle-row")
    .filter({ hasText: "Post this chapter anonymously for advice" })
    .locator('input[type="checkbox"]')
    .first()
    .check();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(publishBody, { delay: 15 });

  const finalEditorText = normalizeOrderedText(await editor.evaluate((node) => node.textContent?.trim() ?? ""));
  if (finalEditorText !== normalizeOrderedText(publishBody)) {
    throw new Error(`Editor text order broke after continued typing: ${JSON.stringify({ finalEditorText, publishBody })}`);
  }

  await page.getByRole("button", { name: /finish and preview/i }).click();
  await page.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Publish$/i }).click();
  await page.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await page.waitForLoadState("networkidle");

  const shareButton = page.locator(".story-reader-stage-actions .feed-action-pill").nth(2);
  const initialShareCount = Number((await shareButton.innerText()).replace(/\D+/g, "") || "0");
  await shareButton.click();
  await page.getByRole("button", { name: /copy link/i }).click();
  await page.locator(".status-feedback").filter({ hasText: /share link copied/i }).waitFor({ state: "visible", timeout: 10000 });

  const copiedLink = await page.evaluate(() => window.__historaCopiedText ?? null);
  const finalShareCount = Number(((await page.locator(".story-reader-stage-actions .feed-action-pill").nth(2).innerText()).replace(/\D+/g, "")) || "0");
  const storyPath = new URL(page.url()).pathname;

  if (!copiedLink || !String(copiedLink).includes("/feed/story/")) {
    throw new Error(`Share flow did not copy a story link: ${copiedLink}`);
  }
  if (finalShareCount !== initialShareCount + 1) {
    throw new Error(`Share count did not increment after copying the anonymous story link: ${JSON.stringify({ initialShareCount, finalShareCount })}`);
  }

  console.log(
    JSON.stringify(
      {
        storyTitle,
        storyPath,
        localDraftRestored: true,
        editorTypingOrder: "stable",
        copiedLink,
        initialShareCount,
        finalShareCount
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
