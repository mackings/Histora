const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dotenv = require(path.resolve(__dirname, "../../../node_modules/dotenv"));
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });
mongoose.set("bufferTimeoutMS", 30000);

const ownerUser = {
  email: "studioe2e@gmail.com",
  username: "studioe2e",
  displayName: "Studio E2E",
  deviceIdentity: {
    deviceId: "test-device-000000000011",
    deviceName: "Playwright Collaborative Media Owner"
  }
};

const collaboratorUser = {
  email: "feedauthor@gmail.com",
  username: "feedauthor",
  displayName: "Feed Author",
  deviceIdentity: {
    deviceId: "test-device-000000000012",
    deviceName: "Playwright Collaborative Media Collaborator"
  }
};

function ensureFixtureFiles() {
  const pngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9lJawAAAAASUVORK5CYII=",
    "base64"
  );
  const wavBuffer = Buffer.from(
    "UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA////AAAA////AAAA////AAAA////",
    "base64"
  );

  fs.writeFileSync("/tmp/histora-collab-media-1.png", pngBuffer);
  fs.writeFileSync("/tmp/histora-collab-media-2.png", pngBuffer);
  fs.writeFileSync("/tmp/histora-collab-media.wav", wavBuffer);
}

async function loadSession(email) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for collaborative media regression.");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000
    });
  }

  const user = await mongoose.connection.collection("users").findOne(
    { email },
    {
      projection: {
        _id: 1,
        fullName: 1,
        username: 1,
        email: 1,
        subscriptionTier: 1
      }
    }
  );

  if (!user) {
    throw new Error(`Seeded user not found for ${email}.`);
  }

  const session = await mongoose.connection.collection("sessions").insertOne({
    userId: user._id,
    tokenHash: crypto.randomUUID(),
    family: crypto.randomUUID(),
    parentSessionId: null,
    deviceKeyHash: null,
    deviceLabel: null,
    userAgent: "Playwright",
    ipAddress: "127.0.0.1",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastSeenAt: new Date(),
    revokedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return {
    accessToken: jwt.sign({ sub: String(user._id), sid: String(session.insertedId), typ: "access" }, process.env.JWT_SECRET, {
      expiresIn: process.env.ACCESS_TOKEN_TTL || "15m"
    }),
    user: {
      id: String(user._id),
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      subscriptionTier: user.subscriptionTier || "free"
    }
  };
}

async function bootstrapSession(page, user, session, nextPath) {
  await page.goto(`${webBaseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ identity, authSession, pathName }) => {
      window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
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

async function waitForEditor(page) {
  await page.locator(".editor-surface").waitFor({ state: "visible", timeout: 15000 });
}

async function waitForCollaborativeEditor(page) {
  await waitForEditor(page);
  await page.locator(".studio-collaboration-panel").waitFor({ state: "visible", timeout: 15000 });
}

async function captureMediaState(page) {
  return await page.evaluate(async () => {
    const imageElements = Array.from(document.querySelectorAll(".media-preview-image"));
    const audioElements = Array.from(document.querySelectorAll("audio.voice-player"));

    const imageHealthy = imageElements.every((image) => {
      const element = image;
      return Boolean(element.getAttribute("src")) && element.complete && element.naturalWidth > 0;
    });

    const audioStatuses = await Promise.all(
      audioElements.map(
        (audio) =>
          new Promise((resolve) => {
            const element = audio;
            if (!element.getAttribute("src")) {
              resolve({ src: "", readyState: element.readyState, error: true });
              return;
            }

            const done = () => {
              cleanup();
              resolve({
                src: element.getAttribute("src"),
                readyState: element.readyState,
                error: Boolean(element.error)
              });
            };
            const cleanup = () => {
              element.removeEventListener("loadedmetadata", done);
              element.removeEventListener("canplay", done);
              element.removeEventListener("error", done);
            };

            element.addEventListener("loadedmetadata", done, { once: true });
            element.addEventListener("canplay", done, { once: true });
            element.addEventListener("error", done, { once: true });
            element.load();
            window.setTimeout(done, 4000);
          })
      )
    );

    return {
      imageCount: imageElements.length,
      audioCount: audioElements.length,
      imageHealthy,
      audioStatuses
    };
  });
}

async function run() {
  ensureFixtureFiles();

  const [ownerSession, collaboratorSession] = await Promise.all([
    loadSession(ownerUser.email),
    loadSession(collaboratorUser.email)
  ]);

  const storyTitle = `Collaborative media refresh ${Date.now()}`;
  const createdStory = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: storyTitle,
      summary:
        "This collaborative media refresh summary is long enough to validate and exists to verify that image and voice attachments survive a collaborator refresh without falling back to expired signed URLs.",
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
            "<p>This collaborative story contains enough text to be valid while we attach images and a voice note and then refresh the collaborator view to verify that durable storage keys keep the media healthy.</p>",
          type: "memory",
          order: 1,
          imageUrls: [],
          moments: []
        }
      ]
    }
  });

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--no-sandbox"]
  });
  const ownerContext = await browser.newContext({ permissions: ["microphone"] });
  const collaboratorContext = await browser.newContext({ permissions: ["microphone"] });
  const ownerPage = await ownerContext.newPage();
  const collaboratorPage = await collaboratorContext.newPage();

  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${createdStory.id}`);
  await waitForEditor(ownerPage);

  const fileInput = ownerPage.locator('input[type="file"]').first();
  await fileInput.setInputFiles("/tmp/histora-collab-media-1.png");
  await ownerPage.waitForTimeout(1500);
  await fileInput.setInputFiles("/tmp/histora-collab-media-2.png");
  await ownerPage.waitForTimeout(3000);

  const voiceSlot = ownerPage.getByRole("button", { name: /voice slot 1/i });
  if (await voiceSlot.count()) {
    await voiceSlot.click();
    await ownerPage.waitForTimeout(2500);
    const stopButton = ownerPage.getByRole("button", { name: /^STOP$/i });
    if (await stopButton.count()) {
      await stopButton.click();
      await ownerPage.waitForTimeout(5000);
    }
  }

  await apiRequest("/profile/invites", ownerSession.accessToken, {
    method: "POST",
    body: {
      email: collaboratorUser.email,
      circle: "family",
      storyId: createdStory.id
    }
  });

  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, "/feed");
  await collaboratorPage.locator(".collaboration-sheet-modal").waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.getByRole("button", { name: /accept and start/i }).click();
  await collaboratorPage.waitForURL(/\/studio/, { timeout: 15000 });
  await waitForCollaborativeEditor(collaboratorPage);
  await collaboratorPage.waitForTimeout(2500);

  const beforeRefresh = await captureMediaState(collaboratorPage);
  if (beforeRefresh.imageCount < 2 || beforeRefresh.audioCount < 1) {
    throw new Error(`Collaborator did not receive media before refresh: ${JSON.stringify(beforeRefresh)}`);
  }

  const collaborativeUrl = new URL(collaboratorPage.url());
  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, `${collaborativeUrl.pathname}${collaborativeUrl.search}`);
  await waitForCollaborativeEditor(collaboratorPage);
  await collaboratorPage.waitForTimeout(2500);

  const afterRefresh = await captureMediaState(collaboratorPage);
  const audioHealthy = afterRefresh.audioStatuses.every((status) => Boolean(status.src) && !status.error && status.readyState >= 1);

  if (!afterRefresh.imageHealthy || !audioHealthy) {
    throw new Error(`Collaborative media broke after refresh: ${JSON.stringify({ beforeRefresh, afterRefresh })}`);
  }

  console.log(
    JSON.stringify(
      {
        storyId: createdStory.id,
        beforeRefresh,
        afterRefresh,
        audioHealthy
      },
      null,
      2
    )
  );

  await ownerContext.close();
  await collaboratorContext.close();
  await browser.close();
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
