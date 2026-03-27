const { chromium } = require("playwright");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const { feedAuthorUser, studioUser } = require("../../api/scripts/test-env.cjs");
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

mongoose.set("bufferTimeoutMS", 30000);

const ownerUser = studioUser;
const collaboratorUser = feedAuthorUser;

function ensureFixtureFiles() {
  fs.writeFileSync(
    "/tmp/histora-live-media.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9lJawAAAAASUVORK5CYII=",
      "base64"
    )
  );
}

async function loginSession(user) {
  if (process.env.MONGODB_URI && process.env.JWT_SECRET) {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 30000
      });
    }

    const dbUser = await mongoose.connection.collection("users").findOne(
      { email: user.email },
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

    if (!dbUser) {
      throw new Error(`Seeded user not found for ${user.email}.`);
    }

    const session = await mongoose.connection.collection("sessions").insertOne({
      userId: dbUser._id,
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
      accessToken: jwt.sign(
        { sub: String(dbUser._id), sid: String(session.insertedId), typ: "access" },
        process.env.JWT_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_TTL || "15m" }
      ),
      user: {
        id: String(dbUser._id),
        fullName: dbUser.fullName,
        username: dbUser.username,
        email: dbUser.email,
        subscriptionTier: dbUser.subscriptionTier || "free"
      }
    };
  }

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
    throw new Error(`Login failed ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
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

async function waitForCondition(check, options = {}) {
  const timeoutMs = options.timeoutMs || 25000;
  const intervalMs = options.intervalMs || 300;
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

async function captureCollaboratorMediaState(page) {
  return page.evaluate(async () => {
    const imageCards = Array.from(document.querySelectorAll(".media-card")).map((card) => ({
      title: card.querySelector("strong")?.textContent ?? null,
      label: card.querySelector("span")?.textContent ?? null,
      imageSrc: card.querySelector(".media-preview-image")?.getAttribute("src") ?? null,
      audioSrc: card.querySelector("audio.voice-player")?.getAttribute("src") ?? null
    }));
    const image = document.querySelector(".media-preview-image");
    const audio = document.querySelector("audio.voice-player");

    const imageState = image
      ? {
          src: image.getAttribute("src") ?? "",
          complete: image.complete,
          naturalWidth: image.naturalWidth
        }
      : null;

    const audioState = await new Promise((resolve) => {
      if (!audio) {
        resolve(null);
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve({
          src: audio.getAttribute("src") ?? "",
          readyState: audio.readyState,
          error: Boolean(audio.error)
        });
      };
      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", finish);
        audio.removeEventListener("canplay", finish);
        audio.removeEventListener("error", finish);
      };

      audio.addEventListener("loadedmetadata", finish, { once: true });
      audio.addEventListener("canplay", finish, { once: true });
      audio.addEventListener("error", finish, { once: true });
      audio.load();
      window.setTimeout(finish, 4000);
    });

    return {
      imageTitle: document.querySelector(".media-card strong")?.textContent ?? null,
      imageLabel: document.querySelector(".media-card span")?.textContent ?? null,
      imageState,
      audioState,
      uploadLabels: Array.from(document.querySelectorAll(".media-card span")).map((node) => node.textContent ?? ""),
      imageCards
    };
  });
}

async function run() {
  ensureFixtureFiles();

  const [ownerSession, collaboratorSession] = await Promise.all([
    loginSession(ownerUser),
    loginSession(collaboratorUser)
  ]);

  const createdStory = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: `Live media hydration ${Date.now()}`,
      summary:
        "This story verifies that collaborator image and voice attachments hydrate into readable URLs immediately after live draft sync instead of breaking in the media panel.",
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
            "<p>This chapter has enough text to stay valid while live media sync is verified between two open studio sessions.</p>",
          type: "memory",
          order: 1,
          imageUrls: [],
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
  const ownerContext = await browser.newContext({ permissions: ["microphone"] });
  const collaboratorContext = await browser.newContext({ permissions: ["microphone"] });
  const ownerPage = await ownerContext.newPage();
  const collaboratorPage = await collaboratorContext.newPage();

  ownerPage.on("console", (message) => {
    console.log(`[owner:${message.type()}] ${message.text()}`);
  });
  collaboratorPage.on("console", (message) => {
    console.log(`[collaborator:${message.type()}] ${message.text()}`);
  });
  ownerPage.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/") && ["POST", "PATCH"].includes(response.request().method())) {
      console.log(`[owner:api] ${response.request().method()} ${url} -> ${response.status()}`);
    }
  });
  collaboratorPage.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/") && ["POST", "PATCH", "GET"].includes(response.request().method())) {
      console.log(`[collaborator:api] ${response.request().method()} ${url} -> ${response.status()}`);
    }
  });
  ownerPage.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() >= 400) {
      const body = await response.text().catch(() => "");
      console.log(`[owner:api:error-body] ${response.request().method()} ${url} -> ${response.status()} ${body}`);
    }
  });
  collaboratorPage.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") && response.status() >= 400) {
      const body = await response.text().catch(() => "");
      console.log(`[collaborator:api:error-body] ${response.request().method()} ${url} -> ${response.status()} ${body}`);
    }
  });

  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${createdStory.id}`);
  await ownerPage.locator(".editor-surface").waitFor({ state: "visible", timeout: 15000 });

  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, "/feed");
  await collaboratorPage.locator(".collaboration-sheet-modal").waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.getByRole("button", { name: /accept and start/i }).click();
  await collaboratorPage.waitForURL(/\/studio/, { timeout: 15000 });
  await collaboratorPage.locator(".editor-surface").waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.locator(".studio-collaboration-panel").waitFor({ state: "visible", timeout: 15000 });
  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${createdStory.id}`);
  await ownerPage.locator(".editor-surface").waitFor({ state: "visible", timeout: 15000 });
  await ownerPage.locator(".studio-collaboration-panel").waitFor({ state: "visible", timeout: 15000 });

  await ownerPage.locator('input[type="file"]').first().setInputFiles("/tmp/histora-live-media.png");
  await ownerPage.getByRole("button", { name: /voice slot 1/i }).click();
  await ownerPage.getByRole("button", { name: /^STOP$/i }).waitFor({ state: "visible", timeout: 8000 });
  await ownerPage.waitForTimeout(1200);
  await ownerPage.getByRole("button", { name: /^STOP$/i }).click();

  let collaboratorState;
  try {
    collaboratorState = await waitForCondition(
      async () => {
        const state = await captureCollaboratorMediaState(collaboratorPage);
        if (
          state.imageState?.src &&
          state.imageState.complete &&
          state.imageState.naturalWidth > 0 &&
          state.audioState?.src &&
          !state.audioState.error &&
          state.audioState.readyState >= 1
        ) {
          return state;
        }
        return null;
      },
      {
        timeoutMs: 30000,
        intervalMs: 500,
        errorMessage: "Collaborator media never hydrated into healthy image and voice sources."
      }
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ownerState: await captureCollaboratorMediaState(ownerPage),
          collaboratorState: await captureCollaboratorMediaState(collaboratorPage)
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
        collaboratorState
      },
      null,
      2
    )
  );

  await ownerContext.close();
  await collaboratorContext.close();
  await browser.close();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

run().catch(async (error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exit(1);
});
