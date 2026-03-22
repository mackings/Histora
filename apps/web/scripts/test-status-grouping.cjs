const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");

const dotenv = require(path.resolve(__dirname, "../../../node_modules/dotenv"));
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";
const imageBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRkQAAAABJRU5ErkJggg==",
  "base64"
);

dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });

const authorUser = {
  email: "studioe2e@gmail.com",
  displayName: "Studio E2E",
  statusLabel: "@studioe2e",
  deviceIdentity: {
    deviceId: "test-device-000000000001",
    deviceName: "Playwright Test Device"
  }
};

const viewerUser = {
  email: "feedauthor@gmail.com",
  displayName: "Feed Author",
  username: "feedauthor",
  deviceIdentity: {
    deviceId: "test-device-000000000002",
    deviceName: "Playwright Feed Author Device"
  }
};

async function loadSession(email) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for the status regression.");
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

async function bootstrapSession(page, user, session) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ identity, authSession }) => {
      window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
      window.dispatchEvent(new CustomEvent("histora-auth-session", { detail: authSession }));
      window.history.pushState({}, "", "/feed");
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    { identity: user.deviceIdentity, authSession: session }
  );
  await page.waitForURL(/\/feed$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
}

async function installStatusImageStubs(page) {
  await page.route("**/api/media/signed-upload", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadUrl: `${baseUrl}/playwright-upload/status-photo.png`,
        objectKey: "playwright/status-photo.png",
        publicUrl: `${baseUrl}/playwright-status-photo.png`
      })
    });
  });

  await page.route("**/playwright-upload/status-photo.png", async (route) => {
    await route.fulfill({
      status: 200,
      body: ""
    });
  });

  await page.route("**/playwright-status-photo.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: imageBuffer
    });
  });
}

async function waitForPostButtonEnabled(page, timeout = 20000) {
  const postButton = page.getByRole("button", { name: /^Post status$/i });
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (!(await postButton.isDisabled())) {
      return Date.now() - startedAt;
    }
    await page.waitForTimeout(150);
  }

  throw new Error("Status image upload did not finish in time.");
}

async function postStatusWithImage(page, text) {
  await page.locator(".my-status-bubble-shell .status-bubble-add-button").click();
  await page.locator(".status-composer").waitFor({ state: "visible", timeout: 10000 });

  const voiceButtonCount = await page.getByRole("button", { name: /^voice$/i }).count();
  const mentionButtonCount = await page.getByRole("button", { name: /^mention$/i }).count();
  const previewSectionCount = await page.locator(".status-compose-preview").count();
  if (voiceButtonCount !== 0 || mentionButtonCount !== 0 || previewSectionCount !== 0) {
    throw new Error(
      `Status composer still exposes removed controls. voice=${voiceButtonCount} mention=${mentionButtonCount} preview=${previewSectionCount}`
    );
  }

  await page.locator(".status-compose-input").fill(text);
  await page.locator('input[type="file"]').setInputFiles({
    name: "status-photo.png",
    mimeType: "image/png",
    buffer: imageBuffer
  });
  await page.locator(".status-photo-preview").waitFor({ state: "visible", timeout: 10000 });

  const composerText = await page.locator(".status-composer").innerText();
  if (/uploading/i.test(composerText)) {
    throw new Error(`Status composer still shows an uploading label: ${composerText}`);
  }

  const uploadReadyMs = await waitForPostButtonEnabled(page);
  const statusPostResponsePromise = page
    .waitForResponse((response) => response.url().includes("/api/statuses") && response.request().method() === "POST", {
      timeout: 8000
    })
    .catch(() => null);
  await page.getByRole("button", { name: /^Post status$/i }).click({ force: true });
  try {
    await page.locator(".status-story-viewer").waitFor({ state: "visible", timeout: 20000 });
  } catch (error) {
    const statusPostResponse = await statusPostResponsePromise;
    const statusPostPayload = statusPostResponse
      ? {
          status: statusPostResponse.status(),
          body: await statusPostResponse.text().catch(() => "")
        }
      : null;
    const probe = await page.evaluate(() => ({
      bodyPreview: document.body.innerText.slice(0, 2500),
      feedback: document.querySelector(".status-feedback")?.textContent?.trim() ?? null,
      composerVisible: Boolean(document.querySelector(".status-composer")),
      toast: document.querySelector(".bottom-toast")?.textContent?.trim() ?? null
    }));
    throw new Error(`Status viewer did not open after posting. ${JSON.stringify({ probe, statusPostPayload })}`);
  }
  await page.locator(".status-story-viewer .status-stage-image").waitFor({ state: "visible", timeout: 10000 });

  return {
    uploadReadyMs,
    imageVisibleInComposer: true
  };
}

async function waitForImageOnlyStatus(page, authorName, timeout = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const bubble = page.locator(".status-scroll .status-bubble").filter({ hasText: authorName }).first();
    if ((await bubble.count()) > 0) {
      await bubble.click();
      const viewer = page.locator(".status-story-viewer");
      await viewer.waitFor({ state: "visible", timeout: 5000 });
      const imageVisible = await viewer.locator(".status-stage-image").first().isVisible().catch(() => false);
      const bodyCount = await viewer.locator(".story-stage-card p").count();
      const bodyText = bodyCount
        ? (await viewer.locator(".story-stage-card p").first().innerText().catch(() => "")).trim()
        : "";

      if (imageVisible && !bodyText) {
        return {
          latencyMs: Date.now() - startedAt,
          imageVisible,
          bodyText
        };
      }

      await closeStatusViewer(page);
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`Could not find the new image-only status from ${authorName} in time.`);
}

async function closeStatusViewer(page) {
  const closeButton = page.locator(".story-viewer-close-row button").first();
  if (await closeButton.count()) {
    await closeButton.click().catch(() => undefined);
  }
}

async function waitForStatusOnViewer(page, authorName, statusText, timeout = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const bubble = page.locator(".status-scroll .status-bubble").filter({ hasText: authorName }).first();
    if ((await bubble.count()) > 0) {
      await bubble.click();
      const viewer = page.locator(".status-story-viewer");
      await viewer.waitFor({ state: "visible", timeout: 5000 });
      const bodyText = (await viewer.locator(".story-stage-card p").first().innerText().catch(() => "")).trim();
      if (bodyText.includes(statusText)) {
        const tagCount = await viewer.locator(".story-stage-card .story-tag").count();
        const metricsCount = await viewer.locator(".story-stage-card .story-stage-metrics").count();
        const imageVisible = await viewer.locator(".status-stage-image").first().isVisible().catch(() => false);
        return {
          latencyMs: Date.now() - startedAt,
          bodyText,
          imageVisible,
          tagCount,
          metricsCount
        };
      }

      await closeStatusViewer(page);
    }

    await page.waitForTimeout(200);
  }

  throw new Error(`Could not find the new status from ${authorName} in time.`);
}

async function swipeStatusStage(page) {
  const stage = page.locator(".story-viewer-stage").first();
  const box = await stage.boundingBox();
  if (!box) {
    throw new Error("Could not measure the status stage for swipe testing.");
  }

  const startX = box.x + box.width * 0.82;
  const endX = box.x + box.width * 0.18;
  const y = box.y + box.height * 0.5;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();
}

async function waitForViewerBodyChange(page, previousBody, timeout = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const nextBody = (await page.locator(".story-stage-card p").first().innerText().catch(() => "")).trim();
    if (nextBody && nextBody !== previousBody) {
      return nextBody;
    }
    await page.waitForTimeout(150);
  }

  throw new Error("Status swipe did not advance the viewer body.");
}

async function reactToActiveStatus(page) {
  const reactionButton = page.locator(".story-react-row .story-reaction").last();
  const reactionResponsePromise = page
    .waitForResponse(
      (response) => response.url().includes("/reactions") && response.request().method() === "POST",
      { timeout: 8000 }
    )
    .catch(() => null);
  await reactionButton.click();
  await page.waitForTimeout(500);
  const reactionResponse = await reactionResponsePromise;
  return {
    feedback: (await page.locator(".status-feedback").first().innerText().catch(() => "reaction-clicked")).trim(),
    response: reactionResponse
      ? {
          status: reactionResponse.status(),
          body: await reactionResponse.text().catch(() => "")
        }
      : null
  };
}

async function waitForReactionToast(page, expectedText, timeout = 12000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    const toast = page.locator(".bottom-toast").first();
    if ((await toast.count()) > 0) {
      const body = (await toast.innerText().catch(() => "")).trim();
      if (body.includes(expectedText)) {
        return {
          latencyMs: Date.now() - startedAt,
          body
        };
      }
    }
    await page.waitForTimeout(150);
  }

  throw new Error(`Reaction toast did not arrive in time. expected=${expectedText}`);
}

async function waitForOwnerReactionCount(page, timeout = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    await page.locator(".my-status-bubble-shell .my-status-bubble").click();
    const reactionCount = (await page.locator(".status-reaction-count").first().innerText().catch(() => "")).trim();
    if (reactionCount.includes("1") && /reaction/i.test(reactionCount)) {
      return reactionCount;
    }
    await closeStatusViewer(page);
    await page.waitForTimeout(150);
  }

  throw new Error("Owner reaction count did not update on the status viewer.");
}

async function run() {
  const [authorSession, viewerSession] = await Promise.all([loadSession(authorUser.email), loadSession(viewerUser.email)]);
  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const pageA = await browserA.newPage();
  const pageB = await browserB.newPage();

  try {
    await bootstrapSession(pageA, authorUser, authorSession);
    await bootstrapSession(pageB, viewerUser, viewerSession);
    await installStatusImageStubs(pageA);
    await installStatusImageStubs(pageB);
    await pageA.locator(".my-status-bubble-shell .status-bubble").waitFor({ state: "visible", timeout: 20000 });
    await pageB.locator("section[aria-label='Status updates'] .status-scroll").waitFor({ state: "visible", timeout: 20000 });
    await pageA.waitForTimeout(1500);
    await pageB.waitForTimeout(1500);

    const statusText = `Status image background upload ${Date.now()}`;
    const postResult = await postStatusWithImage(pageA, statusText);
    await closeStatusViewer(pageA);

    const pageBViewer = await waitForStatusOnViewer(pageB, authorUser.statusLabel, statusText);
    if (!pageBViewer.imageVisible || pageBViewer.tagCount !== 0 || pageBViewer.metricsCount !== 0) {
      throw new Error(
        `Status viewer still shows extra chrome. image=${pageBViewer.imageVisible} tagCount=${pageBViewer.tagCount} metricsCount=${pageBViewer.metricsCount}`
      );
    }
    const navZoneCount = await pageB.locator(".story-nav-zone").count();
    if (navZoneCount !== 0) {
      throw new Error(`Status viewer still renders left/right click zones. count=${navZoneCount}`);
    }
    await swipeStatusStage(pageB);
    const swipedBody = await waitForViewerBodyChange(pageB, pageBViewer.bodyText);
    await closeStatusViewer(pageB);
    await waitForStatusOnViewer(pageB, authorUser.statusLabel, statusText);

    const reactionResult = await reactToActiveStatus(pageB);
    let reactionToast;
    try {
      reactionToast = await waitForReactionToast(pageA, `${viewerUser.displayName} (@${viewerUser.username}) reacted to your status.`);
    } catch (error) {
      const toastProbe = await pageA.evaluate(() => ({
        toast: document.querySelector(".bottom-toast")?.textContent?.trim() ?? null,
        bodyPreview: document.body.innerText.slice(0, 2000)
      }));
      throw new Error(`Reaction toast did not arrive. ${JSON.stringify({ reactionResult, toastProbe })}`);
    }
    await closeStatusViewer(pageB);
    const ownerReactionCount = await waitForOwnerReactionCount(pageA);
    await closeStatusViewer(pageA);

    const imageOnlyPost = await postStatusWithImage(pageA, "");
    await closeStatusViewer(pageA);
    const imageOnlyViewer = await waitForImageOnlyStatus(pageB, authorUser.statusLabel);
    await closeStatusViewer(pageB);

    console.log(
      JSON.stringify(
        {
          composer: {
            uploadReadyMs: postResult.uploadReadyMs,
            imageVisibleImmediately: postResult.imageVisibleInComposer,
            imageOnlyUploadReadyMs: imageOnlyPost.uploadReadyMs,
            removedControls: {
              voice: true,
              mention: true,
              preview: true
            }
          },
          statusPropagation: {
            latencyMs: pageBViewer.latencyMs,
            viewerBody: pageBViewer.bodyText,
            swipedBody,
            imageVisible: pageBViewer.imageVisible,
            extraLabelsRemoved: pageBViewer.tagCount === 0 && pageBViewer.metricsCount === 0,
            navZonesRemoved: navZoneCount === 0
          },
          reaction: {
            feedback: reactionResult.feedback,
            response: reactionResult.response,
            toastLatencyMs: reactionToast.latencyMs,
            toastBody: reactionToast.body,
            ownerReactionCount
          },
          imageOnlyStatus: {
            latencyMs: imageOnlyViewer.latencyMs,
            imageVisible: imageOnlyViewer.imageVisible,
            bodyText: imageOnlyViewer.bodyText
          }
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect().catch(() => undefined);
    await browserA.close().catch(() => undefined);
    await browserB.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
