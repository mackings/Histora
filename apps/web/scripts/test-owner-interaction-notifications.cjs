const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");

const { feedAuthorUser, studioUser } = require("../../api/scripts/test-env.cjs");
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const baseUrl = process.env.HISTORA_WEB_URL || "http://localhost:3000";

const authorUser = feedAuthorUser;
const actorUser = studioUser;

async function ensureMongo() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for the owner notification regression.");
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}

async function loadUser(email) {
  await ensureMongo();
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

  return user;
}

async function loadSession(email) {
  const user = await loadUser(email);
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

async function seedStory(author, options) {
  const now = new Date();
  const storyDoc = {
    authorId: author._id,
    authorName: options.anonymous ? "Anonymous" : author.fullName,
    authorUsername: options.anonymous ? "anonymous" : author.username,
    slug: options.slug,
    status: "published",
    title: options.title,
    summary: options.summary,
    coverImageUrl: null,
    visibility: "public",
    anonymous: options.anonymous,
    allowedViewerIds: [],
    tags: ["playwright", "notifications"],
    links: [],
    chapters: [
      {
        title: "Chapter 1",
        body: options.body,
        type: options.anonymous ? "anonymous" : "memory",
        order: 1,
        imageUrls: [],
        voiceNoteUrl: null,
        moments: []
      }
    ],
    readCount: 0,
    reactionsCount: 0,
    likesCount: 0,
    bookmarksCount: 0,
    sharesCount: 0,
    commentsCount: 0,
    createdAt: now,
    updatedAt: now
  };

  await mongoose.connection.collection("stories").updateOne(
    { slug: options.slug },
    {
      $set: storyDoc
    },
    { upsert: true }
  );

  const story = await mongoose.connection.collection("stories").findOne(
    { slug: options.slug },
    { projection: { _id: 1, slug: 1, title: 1, anonymous: 1 } }
  );

  if (!story) {
    throw new Error(`Could not seed story ${options.slug}.`);
  }

  await mongoose.connection.collection("comments").deleteMany({
    targetType: "storyChapter",
    targetId: `${String(story._id)}:1`
  });
  await mongoose.connection.collection("storyinteractions").deleteMany({ storyId: story._id });

  return {
    id: String(story._id),
    slug: story.slug,
    title: story.title,
    anonymous: story.anonymous
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

async function waitForToast(page, expectedText, timeout = 12000) {
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

  throw new Error(`Notification toast did not arrive. expected=${expectedText}`);
}

async function openStory(page, slug) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/feed/story/${slug}`);
  await page.waitForURL(new RegExp(`/feed/story/${slug}$`), { timeout: 10000 });
  try {
    await page.locator(".story-reader-stage h1").waitFor({ state: "visible", timeout: 15000 });
  } catch {
    const probe = await page.evaluate(() => ({
      url: window.location.pathname,
      bodyPreview: document.body.innerText.slice(0, 2500)
    }));
    throw new Error(`Story page did not open for slug=${slug}. ${JSON.stringify(probe)}`);
  }
}

async function likeStory(page) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/stories/") && response.url().includes("/reactions") && response.request().method() === "POST",
    { timeout: 10000 }
  );
  await page.locator(".story-reader-stage-actions button").first().click();
  const response = await responsePromise;
  return {
    status: response.status(),
    body: await response.text().catch(() => "")
  };
}

async function commentOnStory(page, text) {
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/comments") && response.request().method() === "POST",
    { timeout: 10000 }
  );
  await page.locator(".feed-thread-reply textarea").first().fill(text);
  await page.locator(".feed-thread-reply button").first().click();
  const response = await responsePromise;
  return {
    status: response.status(),
    body: await response.text().catch(() => "")
  };
}

async function shareStory(page, storyId, accessToken) {
  return page.evaluate(
    async ({ id, token }) => {
      const response = await fetch(`http://localhost:4000/api/stories/${id}/share`, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Requested-With": "XMLHttpRequest"
        }
      });

      return {
        status: response.status,
        body: await response.text()
      };
    },
    { id: storyId, token: accessToken }
  );
}

async function run() {
  const author = await loadUser(authorUser.email);
  const [authorSession, actorSession] = await Promise.all([loadSession(authorUser.email), loadSession(actorUser.email)]);
  const timestamp = Date.now();

  const publicStory = await seedStory(author, {
    slug: `playwright-notify-public-${timestamp}`,
    title: `Playwright notify public ${timestamp}`,
    summary: "Published public story for owner notification regression coverage.",
    body: "This public story exists to verify that the owner receives realtime notifications for likes, comments, and shares.",
    anonymous: false
  });
  const anonymousStory = await seedStory(author, {
    slug: `playwright-notify-anon-${timestamp}`,
    title: `Playwright notify anonymous ${timestamp}`,
    summary: "Published anonymous story for owner notification regression coverage.",
    body: "This anonymous story exists to verify that the owner receives realtime notifications for anonymous likes, comments, and shares.",
    anonymous: true
  });

  const browserA = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const browserB = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const authorPage = await browserA.newPage();
  const actorPage = await browserB.newPage();

  try {
    await bootstrapSession(authorPage, authorUser, authorSession);
    await bootstrapSession(actorPage, actorUser, actorSession);
    await authorPage.waitForTimeout(1500);
    await actorPage.waitForTimeout(1500);

    await openStory(actorPage, publicStory.slug);
    const publicLike = await likeStory(actorPage);
    const publicLikeToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) liked your post "${publicStory.title}".`);

    const publicCommentText = `Playwright public comment ${timestamp}`;
    const publicComment = await commentOnStory(actorPage, publicCommentText);
    const publicCommentToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) commented on your post "${publicStory.title}".`);

    const publicShare = await shareStory(actorPage, publicStory.id, actorSession.accessToken);
    const publicShareToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) shared your post "${publicStory.title}".`);

    await openStory(actorPage, anonymousStory.slug);
    const anonymousLike = await likeStory(actorPage);
    const anonymousLikeToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) liked your anonymous post "${anonymousStory.title}".`);

    const anonymousCommentText = `Playwright anonymous comment ${timestamp}`;
    const anonymousComment = await commentOnStory(actorPage, anonymousCommentText);
    const anonymousCommentToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) commented on your anonymous post "${anonymousStory.title}".`);

    const anonymousShare = await shareStory(actorPage, anonymousStory.id, actorSession.accessToken);
    const anonymousShareToast = await waitForToast(authorPage, `${actorUser.displayName} (@${actorUser.username}) shared your anonymous post "${anonymousStory.title}".`);

    console.log(
      JSON.stringify(
        {
          publicStory,
          anonymousStory,
          public: {
            likeResponse: publicLike,
            likeToast: publicLikeToast,
            commentResponse: publicComment,
            commentToast: publicCommentToast,
            shareResponse: publicShare,
            shareToast: publicShareToast
          },
          anonymous: {
            likeResponse: anonymousLike,
            likeToast: anonymousLikeToast,
            commentResponse: anonymousComment,
            commentToast: anonymousCommentToast,
            shareResponse: anonymousShare,
            shareToast: anonymousShareToast
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
