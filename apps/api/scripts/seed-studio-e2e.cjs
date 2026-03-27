const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const { mongoUri: uri, studioUser } = require("./test-env.cjs");

async function main() {
  await mongoose.connect(uri);

  const userSchema = new mongoose.Schema(
    {
      fullName: String,
      username: String,
      email: String,
      passwordHash: String,
      emailVerified: Boolean,
      emailVerifiedAt: Date,
      subscriptionTier: String,
      profileVisibility: String,
      defaultStoryVisibility: String,
      allowCommentsByDefault: Boolean,
      allowHelpRequests: Boolean,
      hideReadCounts: Boolean,
      showAnonymousActivity: Boolean,
      isAnonymousPostingEnabled: Boolean,
      selectedViewerIds: [mongoose.Schema.Types.ObjectId]
    },
    { timestamps: true, collection: "users" }
  );

  const trustedSchema = new mongoose.Schema(
    {
      userId: mongoose.Schema.Types.ObjectId,
      deviceKeyHash: String,
      label: String,
      userAgent: String,
      lastIpAddress: String,
      approvedAt: Date,
      lastSeenAt: Date,
      revokedAt: Date
    },
    { timestamps: true, collection: "trusteddevices" }
  );

  const User = mongoose.models.SeedUser || mongoose.model("SeedUser", userSchema);
  const Trusted = mongoose.models.SeedTrustedDevice || mongoose.model("SeedTrustedDevice", trustedSchema);

  const email = studioUser.email;
  const username = studioUser.username;
  const password = studioUser.password;
  const deviceId = studioUser.deviceIdentity.deviceId;
  const deviceName = studioUser.deviceIdentity.deviceName;
  const passwordHash = await bcrypt.hash(password, 12);

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      fullName: "Studio E2E",
      username,
      email,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      subscriptionTier: "free",
      profileVisibility: "public",
      defaultStoryVisibility: "selected",
      allowCommentsByDefault: true,
      allowHelpRequests: true,
      hideReadCounts: false,
      showAnonymousActivity: true,
      isAnonymousPostingEnabled: true,
      selectedViewerIds: []
    });
  } else {
    user.passwordHash = passwordHash;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.subscriptionTier = "free";
    user.username = username;
    user.fullName = studioUser.displayName;
    await user.save();
  }

  const deviceKeyHash = crypto.createHash("sha256").update(deviceId).digest("hex");
  await Trusted.findOneAndUpdate(
    { userId: user._id, deviceKeyHash },
    {
      $set: {
        label: deviceName,
        userAgent: "Playwright",
        lastIpAddress: "127.0.0.1",
        approvedAt: new Date(),
        lastSeenAt: new Date(),
        revokedAt: null
      }
    },
    { upsert: true, new: true }
  );

  console.log(JSON.stringify({ email, username, deviceId, deviceName, userId: String(user._id) }));
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  });
