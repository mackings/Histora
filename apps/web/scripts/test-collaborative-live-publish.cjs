const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const dotenv = require(path.resolve(__dirname, "../../../node_modules/dotenv"));

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });

const ownerUser = {
  email: "studioe2e@gmail.com",
  username: "studioe2e",
  password: "TestPassword123",
  displayName: "Studio E2E",
  deviceIdentity: {
    deviceId: "test-device-000000000001",
    deviceName: "Playwright Test Device"
  }
};

const collaboratorUser = {
  email: "feedauthor@gmail.com",
  username: "feedauthor",
  password: "AuthorPass123",
  displayName: "Feed Author",
  deviceIdentity: {
    deviceId: "test-device-000000000002",
    deviceName: "Playwright Feed Author Device"
  }
};

function ensureFixtureFiles() {
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9lJawAAAAASUVORK5CYII=",
    "base64"
  );

  fs.writeFileSync("/tmp/histora-live-publish-image.png", pngBuffer);
}

async function waitForCondition(check, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const intervalMs = options.intervalMs || 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await check();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(options.errorMessage || "Timed out waiting for condition.");
}

async function loginSession(user) {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: webBaseUrl,
      "X-Requested-With": "XMLHttpRequest"
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      deviceId: user.deviceIdentity.deviceId,
      deviceName: user.deviceIdentity.deviceName
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.accessToken || !payload?.user) {
    throw new Error(`Login failed for ${user.email}: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function bootstrapSession(page, user, session, nextPath) {
  await page.goto(`${webBaseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ identity, authSession, pathName }) => {
      window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
      window.localStorage.setItem("histora-debug-collab", "true");
      window.dispatchEvent(new CustomEvent("histora-auth-session", { detail: authSession }));
      window.history.pushState({}, "", pathName);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    { identity: user.deviceIdentity, authSession: session, pathName: nextPath }
  );
  await page.waitForLoadState("networkidle");
}

async function apiRequest(pathname, accessToken, options = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      "X-Requested-With": "XMLHttpRequest"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`API ${pathname} failed ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function uploadFixtureAsStoryImage(accessToken, filePath, fileName, contentType) {
  const signedUpload = await apiRequest("/media/signed-upload", accessToken, {
    method: "POST",
    body: {
      fileName,
      contentType
    }
  });
  const fileBuffer = fs.readFileSync(filePath);
  const uploadResponse = await fetch(signedUpload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: fileBuffer
  });

  if (!uploadResponse.ok) {
    throw new Error(`Fixture upload failed ${uploadResponse.status}`);
  }

  return signedUpload.objectKey;
}

async function waitForEditor(page) {
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 15000 });
}

async function waitForCollaborativeEditor(page) {
  await waitForEditor(page);
  await page.locator(".studio-collaboration-panel").waitFor({ state: "visible", timeout: 15000 });
}

async function clearCollaborativeInterrupts(page) {
  const syncButton = page.getByRole("button", { name: /sync latest now/i });
  if (await syncButton.isVisible().catch(() => false)) {
    await syncButton.click();
    await page.waitForTimeout(1200);
  }

  const dismissButton = page.getByRole("button", { name: /^dismiss$/i });
  if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click();
    await page.waitForTimeout(300);
  }
}

function attachConsoleLogging(page, label) {
  page.on("console", (message) => {
    console.log(`[${label} browser:${message.type()}] ${message.text()}`);
  });
}

function attachApiLogging(page, label) {
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("/api/")) {
      return;
    }

    const request = response.request();
    const method = request.method();
    const isInterestingMethod = method === "PATCH" || method === "POST";
    const isError = response.status() >= 400;

    if (!isInterestingMethod && !isError) {
      return;
    }

    console.log(`[${label} api] ${method} ${url} -> ${response.status()}`);
  });
}

async function getVoicePanelState(page) {
  return page.evaluate(() => ({
    voiceCount: document.querySelectorAll("audio.voice-player").length,
    voiceCardTitles: Array.from(document.querySelectorAll(".media-card strong")).map((node) => node.textContent?.trim() ?? ""),
    voiceSources: Array.from(document.querySelectorAll(".media-card span")).map((node) => node.textContent?.trim() ?? ""),
    mediaText: document.querySelector(".media-grid")?.textContent?.replace(/\s+/g, " ").trim() ?? null
  }));
}

async function getPublishedReaderState(page) {
  return page.evaluate(() => ({
    path: window.location.pathname,
    readyState: document.readyState,
    title: document.querySelector(".story-reader-stage h1")?.textContent ?? null,
    chapterTitle: document.querySelector(".chapter-reader-head h2")?.textContent ?? null,
    chapterBody: document.querySelector(".chapter-reader-copy")?.textContent ?? null,
    imageCount: document.querySelectorAll(".story-reader-image").length,
    imageSources: Array.from(document.querySelectorAll(".story-reader-image")).map((node) => node.getAttribute("src") ?? ""),
    voiceCount: document.querySelectorAll(".voice-note-player").length,
    voiceSources: Array.from(document.querySelectorAll(".voice-note-player source")).map((node) => node.getAttribute("src") ?? ""),
    voiceText: Array.from(document.querySelectorAll(".voice-note-card")).map((node) =>
      node.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
    timelineCount: Array.from(document.querySelectorAll(".chapter-content-section"))
      .find((section) => section.textContent?.includes("TIMELINE MOMENTS"))?.querySelectorAll(".feed-reader-support-card").length ?? 0,
    sectionTexts: Array.from(document.querySelectorAll(".chapter-content-section")).map((section) =>
      section.textContent?.replace(/\s+/g, " ").trim() ?? ""
    ),
    bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 2500) ?? null
  }));
}

async function run() {
  ensureFixtureFiles();

  const [ownerSession, collaboratorSession] = await Promise.all([
    loginSession(ownerUser),
    loginSession(collaboratorUser)
  ]);

  const storyTitle = `Collaborative live publish ${Date.now()}`;
  const typedSentence = ` Live sync ${Date.now()}.`;
  const timelineTitle = `Timeline checkpoint ${Date.now()}`;
  const timelineBody = "The collaborator added this timeline moment while the owner stayed in the same open studio session.";
  const seededImageObjectKey = await uploadFixtureAsStoryImage(
    ownerSession.accessToken,
    "/tmp/histora-live-publish-image.png",
    "histora-live-publish-image.png",
    "image/png"
  );
  const createdStory = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: storyTitle,
      summary:
        "This collaborative publish summary is intentionally long enough to satisfy story validation while two open browser sessions verify live draft sync and publish integrity for text, image, voice, and timeline content.",
      visibility: "private",
      anonymous: false,
      allowedViewerIds: [],
      tags: [],
      links: [],
      status: "draft",
      chapters: [
        {
          title: "Opening chapter",
          body:
            "<p>This collaborative chapter starts with enough text to remain valid while owner and collaborator apply live body, timeline, and media changes before the story is published.</p>",
          type: "memory",
          order: 1,
          imageUrls: [seededImageObjectKey],
          moments: []
        }
      ]
    }
  });

  await apiRequest("/profile/invites", ownerSession.accessToken, {
    method: "POST",
    body: {
      email: collaboratorUser.email,
      circle: "family",
      storyId: createdStory.id
    }
  });

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--no-sandbox"
    ]
  });
  const ownerContext = await browser.newContext({
    permissions: ["microphone"]
  });
  const collaboratorContext = await browser.newContext({
    permissions: ["microphone"]
  });
  const ownerPage = await ownerContext.newPage();
  const collaboratorPage = await collaboratorContext.newPage();

  attachConsoleLogging(ownerPage, "owner");
  attachConsoleLogging(collaboratorPage, "collaborator");
  attachApiLogging(ownerPage, "owner");
  attachApiLogging(collaboratorPage, "collaborator");

  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${createdStory.id}`);
  await waitForEditor(ownerPage);

  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, "/feed");
  await collaboratorPage.locator(".collaboration-sheet-modal").waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.getByRole("button", { name: /accept and start/i }).click();
  await collaboratorPage.waitForURL(/\/studio/, { timeout: 15000 });
  await waitForCollaborativeEditor(collaboratorPage);
  await clearCollaborativeInterrupts(collaboratorPage);

  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${createdStory.id}`);
  await waitForCollaborativeEditor(ownerPage);
  await clearCollaborativeInterrupts(ownerPage);

  await waitForCondition(
    async () => {
      const ownerImages = await ownerPage.locator(".media-preview-image").count();
      const collaboratorImages = await collaboratorPage.locator(".media-preview-image").count();
      return ownerImages >= 1 && collaboratorImages >= 1;
    },
    {
      timeoutMs: 8000,
      intervalMs: 150,
      errorMessage: "Seeded collaborative image did not render in both browser sessions."
    }
  );

  const ownerEditor = ownerPage.locator(".editor-surface");
  await ownerEditor.click();
  await ownerPage.keyboard.insertText(typedSentence);

  const typingStartedAt = Date.now();
  await waitForCondition(
    async () => {
      const text = await collaboratorPage.locator(".editor-surface").innerText();
      return text.includes(typedSentence.trim());
    },
    {
      timeoutMs: 2000,
      intervalMs: 80,
      errorMessage: "Collaborator did not receive the owner text update live."
    }
  );
  const typingSyncMs = Date.now() - typingStartedAt;

  await collaboratorPage.locator(".timeline-editor-row").first().getByLabel("Timeline month").selectOption("03");
  await collaboratorPage.locator(".timeline-editor-row").first().getByLabel("Timeline day").selectOption("26");
  await collaboratorPage.locator(".timeline-editor-row").first().getByLabel("Timeline year").selectOption("2026");
  await collaboratorPage.locator(".timeline-editor-row").first().getByPlaceholder("What happened?").fill(timelineTitle);
  await collaboratorPage
    .locator(".timeline-editor-row")
    .first()
    .getByPlaceholder("Write what happened at this point in your story.")
    .fill(timelineBody);

  const timelineStartedAt = Date.now();
  await waitForCondition(
    async () => {
      const ownerTitle = await ownerPage.locator(".timeline-editor-row").first().getByPlaceholder("What happened?").inputValue();
      const ownerBody = await ownerPage
        .locator(".timeline-editor-row")
        .first()
        .getByPlaceholder("Write what happened at this point in your story.")
        .inputValue();
      return ownerTitle === timelineTitle && ownerBody === timelineBody;
    },
    {
      timeoutMs: 2500,
      intervalMs: 100,
      errorMessage: "Owner did not receive the collaborator timeline update live."
    }
  );
  const timelineSyncMs = Date.now() - timelineStartedAt;

  const voiceSlot = ownerPage.getByRole("button", { name: /voice slot 1/i });
  await voiceSlot.click();
  await ownerPage.getByRole("button", { name: /^STOP$/i }).waitFor({ state: "visible", timeout: 8000 });
  await ownerPage.waitForTimeout(1000);
  await ownerPage.getByRole("button", { name: /^STOP$/i }).click();

  const voiceStartedAt = Date.now();
  let voiceSyncState;
  try {
    voiceSyncState = await waitForCondition(
      async () => {
        const ownerVoiceCount = await ownerPage.locator("audio.voice-player").count();
        const collaboratorVoiceCount = await collaboratorPage.locator("audio.voice-player").count();
        if (ownerVoiceCount >= 1 && collaboratorVoiceCount >= 1) {
          return {
            ownerVoiceCount,
            collaboratorVoiceCount,
            ownerSources: await ownerPage.locator(".media-card span").allInnerTexts(),
            collaboratorSources: await collaboratorPage.locator(".media-card span").allInnerTexts()
          };
        }

        return null;
      },
      {
        timeoutMs: 20000,
        intervalMs: 150,
        errorMessage: "Voice note did not appear in both open browser sessions."
      }
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ownerVoicePanel: await getVoicePanelState(ownerPage),
          collaboratorVoicePanel: await getVoicePanelState(collaboratorPage)
        },
        null,
        2
      )
    );
    throw error;
  }
  const voiceSyncMs = Date.now() - voiceStartedAt;
  console.log(JSON.stringify({ voiceSyncState }, null, 2));

  await clearCollaborativeInterrupts(ownerPage);
  await ownerPage.getByRole("button", { name: /finish and preview/i }).click();
  await ownerPage.waitForURL(/\/studio\/preview$/, { timeout: 25000 });
  await ownerPage.waitForLoadState("networkidle");

  await waitForCondition(
    async () => {
      const previewImageCount = await ownerPage.locator(".preview-gallery .media-preview-image").count();
      const previewVoiceCount = await ownerPage.locator("audio.voice-player").count();
      const previewTimelineCount = await ownerPage.locator(".preview-timeline-row").count();
      return previewImageCount >= 1 && previewVoiceCount >= 1 && previewTimelineCount >= 1;
    },
    {
      timeoutMs: 15000,
      intervalMs: 150,
      errorMessage: "Preview did not retain image, voice note, and timeline content."
    }
  );

  const previewState = await ownerPage.evaluate(() => ({
    title: document.querySelector(".studio-preview-reader h1")?.textContent ?? null,
    bodyText: document.querySelector(".preview-rich-text")?.textContent ?? null,
    imageCount: document.querySelectorAll(".preview-gallery .media-preview-image").length,
    voiceCount: document.querySelectorAll("audio.voice-player").length,
    timelineCount: document.querySelectorAll(".preview-timeline-row").length
  }));

  await ownerPage.getByRole("button", { name: /^Publish$/i }).click();
  await ownerPage.waitForURL(/\/feed\/story\//, { timeout: 25000 });
  await ownerPage.waitForLoadState("networkidle");

  const publishedSlug = await ownerPage.evaluate(() => window.location.pathname.split("/").filter(Boolean).pop() ?? "");
  const publishedApiState = await apiRequest(`/stories/public/${publishedSlug}`, ownerSession.accessToken);

  let publishedState;
  try {
    await waitForCondition(
      async () => {
        const publishedImageCount = await ownerPage.locator(".story-reader-image").count();
        const publishedVoiceCount = await ownerPage.locator(".voice-note-player").count();
        const publishedTimelineCount = await ownerPage
          .locator(".chapter-content-section")
          .filter({ hasText: "TIMELINE MOMENTS" })
          .locator(".feed-reader-support-card")
          .count();
        return publishedImageCount >= 1 && publishedVoiceCount >= 1 && publishedTimelineCount >= 1;
      },
      {
        timeoutMs: 15000,
        intervalMs: 150,
        errorMessage: "Published story did not retain image, voice note, and timeline content."
      }
    );
    publishedState = await getPublishedReaderState(ownerPage);
  } catch (error) {
    publishedState = await getPublishedReaderState(ownerPage);
    console.log(
      JSON.stringify(
        {
          publishedReader: publishedState,
          publishedApiState: {
            slug: publishedApiState.slug,
            status: publishedApiState.status,
            chapterCount: publishedApiState.chapters.length,
            chapterMedia: publishedApiState.chapters.map((chapter) => ({
              title: chapter.title,
              imageCount: chapter.imageUrls.length,
              voicePresent: Boolean(chapter.voiceNoteUrl),
              timelineCount: chapter.moments.length,
              firstTimelineTitle: chapter.moments[0]?.title ?? null
            }))
          }
        },
        null,
        2
      )
    );
    throw error;
  }

  console.log(
    JSON.stringify(
      {
        storyId: createdStory.id,
        typingSyncMs,
        timelineSyncMs,
        voiceSyncMs,
        previewState,
        publishedState,
        publishedApiState: {
          slug: publishedApiState.slug,
          status: publishedApiState.status,
          chapterCount: publishedApiState.chapters.length,
          chapterMedia: publishedApiState.chapters.map((chapter) => ({
            title: chapter.title,
            imageCount: chapter.imageUrls.length,
            voicePresent: Boolean(chapter.voiceNoteUrl),
            timelineCount: chapter.moments.length,
            firstTimelineTitle: chapter.moments[0]?.title ?? null
          }))
        }
      },
      null,
      2
    )
  );

  await ownerContext.close();
  await collaboratorContext.close();
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
