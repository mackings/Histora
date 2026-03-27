const path = require("path");

const dotenv = require(path.resolve(__dirname, "../../../node_modules/dotenv"));

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function readRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOptionalEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

const studioUser = {
  email: readOptionalEnv("HISTORA_STUDIO_E2E_EMAIL", "studioe2e@gmail.com"),
  username: readOptionalEnv("HISTORA_STUDIO_E2E_USERNAME", "studioe2e"),
  displayName: readOptionalEnv("HISTORA_STUDIO_E2E_DISPLAY_NAME", "Studio E2E"),
  password: readRequiredEnv("HISTORA_STUDIO_E2E_PASSWORD"),
  deviceIdentity: {
    deviceId: readOptionalEnv("HISTORA_STUDIO_E2E_DEVICE_ID", "test-device-000000000001"),
    deviceName: readOptionalEnv("HISTORA_STUDIO_E2E_DEVICE_NAME", "Playwright Test Device")
  }
};

const feedAuthorUser = {
  email: readOptionalEnv("HISTORA_FEED_E2E_EMAIL", "feedauthor@gmail.com"),
  username: readOptionalEnv("HISTORA_FEED_E2E_USERNAME", "feedauthor"),
  displayName: readOptionalEnv("HISTORA_FEED_E2E_DISPLAY_NAME", "Feed Author"),
  password: readRequiredEnv("HISTORA_FEED_E2E_PASSWORD"),
  deviceIdentity: {
    deviceId: readOptionalEnv("HISTORA_FEED_E2E_DEVICE_ID", "test-device-000000000002"),
    deviceName: readOptionalEnv("HISTORA_FEED_E2E_DEVICE_NAME", "Playwright Feed Author Device")
  }
};

const archiveUser = {
  email: readOptionalEnv("HISTORA_ARCHIVE_SEED_EMAIL", "archive@histora.app"),
  username: readOptionalEnv("HISTORA_ARCHIVE_SEED_USERNAME", "historaarchive"),
  displayName: readOptionalEnv("HISTORA_ARCHIVE_SEED_DISPLAY_NAME", "Histora Archive"),
  password: readRequiredEnv("HISTORA_ARCHIVE_SEED_PASSWORD")
};

module.exports = {
  mongoUri: readRequiredEnv("MONGODB_URI"),
  studioUser,
  feedAuthorUser,
  archiveUser
};
