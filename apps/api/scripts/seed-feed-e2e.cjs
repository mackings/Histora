const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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

  const momentSchema = new mongoose.Schema(
    {
      title: String,
      description: String,
      happenedAt: Date,
      imageUrls: [String],
      voiceNoteUrl: String
    },
    { _id: false }
  );

  const chapterSchema = new mongoose.Schema(
    {
      title: String,
      body: String,
      type: String,
      order: Number,
      imageUrls: [String],
      voiceNoteUrl: String,
      moments: [momentSchema]
    },
    { _id: false }
  );

  const storySchema = new mongoose.Schema(
    {
      authorId: mongoose.Schema.Types.ObjectId,
      authorName: String,
      authorUsername: String,
      slug: String,
      status: String,
      title: String,
      summary: String,
      coverImageUrl: String,
      visibility: String,
      anonymous: Boolean,
      allowedViewerIds: [mongoose.Schema.Types.ObjectId],
      tags: [String],
      chapters: [chapterSchema],
      readCount: Number,
      reactionsCount: Number,
      likesCount: Number,
      bookmarksCount: Number,
      commentsCount: Number
    },
    { timestamps: true, collection: "stories" }
  );

  const User = mongoose.models.FeedSeedUser || mongoose.model("FeedSeedUser", userSchema);
  const Story = mongoose.models.FeedSeedStory || mongoose.model("FeedSeedStory", storySchema);

  const email = "feedauthor@gmail.com";
  const username = "feedauthor";
  const passwordHash = await bcrypt.hash("AuthorPass123", 12);

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      fullName: "Feed Author",
      username,
      email,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      subscriptionTier: "free",
      profileVisibility: "public",
      defaultStoryVisibility: "public",
      allowCommentsByDefault: true,
      allowHelpRequests: true,
      hideReadCounts: false,
      showAnonymousActivity: true,
      isAnonymousPostingEnabled: true,
      selectedViewerIds: []
    });
  } else {
    user.fullName = "Feed Author";
    user.username = username;
    user.passwordHash = passwordHash;
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
  }

  const storyPayload = {
    authorId: user._id,
    authorName: "Feed Author",
    authorUsername: username,
    slug: "feed-author-public-story",
    status: "published",
    title: "Feed author public story",
    summary:
      "This public story exists specifically to verify the feed interaction flow for likes, bookmarks, comments, and follow actions from another account in a realistic end to end browser test.",
    coverImageUrl: "users/feedauthor/cover-test.png",
    visibility: "public",
    anonymous: false,
    allowedViewerIds: [],
    tags: ["testing"],
    chapters: [
      {
        title: "Chapter 1",
        body:
          "This chapter is long enough to be a realistic feed target. It gives the test account something to like, bookmark, and comment on while also exposing the author identity for follow and unfollow verification.",
        type: "memory",
        order: 1,
        imageUrls: [],
        voiceNoteUrl: undefined,
        moments: []
      }
    ],
    readCount: 0,
    reactionsCount: 0,
    likesCount: 0,
    bookmarksCount: 0,
    commentsCount: 0
  };

  await Story.findOneAndUpdate({ slug: storyPayload.slug }, { $set: storyPayload }, { upsert: true, new: true });

  console.log(JSON.stringify({ email, username, slug: storyPayload.slug }));
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
