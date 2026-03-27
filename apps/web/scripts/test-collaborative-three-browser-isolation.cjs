const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
const dotenv = require(path.resolve(__dirname, "../../../node_modules/dotenv"));

dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });

const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

function readOptionalEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const ownerUser = {
  email: readOptionalEnv("HISTORA_STUDIO_E2E_EMAIL", "studioe2e@gmail.com"),
  username: readOptionalEnv("HISTORA_STUDIO_E2E_USERNAME", "studioe2e"),
  displayName: readOptionalEnv("HISTORA_STUDIO_E2E_DISPLAY_NAME", "Studio E2E"),
  deviceIdentity: {
    deviceId: readOptionalEnv("HISTORA_STUDIO_E2E_DEVICE_ID", "test-device-000000000001"),
    deviceName: readOptionalEnv("HISTORA_STUDIO_E2E_DEVICE_NAME", "Playwright Test Device")
  }
};

const collaboratorUser = {
  email: readOptionalEnv("HISTORA_FEED_E2E_EMAIL", "feedauthor@gmail.com"),
  username: readOptionalEnv("HISTORA_FEED_E2E_USERNAME", "feedauthor"),
  displayName: readOptionalEnv("HISTORA_FEED_E2E_DISPLAY_NAME", "Feed Author"),
  deviceIdentity: {
    deviceId: readOptionalEnv("HISTORA_FEED_E2E_DEVICE_ID", "test-device-000000000002"),
    deviceName: readOptionalEnv("HISTORA_FEED_E2E_DEVICE_NAME", "Playwright Feed Author Device")
  }
};

async function waitForCondition(check, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const intervalMs = options.intervalMs || 150;
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

async function loadSession(user) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for the three-browser collaborative isolation regression.");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  } else if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
  }

  const existingUser = await mongoose.connection.collection("users").findOne(
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

  if (!existingUser) {
    throw new Error(`Seeded user not found for ${user.email}.`);
  }

  const session = await mongoose.connection.collection("sessions").insertOne({
    userId: existingUser._id,
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
    accessToken: jwt.sign({ sub: String(existingUser._id), sid: String(session.insertedId), typ: "access" }, process.env.JWT_SECRET, {
      expiresIn: process.env.ACCESS_TOKEN_TTL || "15m"
    }),
    user: {
      id: String(existingUser._id),
      fullName: existingUser.fullName,
      username: existingUser.username,
      email: existingUser.email,
      subscriptionTier: existingUser.subscriptionTier || "free"
    }
  };
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
  const ownerSession = await loadSession(ownerUser);
  const collaboratorSession = await loadSession(collaboratorUser);

  const storyATimestamp = Date.now();
  const storyBTimestamp = storyATimestamp + 1;
  const storyATitle = `Three browser collaborative story ${storyATimestamp}`;
  const storyABody =
    `Alpha isolation body ${storyATimestamp} must stay inside the collaborative story only, ` +
    "with enough extra detail to satisfy the studio body validation and clearly identify this first story.";
  const storyBTitle = `Three browser clean draft ${storyBTimestamp}`;
  const storyBBody =
    `Beta isolation body ${storyBTimestamp} must remain unique to the second story, ` +
    "with enough extra detail to satisfy validation and prove the second editor stayed isolated.";
  const liveSentence = ` Live sync ${Date.now()} should never appear inside the second story.`;

  const storyA = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: storyATitle,
      summary:
        "This collaborative isolation summary is intentionally long enough to keep the story valid while three Chromium instances verify that one collaborative story does not leak text into a different draft.",
      visibility: "private",
      anonymous: false,
      allowedViewerIds: [],
      tags: [],
      links: [],
      status: "draft",
      chapters: [
        {
          title: "Opening chapter",
          body: `<p>${storyABody}</p>`,
          type: "memory",
          order: 1,
          imageUrls: [],
          moments: []
        }
      ]
    }
  });

  const storyB = await apiRequest("/stories", ownerSession.accessToken, {
    method: "POST",
    body: {
      title: storyBTitle,
      summary:
        "This second story exists only to prove that another open Chromium studio does not inherit text, draft updates, or collaboration state from the first story while the owner and collaborator keep editing there.",
      visibility: "private",
      anonymous: false,
      allowedViewerIds: [],
      tags: [],
      links: [],
      status: "draft",
      chapters: [
        {
          title: "Opening chapter",
          body: `<p>${storyBBody}</p>`,
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
      storyId: storyA.id
    }
  });

  const incomingInvites = await apiRequest("/profile/invites/incoming", collaboratorSession.accessToken);
  const invite = incomingInvites.invites.find((entry) => entry.storyId === storyA.id && entry.status === "pending");
  if (!invite) {
    throw new Error(`Collaborator invite for story ${storyA.id} was not found.`);
  }

  await apiRequest(`/profile/invites/${invite.id}/accept`, collaboratorSession.accessToken, {
    method: "POST"
  });

  const ownerBrowserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const collaboratorBrowser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ownerBrowserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  const ownerPageA = await (await ownerBrowserA.newContext()).newPage();
  const collaboratorPage = await (await collaboratorBrowser.newContext()).newPage();
  const ownerPageB = await (await ownerBrowserB.newContext()).newPage();

  attachConsoleLogging(ownerPageA, "owner-a");
  attachConsoleLogging(collaboratorPage, "collaborator");
  attachConsoleLogging(ownerPageB, "owner-b");

  await bootstrapSession(ownerPageA, ownerUser, ownerSession, `/studio?storyId=${storyA.id}`);
  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, `/studio?storyId=${storyA.id}`);
  await bootstrapSession(ownerPageB, ownerUser, ownerSession, `/studio?storyId=${storyB.id}`);

  await waitForCollaborativeEditor(ownerPageA);
  await waitForCollaborativeEditor(collaboratorPage);
  await waitForEditor(ownerPageB);

  await clearCollaborativeInterrupts(ownerPageA);
  await clearCollaborativeInterrupts(collaboratorPage);

  const ownerBHasCollaborationPanel = await ownerPageB.locator(".studio-collaboration-panel").isVisible().catch(() => false);
  if (ownerBHasCollaborationPanel) {
    throw new Error("Second story opened with collaboration controls even though it is not the collaborative story.");
  }

  const ownerBInitialText = await ownerPageB.locator(".editor-surface").innerText();
  if (!ownerBInitialText.includes(storyBBody) || ownerBInitialText.includes(storyABody)) {
    throw new Error(
      `Second story loaded the wrong initial content: ${JSON.stringify({
        ownerBInitialText,
        expectedOwnBody: storyBBody,
        forbiddenBody: storyABody
      })}`
    );
  }

  await ownerPageA.locator(".editor-surface").click();
  await ownerPageA.keyboard.insertText(liveSentence);

  const syncStartedAt = Date.now();
  await waitForCondition(
    async () => {
      const collaboratorText = await collaboratorPage.locator(".editor-surface").innerText();
      return collaboratorText.includes(liveSentence.trim());
    },
    {
      timeoutMs: 2000,
      intervalMs: 80,
      errorMessage: "Collaborator did not receive the live update from the first story."
    }
  );
  const liveSyncMs = Date.now() - syncStartedAt;

  await ownerPageB.waitForTimeout(1800);
  const ownerBFinalText = await ownerPageB.locator(".editor-surface").innerText();
  if (!ownerBFinalText.includes(storyBBody) || ownerBFinalText.includes(liveSentence.trim()) || ownerBFinalText.includes(storyABody)) {
    throw new Error(
      `Second story was contaminated after the collaborative live update: ${JSON.stringify({
        ownerBFinalText,
        expectedOwnBody: storyBBody,
        forbiddenBodies: [storyABody, liveSentence.trim()]
      })}`
    );
  }

  console.log(
    JSON.stringify(
      {
        storyAId: storyA.id,
        storyBId: storyB.id,
        liveSyncMs,
        ownerBHasCollaborationPanel,
        ownerBStayedIsolated: ownerBFinalText.includes(storyBBody) &&
          !ownerBFinalText.includes(storyABody) &&
          !ownerBFinalText.includes(liveSentence.trim())
      },
      null,
      2
    )
  );

  await ownerPageA.context().close();
  await collaboratorPage.context().close();
  await ownerPageB.context().close();
  await ownerBrowserA.close();
  await collaboratorBrowser.close();
  await ownerBrowserB.close();
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  if (mongoose.connection.readyState !== 0) {
    void mongoose.disconnect();
  }
  process.exit(1);
});
