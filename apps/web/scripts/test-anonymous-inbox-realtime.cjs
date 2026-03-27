const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");

const { feedAuthorUser, studioUser } = require("../../api/scripts/test-env.cjs");
const jwt = require(path.resolve(__dirname, "../../../node_modules/jsonwebtoken"));
const mongoose = require(path.resolve(__dirname, "../../api/node_modules/mongoose"));

const baseUrl = process.env.HISTORA_WEB_URL || "http://127.0.0.1:3000";

const recipientUser = studioUser;
const senderUser = feedAuthorUser;

async function loadSession(email) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("Missing MONGODB_URI or JWT_SECRET for anonymous inbox realtime regression.");
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

async function bootstrapSession(page, user, session, pathName) {
  await page.goto(`${baseUrl}/signin`, { waitUntil: "networkidle" });
  await page.evaluate(
    ({ identity, authSession, nextPath }) => {
      window.localStorage.setItem("histora-device-identity-v1", JSON.stringify(identity));
      window.dispatchEvent(new CustomEvent("histora-auth-session", { detail: authSession }));
      window.history.pushState({}, "", nextPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    { identity: user.deviceIdentity, authSession: session, nextPath: pathName }
  );
  await page.waitForURL(new RegExp(`${pathName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 10000 });
  await page.waitForLoadState("networkidle");
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const [recipientSession, senderSession] = await Promise.all([
    loadSession(recipientUser.email),
    loadSession(senderUser.email)
  ]);

  const recipientContext = await browser.newContext();
  const senderContext = await browser.newContext();
  const recipientPage = await recipientContext.newPage();
  const senderPage = await senderContext.newPage();

  let inboxApiHits = 0;
  await recipientPage.route("**/api/anonymous-messages/inbox", async (route) => {
    inboxApiHits += 1;
    await route.continue();
  });

  await bootstrapSession(recipientPage, recipientUser, recipientSession, "/anonymous");
  await bootstrapSession(senderPage, senderUser, senderSession, `/anonymous/write/${recipientUser.username}`);

  await recipientPage.waitForTimeout(1200);
  const initialInboxApiHits = inboxApiHits;

  const messageBody = `Playwright anonymous realtime ${Date.now()} keeps the recipient inbox live without another inbox fetch.`;
  await senderPage.getByLabel("Message").fill(messageBody);
  await senderPage.getByRole("button", { name: /^send anonymous message$/i }).click();
  await senderPage.waitForURL(/\/anonymous$/, { timeout: 15000 });
  await senderPage.waitForLoadState("networkidle");

  const recipientCard = recipientPage.locator(".anonymous-hub-card").filter({ hasText: messageBody }).first();
  const startedAt = Date.now();
  await recipientCard.waitFor({ state: "visible", timeout: 15000 });
  const realtimeLatencyMs = Date.now() - startedAt;

  if (inboxApiHits !== initialInboxApiHits) {
    throw new Error(`Recipient inbox refetched after realtime delivery. ${JSON.stringify({ initialInboxApiHits, inboxApiHits })}`);
  }

  const senderSuccessFlashCount = await senderPage.getByText("Anonymous message sent. The recipient can now review it in their anonymous inbox.").count();
  if (senderSuccessFlashCount !== 0) {
    throw new Error("Transient anonymous send success flash is still rendered.");
  }

  console.log(
    JSON.stringify(
      {
        messageBody,
        initialInboxApiHits,
        inboxApiHits,
        realtimeLatencyMs,
        senderLandedOn: new URL(senderPage.url()).pathname
      },
      null,
      2
    )
  );

  await recipientContext.close();
  await senderContext.close();
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
