const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");

const { feedAuthorUser, studioUser } = require("../../api/scripts/test-env.cjs");
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const webBaseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";
const apiBaseUrl = process.env.HISTORA_API_URL || "http://127.0.0.1:4000/api";

const ownerUser = studioUser;
const collaboratorUser = feedAuthorUser;

async function loadSession(email) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for collaborative studio regression.");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
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
  await page.waitForURL(new RegExp(path.basename(nextPath) ? nextPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "/"), {
    timeout: 10000
  }).catch(() => undefined);
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

async function delayRoute(route, ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await route.continue();
}

async function run() {
  const [ownerSession, collaboratorSession] = await Promise.all([
    loadSession(ownerUser.email),
    loadSession(collaboratorUser.email)
  ]);
  const updatedBodyText = "Owner appended this sentence in collaborative studio to prove the latest version can be loaded safely.";

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  const ownerContext = await browser.newContext();
  const collaboratorContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const collaboratorPage = await collaboratorContext.newPage();

  await ownerPage.route(`${apiBaseUrl}/stories`, async (route) => {
    if (route.request().method() === "POST") {
      await delayRoute(route, 350);
      return;
    }

    await route.continue();
  });

  await ownerPage.route(`${apiBaseUrl}/profile/invites`, async (route) => {
    if (route.request().method() === "POST") {
      await delayRoute(route, 350);
      return;
    }

    await route.continue();
  });

  await bootstrapSession(ownerPage, ownerUser, ownerSession, "/profile");
  await ownerPage.getByRole("button", { name: /create collab draft/i }).waitFor({ state: "visible", timeout: 15000 });

  await ownerPage.getByRole("button", { name: /create collab draft/i }).click();
  await ownerPage.getByRole("button", { name: /^creating\.\.\.$/i }).waitFor({ state: "visible", timeout: 5000 });
  await ownerPage.getByRole("button", { name: /^create collab draft$/i }).waitFor({ state: "visible", timeout: 15000 });

  const selectedStoryId = await ownerPage.getByLabel(/story to collaborate on/i).inputValue();
  if (!selectedStoryId) {
    throw new Error("Profile collaboration card did not select a created draft story.");
  }

  await ownerPage.getByRole("button", { name: /open selected story/i }).click();
  await ownerPage.waitForURL(/\/studio\?storyId=/, { timeout: 15000 });
  await waitForEditor(ownerPage);

  if (await ownerPage.locator(".studio-collaboration-panel").count()) {
    throw new Error("Fresh collaboration draft should open in normal studio before any collaborator accepts.");
  }

  await bootstrapSession(ownerPage, ownerUser, ownerSession, "/profile");
  await ownerPage.getByLabel(/invite email/i).fill(collaboratorUser.email);
  await ownerPage.getByRole("button", { name: /^send invite$/i }).click();
  await ownerPage.getByRole("button", { name: /^sending\.\.\.$/i }).waitFor({ state: "visible", timeout: 5000 });
  await ownerPage.getByRole("button", { name: /^send invite$/i }).waitFor({ state: "visible", timeout: 15000 });
  await ownerPage.locator(".profile-settings-list .profile-setting-row").filter({ hasText: collaboratorUser.email }).first().waitFor({
    state: "visible",
    timeout: 15000
  });

  await bootstrapSession(collaboratorPage, collaboratorUser, collaboratorSession, "/feed");
  await collaboratorPage.locator(".collaboration-sheet-modal").waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.getByRole("button", { name: /accept and start/i }).click();
  await collaboratorPage.waitForURL(/\/studio/, { timeout: 15000 });
  await waitForCollaborativeEditor(collaboratorPage);

  await bootstrapSession(ownerPage, ownerUser, ownerSession, `/studio?storyId=${selectedStoryId}`);
  await waitForCollaborativeEditor(ownerPage);

  const initialCollaboratorMeta = await collaboratorPage.locator(".studio-collaboration-panel").innerText();
  if (!initialCollaboratorMeta.includes("Revision")) {
    throw new Error(`Collaborative panel did not load on collaborator side: ${initialCollaboratorMeta}`);
  }

  const ownerStory = await apiRequest(`/stories/mine/${selectedStoryId}`, ownerSession.accessToken);
  await apiRequest(`/stories/${selectedStoryId}`, ownerSession.accessToken, {
    method: "PATCH",
    body: {
      title: ownerStory.title,
      summary: ownerStory.summary,
      visibility: ownerStory.visibility,
      anonymous: ownerStory.anonymous,
      allowedViewerIds: [],
      tags: ownerStory.tags || [],
      links: ownerStory.links || [],
      status: ownerStory.status,
      expectedRevision: ownerStory.collaborationRevision,
      chapters: ownerStory.chapters.map((chapter, index) => ({
        id: chapter.id,
        title: chapter.title,
        body:
          index === 0
            ? `${chapter.body}<p>${updatedBodyText}</p>`
            : chapter.body,
        type: chapter.type,
        order: index + 1,
        imageUrls: chapter.imageKeys || [],
        voiceNoteUrl: chapter.voiceNoteKey || undefined,
        moments: (chapter.moments || []).map((moment) => ({
          id: moment.id,
          title: moment.title,
          description: moment.description,
          happenedAt: moment.happenedAt,
          imageUrls: moment.imageKeys || [],
          voiceNoteUrl: moment.voiceNoteKey || undefined
        }))
      }))
    }
  });

  await collaboratorPage.locator(".editor-surface").filter({ hasText: updatedBodyText }).waitFor({ state: "visible", timeout: 15000 });
  await collaboratorPage.waitForTimeout(1200);

  const ownerFalseUpdateSignal = await ownerPage.getByRole("button", { name: /sync latest now/i }).isVisible().catch(() => false);
  if (ownerFalseUpdateSignal) {
    throw new Error("Owner received a false collaborative update prompt after the collaborator auto-synced the latest version.");
  }

  const collaboratorBody = await collaboratorPage.locator(".editor-surface").innerText();
  if (!collaboratorBody.includes(updatedBodyText)) {
    throw new Error(`Collaborator did not load the latest body version: ${collaboratorBody}`);
  }

  const collaboratorAudit = await collaboratorPage.locator(".studio-collaboration-meta").first().innerText();
  if (!collaboratorAudit.toLowerCase().includes(ownerUser.username)) {
    throw new Error(`Collaborative edit attribution did not mention the owner editor: ${collaboratorAudit}`);
  }

  const collaboratorStory = await apiRequest(`/stories/mine/${selectedStoryId}`, collaboratorSession.accessToken);
  const collaboratorPrivacyAttempt = await apiRequest(`/stories/${selectedStoryId}`, collaboratorSession.accessToken, {
    method: "PATCH",
    body: {
      title: collaboratorStory.title,
      summary: collaboratorStory.summary,
      visibility: "public",
      anonymous: true,
      allowedViewerIds: [],
      tags: collaboratorStory.tags || [],
      links: collaboratorStory.links || [],
      status: collaboratorStory.status,
      expectedRevision: collaboratorStory.collaborationRevision,
      chapters: collaboratorStory.chapters.map((chapter, index) => ({
        id: chapter.id,
        title: chapter.title,
        body: chapter.body,
        type: chapter.type,
        order: index + 1,
        imageUrls: chapter.imageKeys || [],
        voiceNoteUrl: chapter.voiceNoteKey || undefined,
        moments: (chapter.moments || []).map((moment) => ({
          id: moment.id,
          title: moment.title,
          description: moment.description,
          happenedAt: moment.happenedAt,
          imageUrls: moment.imageKeys || [],
          voiceNoteUrl: moment.voiceNoteKey || undefined
        }))
      }))
    }
  });

  if (collaboratorPrivacyAttempt.visibility !== "private" || collaboratorPrivacyAttempt.anonymous !== false) {
    throw new Error(
      `Collaborator was able to change protected story controls: ${JSON.stringify({
        visibility: collaboratorPrivacyAttempt.visibility,
        anonymous: collaboratorPrivacyAttempt.anonymous
      })}`
    );
  }

  console.log(
    JSON.stringify(
      {
        storyId: selectedStoryId,
        collaboratorRevision: collaboratorPrivacyAttempt.collaborationRevision,
        collaboratorAudit,
        latestBodyLoaded: collaboratorBody.includes(updatedBodyText),
        ownerReceivedFalseUpdatePrompt: ownerFalseUpdateSignal,
        ownerOpenedNormalStudioBeforeAccept: true,
        privacyRemainedPrivate: collaboratorPrivacyAttempt.visibility === "private",
        anonymousRemainedFalse: collaboratorPrivacyAttempt.anonymous === false
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
