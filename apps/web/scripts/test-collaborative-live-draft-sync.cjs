const { chromium } = require("playwright");
const fs = require("fs");
const { feedAuthorUser, studioUser } = require("../../api/scripts/test-env.cjs");

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

const ownerUser = studioUser;
const collaboratorUser = feedAuthorUser;

function ensureFixtureFiles() {
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9lJawAAAAASUVORK5CYII=",
    "base64"
  );

  fs.writeFileSync("/tmp/histora-live-draft-image.png", pngBuffer);
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

async function run() {
  ensureFixtureFiles();

  const [ownerSession, collaboratorSession] = await Promise.all([
    loginSession(ownerUser),
    loginSession(collaboratorUser)
  ]);

  const storyTitle = `Collaborative live draft ${Date.now()}`;
  const typedSentence = ` Live draft sync ${Date.now()} proves one browser can see another browser typing before autosave settles.`;
  const seededImageObjectKey = await uploadFixtureAsStoryImage(
    ownerSession.accessToken,
    "/tmp/histora-live-draft-image.png",
    "histora-live-draft-image.png",
    "image/png"
  );
  const createdStory = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: storyTitle,
      summary:
        "This live draft collaboration summary is intentionally long so the draft is valid and can be used to verify that typing and image removals show up in the other open editor before a full save roundtrip is required.",
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
            "<p>This collaborative chapter starts with enough text to make the story valid before we test live draft typing and image removal across two open Chromium sessions.</p>",
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
    args: ["--no-sandbox"]
  });
  const ownerContext = await browser.newContext();
  const collaboratorContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const collaboratorPage = await collaboratorContext.newPage();

  attachConsoleLogging(ownerPage, "owner");
  attachConsoleLogging(collaboratorPage, "collaborator");

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
      timeoutMs: 6000,
      intervalMs: 150,
      errorMessage: "Seeded collaborative image did not render in both browser sessions."
    }
  );

  const ownerEditor = ownerPage.locator(".editor-surface");
  await ownerEditor.click();
  await ownerPage.keyboard.type(typedSentence, { delay: 18 });

  const typingStartedAt = Date.now();
  await waitForCondition(
    async () => {
      const text = await collaboratorPage.locator(".editor-surface").innerText();
      return text.includes(typedSentence.trim());
    },
    {
      timeoutMs: 1200,
      intervalMs: 80,
      errorMessage: "Collaborator did not receive the typed draft update before autosave timing."
    }
  );
  const typingSyncMs = Date.now() - typingStartedAt;

  const removalStartedAt = Date.now();
  await collaboratorPage.getByLabel(/remove .*chapter.*image/i).first().click();

  await waitForCondition(
    async () => {
      const imageCount = await ownerPage.locator(".media-preview-image").count();
      return imageCount === 0;
    },
    {
      timeoutMs: 1200,
      intervalMs: 80,
      errorMessage: "Owner did not receive the collaborator image removal before autosave timing."
    }
  );
  const removalSyncMs = Date.now() - removalStartedAt;

  console.log(
    JSON.stringify(
      {
        storyId: createdStory.id,
        typingSyncMs,
        removalSyncMs,
        ownerImageCountAfterRemoval: await ownerPage.locator(".media-preview-image").count(),
        collaboratorImageCountAfterRemoval: await collaboratorPage.locator(".media-preview-image").count()
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
