const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const uri =
  process.env.MONGODB_URI ||
  "mongodb://kingsleyudoma2018_db_user:uYCashSiOMEQikdZ@ac-owgrk1n-shard-00-00.hb3zcwk.mongodb.net:27017,ac-owgrk1n-shard-00-01.hb3zcwk.mongodb.net:27017,ac-owgrk1n-shard-00-02.hb3zcwk.mongodb.net:27017/?ssl=true&replicaSet=atlas-10zm3h-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Devcluster";

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

  const email = "studioe2e@gmail.com";
  const username = "studioe2e";
  const password = "TestPassword123";
  const deviceId = "test-device-000000000001";
  const deviceName = "Playwright Test Device";
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
    user.fullName = "Studio E2E";
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

  console.log(JSON.stringify({ email, password, deviceId, deviceName, userId: String(user._id) }));
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
