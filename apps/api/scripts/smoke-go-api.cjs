#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");

const repoRoot = path.resolve(__dirname, "../../..");
const envPath = path.join(repoRoot, "apps/api/.env");

const readEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) {
          return [line, ""];
        }
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );
};

const fileEnv = readEnvFile(envPath);
const apiBaseUrl = (process.env.GO_API_BASE_URL || "https://histora-go-api.onrender.com/api").replace(/\/$/, "");
const serviceBaseUrl = apiBaseUrl.replace(/\/api$/, "");
const mongoURI = process.env.MONGODB_URI || fileEnv.MONGODB_URI;
const origin = process.env.GO_API_SMOKE_ORIGIN || "https://thehistora.vercel.app";
const runID = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const smokeEmail = `codex-go-smoke-${runID}@example.com`;
const smokeUsername = `gosmoke${runID.replace(/[^a-z0-9]/gi, "").slice(-10)}`.slice(0, 20).toLowerCase();
const smokePassword = "SmokePass12345!";
const trustedDeviceID = `codex-trusted-${runID}`;
const untrustedDeviceID = `codex-untrusted-${runID}`;
const deviceName = "Codex API smoke device";
const results = [];

if (!mongoURI) {
  console.error("MONGODB_URI is required for authenticated smoke setup.");
  process.exit(1);
}

const hashString = (value) => crypto.createHash("sha256").update(value).digest("hex");

const databaseNameFromURI = (uri) => {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\/+/, "").trim();
    return dbName || "histora";
  } catch {
    return "histora";
  }
};

const request = async (pathName, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);
  const headers = {
    Origin: origin,
    ...(options.body ? { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };
  const started = Date.now();
  try {
    const response = await fetch(`${apiBaseUrl}${pathName}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - started,
      json,
      text
    };
  } finally {
    clearTimeout(timer);
  }
};

const serviceRequest = async (pathName) => {
  const started = Date.now();
  const response = await fetch(`${serviceBaseUrl}${pathName}`, { headers: { Origin: origin } });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, ok: response.ok, durationMs: Date.now() - started, json, text };
};

const check = async (name, fn, expectedStatuses) => {
  try {
    const result = await fn();
    const expected = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
    const pass = expected.includes(result.status);
    results.push({
      name,
      pass,
      status: result.status,
      expected,
      durationMs: result.durationMs,
      code: result.json?.code,
      error: result.json?.error || result.json?.message || null
    });
    return result;
  } catch (error) {
    results.push({
      name,
      pass: false,
      status: "error",
      expected: Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses],
      durationMs: null,
      code: error.name,
      error: error.message
    });
    return null;
  }
};

const main = async () => {
  const mongo = new MongoClient(mongoURI);
  await mongo.connect();
  const db = mongo.db(databaseNameFromURI(mongoURI));
  const users = db.collection("users");
  const trustedDevices = db.collection("trusteddevices");
  const sessions = db.collection("sessions");
  const statuses = db.collection("statuses");
  const stories = db.collection("stories");
  const now = new Date();
  let smokeUserID = null;
  let accessToken = null;

  const cleanup = async () => {
    if (smokeUserID) {
      await Promise.allSettled([
        sessions.deleteMany({ userId: smokeUserID }),
        trustedDevices.deleteMany({ userId: smokeUserID }),
        db.collection("emailverificationtokens").deleteMany({ userId: smokeUserID }),
        db.collection("deviceverificationchallenges").deleteMany({ userId: smokeUserID }),
        db.collection("passwordresettokens").deleteMany({ userId: smokeUserID }),
        statuses.deleteMany({ authorId: smokeUserID }),
        stories.deleteMany({ authorId: smokeUserID }),
        db.collection("comments").deleteMany({ authorId: smokeUserID }),
        db.collection("anonymousmessages").deleteMany({
          $or: [{ senderUserId: smokeUserID }, { recipientUserId: smokeUserID }]
        }),
        users.deleteOne({ _id: smokeUserID })
      ]);
    }
    await mongo.close();
  };

  try {
    await check("GET /health", () => serviceRequest("/health"), 200);
    await check("GET /", () => serviceRequest("/"), 200);
    await check("GET /stories/feed", () => request("/stories/feed"), 200);
    await check("GET /statuses", () => request("/statuses"), 200);
    await check("POST /auth/login invalid credentials", () => request("/auth/login", {
      method: "POST",
      body: { email: smokeEmail, password: "wrong", deviceId: trustedDeviceID, deviceName }
    }), 401);
    await check("POST /auth/refresh without cookie", () => request("/auth/refresh", { method: "POST" }), 401);
    await check("GET /auth/me without token", () => request("/auth/me"), 401);
    await check("POST /auth/forgot-password unknown email", () => request("/auth/forgot-password", {
      method: "POST",
      body: { email: smokeEmail }
    }), 200);
    await check("POST /auth/resend-device-verification unknown email", () => request("/auth/resend-device-verification", {
      method: "POST",
      body: { email: smokeEmail, deviceId: trustedDeviceID, deviceName }
    }), 200);

    await check("POST /auth/register sends email", () => request("/auth/register", {
      method: "POST",
      body: {
        fullName: "Codex Go Smoke",
        username: smokeUsername,
        email: smokeEmail,
        password: smokePassword,
        dateOfBirth: "1998-01-01"
      },
      timeoutMs: 30000
    }), 201);

    const existing = await users.findOne({ email: smokeEmail });
    smokeUserID = existing?._id || new ObjectId();
    const passwordHash = await bcrypt.hash(smokePassword, 12);
    await users.updateOne(
      { email: smokeEmail },
      {
        $set: {
          fullName: "Codex Go Smoke",
          username: smokeUsername,
          email: smokeEmail,
          passwordHash,
          emailVerified: true,
          emailVerifiedAt: now,
          subscriptionTier: "free",
          defaultStoryVisibility: "selected",
          allowCommentsByDefault: true,
          updatedAt: now
        },
        $setOnInsert: {
          _id: smokeUserID,
          createdAt: now
        }
      },
      { upsert: true }
    );
    const preparedUser = await users.findOne({ email: smokeEmail });
    if (!preparedUser) {
      throw new Error("Smoke user setup failed.");
    }
    smokeUserID = preparedUser._id;
    await trustedDevices.updateOne(
      { userId: smokeUserID, deviceKeyHash: hashString(trustedDeviceID) },
      {
        $set: {
          label: deviceName,
          userAgent: "Codex smoke",
          lastIpAddress: "127.0.0.1",
          approvedAt: now,
          lastSeenAt: now,
          revokedAt: null,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );

    const login = await check("POST /auth/login trusted device", () => request("/auth/login", {
      method: "POST",
      body: { email: smokeEmail, password: smokePassword, deviceId: trustedDeviceID, deviceName }
    }), 200);
    accessToken = login?.json?.accessToken;

    await check("POST /auth/login untrusted device sends OTP", () => request("/auth/login", {
      method: "POST",
      body: { email: smokeEmail, password: smokePassword, deviceId: untrustedDeviceID, deviceName: "Untrusted smoke device" },
      timeoutMs: 30000
    }), 403);
    await check("POST /auth/resend-device-verification sends OTP", () => request("/auth/resend-device-verification", {
      method: "POST",
      body: { email: smokeEmail, deviceId: untrustedDeviceID, deviceName: "Untrusted smoke device" },
      timeoutMs: 30000
    }), 200);

    if (accessToken) {
      await check("GET /auth/me", () => request("/auth/me", { token: accessToken }), 200);
      await check("POST /auth/ws-ticket events", () => request("/auth/ws-ticket", {
        method: "POST",
        token: accessToken,
        body: { scope: "events" }
      }), 200);
      await check("GET /profile/me", () => request("/profile/me", { token: accessToken }), 200);
      await check("GET /profile/sessions", () => request("/profile/sessions", { token: accessToken }), 200);
      await check("GET /profile/devices", () => request("/profile/devices", { token: accessToken }), 200);
      await check("GET /profile/push/public-key", () => request("/profile/push/public-key", { token: accessToken }), 200);
      await check("GET /profile/invites", () => request("/profile/invites", { token: accessToken }), 200);
      await check("GET /profile/invites/incoming", () => request("/profile/invites/incoming", { token: accessToken }), 200);
      await check("GET /profile/saved", () => request("/profile/saved", { token: accessToken }), 200);
      await check("GET /profile/followers", () => request("/profile/followers", { token: accessToken }), 200);
      await check("GET /profile/following", () => request("/profile/following", { token: accessToken }), 200);
      await check("GET /stories/mine", () => request("/stories/mine", { token: accessToken }), 200);
      await check("GET /stories/collaborative", () => request("/stories/collaborative", { token: accessToken }), 200);
      await check("GET /statuses/mine", () => request("/statuses/mine", { token: accessToken }), 200);
      const status = await check("POST /statuses", () => request("/statuses", {
        method: "POST",
        token: accessToken,
        body: { body: `Codex Go smoke status ${runID}`, visibility: "private", anonymous: false }
      }), 201);
      if (status?.json?.id) {
        await check("POST /statuses/:id/reactions", () => request(`/statuses/${status.json.id}/reactions`, {
          method: "POST",
          token: accessToken,
          body: { action: "like" }
        }), 200);
        await check("DELETE /statuses/:id", () => request(`/statuses/${status.json.id}`, {
          method: "DELETE",
          token: accessToken
        }), 200);
      }
      await check("GET /anonymous-messages/inbox", () => request("/anonymous-messages/inbox", { token: accessToken }), 200);
      await check("GET /anonymous-messages/sent", () => request("/anonymous-messages/sent", { token: accessToken }), 200);
      await check("GET /transcriptions/token", () => request("/transcriptions/token", { token: accessToken }), [200, 503]);
      await check("POST /auth/logout", () => request("/auth/logout", { method: "POST", token: accessToken }), 200);
    }
  } finally {
    await cleanup();
  }

  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  console.table(results.map(({ name, pass, status, expected, durationMs, code, error }) => ({
    name,
    pass,
    status,
    expected: expected.join(","),
    durationMs,
    code: code || "",
    error: error || ""
  })));
  console.log(JSON.stringify({ apiBaseUrl, passed, failed, total: results.length }, null, 2));
  if (failed > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
