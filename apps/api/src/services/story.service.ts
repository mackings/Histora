import type { StorySaveInput } from "../shared/index.js";

import { AppError } from "../utils/app-error.js";
import { StoryModel, type StoryDocument } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StoryInteractionModel } from "../models/story-interaction.model.js";
import { FollowModel } from "../models/follow.model.js";
import { readJsonCache, writeJsonCache, deleteCache, deleteCacheByPrefix } from "./cache.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { resolveStoredObjectUrl } from "./storage.service.js";
import { broadcastAppEvent } from "../realtime/app-events.js";

type StoryViewerState = {
  liked: boolean;
  bookmarked: boolean;
};

type StoryAuthorState = {
  authorVerified: boolean;
  following: boolean;
};

function enforcePremiumLimits(input: StorySaveInput, tier: "free" | "premium") {
  const totalImages = input.chapters.reduce<number>((sum, chapter) => sum + chapter.imageUrls.length, 0);
  const totalVoiceNotes = input.chapters.reduce<number>(
    (sum, chapter) => sum + (chapter.voiceNoteUrl ? 1 : 0),
    0
  );
  const totalChapters = input.chapters.length;

  if (tier === "free" && (totalImages > 2 || totalVoiceNotes > 1 || totalChapters > 2)) {
    throw new AppError("Free accounts can save up to 2 images, 1 voice note, and 2 chapters per story.", 403);
  }
}

function slugifyStoryTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

async function buildUniqueStorySlug(title: string, storyId?: string) {
  const baseSlug = slugifyStoryTitle(title) || "story";
  let nextSlug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await StoryModel.findOne({ slug: nextSlug }).select("_id");
    if (!existing || existing.id === storyId) {
      return nextSlug;
    }

    suffix += 1;
    nextSlug = `${baseSlug}-${suffix}`;
  }
}

async function serializeStory(story: StoryDocument | null) {
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  const coverImageUrl = await resolveStoredObjectUrl(story.coverImageUrl ?? null);
  const chapters = await Promise.all(
    story.chapters.map(async (chapter) => ({
      title: chapter.title,
      body: chapter.body,
      type: chapter.type,
      order: chapter.order,
      imageUrls: (await Promise.all(chapter.imageUrls.map((imageUrl) => resolveStoredObjectUrl(imageUrl)))).filter(Boolean) as string[],
      imageKeys: chapter.imageUrls,
      voiceNoteUrl: await resolveStoredObjectUrl(chapter.voiceNoteUrl ?? null),
      voiceNoteKey: chapter.voiceNoteUrl ?? null,
      moments: await Promise.all(
        chapter.moments.map(async (moment) => ({
          title: moment.title,
          description: moment.description,
          happenedAt: moment.happenedAt,
          imageUrls: (await Promise.all(moment.imageUrls.map((imageUrl) => resolveStoredObjectUrl(imageUrl)))).filter(Boolean) as string[],
          imageKeys: moment.imageUrls,
          voiceNoteUrl: await resolveStoredObjectUrl(moment.voiceNoteUrl ?? null),
          voiceNoteKey: moment.voiceNoteUrl ?? null
        }))
      )
    }))
  );

  return {
    id: story.id,
    slug: story.slug,
    status: story.status,
    title: story.title,
    summary: story.summary,
    coverImageUrl,
    coverImageKey: story.coverImageUrl ?? null,
    visibility: story.visibility,
    anonymous: story.anonymous,
    authorName: story.authorName,
    authorUsername: story.authorUsername,
    authorVerified: false,
    tags: story.tags,
    links: story.links.map((link) => ({
      label: link.label,
      url: link.url,
      kind: link.kind
    })),
    readCount: story.readCount,
    reactionsCount: story.reactionsCount,
    likesCount: story.likesCount,
    bookmarksCount: story.bookmarksCount,
    sharesCount: story.sharesCount,
    commentsCount: story.commentsCount,
    liked: false,
    bookmarked: false,
    chapters,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt
  };
}

async function getStoryAuthorStates(
  stories: Array<{ authorUsername: string; anonymous: boolean }>,
  viewerId?: string
) {
  const authorStateByUsername = new Map<string, StoryAuthorState>();
  const visibleAuthorUsernames = [...new Set(stories.filter((story) => !story.anonymous).map((story) => story.authorUsername))];

  if (!visibleAuthorUsernames.length) {
    return authorStateByUsername;
  }

  const authors = await UserModel.find({ username: { $in: visibleAuthorUsernames } })
    .select("username verificationStatus")
    .lean();

  const authorIdsByUsername = new Map<string, string>();
  for (const author of authors) {
    authorIdsByUsername.set(author.username, String(author._id));
    authorStateByUsername.set(author.username, {
      authorVerified: author.verificationStatus === "verified",
      following: false
    });
  }

  if (!viewerId) {
    return authorStateByUsername;
  }

  const followeeIds = [...authorIdsByUsername.values()];
  if (!followeeIds.length) {
    return authorStateByUsername;
  }

  const follows = await FollowModel.find({
    followerUserId: viewerId,
    followeeUserId: { $in: followeeIds }
  })
    .select("followeeUserId")
    .lean();

  const followedIdSet = new Set(follows.map((follow) => String(follow.followeeUserId)));
  for (const [username, authorId] of authorIdsByUsername) {
    const current = authorStateByUsername.get(username) ?? {
      authorVerified: false,
      following: false
    };
    authorStateByUsername.set(username, {
      ...current,
      following: followedIdSet.has(authorId)
    });
  }

  return authorStateByUsername;
}

type SerializedStory = Awaited<ReturnType<typeof serializeStory>>;
type PublicFeedStory = SerializedStory & {
  commentCount: number;
  chapterCount: number;
};

async function getViewerStoryStates(storyIds: string[], viewerId?: string) {
  const viewerStateByStoryId = new Map<string, StoryViewerState>();

  if (!viewerId || storyIds.length === 0) {
    return viewerStateByStoryId;
  }

  const interactions = await StoryInteractionModel.find({
    userId: viewerId,
    storyId: { $in: storyIds },
    kind: { $in: ["like", "bookmark"] }
  }).select("storyId kind");

  for (const interaction of interactions) {
    const storyId = interaction.storyId.toString();
    const currentState = viewerStateByStoryId.get(storyId) ?? {
      liked: false,
      bookmarked: false
    };

    if (interaction.kind === "like") {
      currentState.liked = true;
    }

    if (interaction.kind === "bookmark") {
      currentState.bookmarked = true;
    }

    viewerStateByStoryId.set(storyId, currentState);
  }

  return viewerStateByStoryId;
}

async function attachViewerStoryState<T extends { id: string; liked?: boolean; bookmarked?: boolean }>(
  storyPayload: T,
  viewerId?: string
) {
  const viewerStateByStoryId = await getViewerStoryStates([storyPayload.id], viewerId);
  const viewerState = viewerStateByStoryId.get(storyPayload.id) ?? {
    liked: false,
    bookmarked: false
  };

  return {
    ...storyPayload,
    liked: viewerState.liked,
    bookmarked: viewerState.bookmarked
  };
}

async function attachStoryAuthorState<T extends {
  authorUsername: string;
  anonymous: boolean;
  authorVerified?: boolean;
  following?: boolean;
}>(storyPayload: T, viewerId?: string) {
  const authorStateByUsername = await getStoryAuthorStates(
    [{ authorUsername: storyPayload.authorUsername, anonymous: storyPayload.anonymous }],
    viewerId
  );
  const authorState = authorStateByUsername.get(storyPayload.authorUsername) ?? {
    authorVerified: false,
    following: false
  };

  return {
    ...storyPayload,
    authorVerified: authorState.authorVerified,
    following: authorState.following
  };
}

async function attachViewerStoryStateList<T extends { id: string; liked?: boolean; bookmarked?: boolean }>(
  storyPayloads: T[],
  viewerId?: string
) {
  const viewerStateByStoryId = await getViewerStoryStates(
    storyPayloads.map((story) => story.id),
    viewerId
  );

  return storyPayloads.map((story) => {
    const viewerState = viewerStateByStoryId.get(story.id) ?? {
      liked: false,
      bookmarked: false
    };

    return {
      ...story,
      liked: viewerState.liked,
      bookmarked: viewerState.bookmarked
    };
  });
}

async function attachStoryAuthorStateList<T extends {
  authorUsername: string;
  anonymous: boolean;
  authorVerified?: boolean;
  following?: boolean;
}>(storyPayloads: T[], viewerId?: string) {
  const authorStateByUsername = await getStoryAuthorStates(
    storyPayloads.map((story) => ({
      authorUsername: story.authorUsername,
      anonymous: story.anonymous
    })),
    viewerId
  );

  return storyPayloads.map((story) => {
    const authorState = authorStateByUsername.get(story.authorUsername) ?? {
      authorVerified: false,
      following: false
    };

    return {
      ...story,
      authorVerified: authorState.authorVerified,
      following: authorState.following
    };
  });
}

export async function saveStory(authorId: string, input: StorySaveInput, storyId?: string) {
  const user = await UserModel.findById(authorId).select("subscriptionTier fullName username");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  enforcePremiumLimits(input, user.subscriptionTier);
  const slug = await buildUniqueStorySlug(input.title, storyId);

  if (!storyId) {
    const story = await StoryModel.create({
      ...input,
      slug,
      authorId,
      authorName: input.anonymous ? "Anonymous" : user.fullName,
      authorUsername: input.anonymous ? "anonymous" : user.username
    });
    await deleteCache("stories:feed");
    await deleteCacheByPrefix(`stories:mine:${authorId}`);
    return await serializeStory(story);
  }

  const story = await StoryModel.findOne({ _id: storyId, authorId });
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  story.title = input.title;
  story.summary = input.summary;
  story.coverImageUrl = input.coverImageUrl;
  story.visibility = input.visibility;
  story.anonymous = input.anonymous;
  story.allowedViewerIds = input.allowedViewerIds.map((viewerId) => viewerId as never);
  story.tags = input.tags;
  story.links = input.links as never;
  story.chapters = input.chapters as never;
  story.status = input.status;
  story.slug = slug;
  story.authorName = input.anonymous ? "Anonymous" : user.fullName;
  story.authorUsername = input.anonymous ? "anonymous" : user.username;
  await story.save();
  await deleteCache("stories:feed");
  await deleteCacheByPrefix(`stories:mine:${authorId}`);
  await deleteCache(`stories:public:${story.slug}`);

  return await serializeStory(story);
}

export async function getMyStories(authorId: string) {
  const cacheKey = `stories:mine:${authorId}`;
  const cachedStories = await readJsonCache<SerializedStory[]>(cacheKey);
  if (cachedStories) {
    return cachedStories;
  }

  const stories = await StoryModel.find({ authorId })
    .sort({ updatedAt: -1 })
    .select(
      "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
    );

  const payload = await Promise.all(stories.map((story) => serializeStory(story)));
  await writeJsonCache(cacheKey, payload, 30);
  return payload;
}

export async function getMyStory(authorId: string, storyId: string) {
  const story = await StoryModel.findOne({ _id: storyId, authorId });
  return await serializeStory(story);
}

export async function getStoryBySlug(shareSlug: string, viewerId?: string) {
  const cachedStory = await readJsonCache<SerializedStory>(`stories:public:${shareSlug}`);
  if (cachedStory) {
    await StoryModel.findOneAndUpdate({ slug: shareSlug, status: "published", visibility: "public" }, { $inc: { readCount: 1 } });
    return await attachStoryAuthorState(await attachViewerStoryState(cachedStory, viewerId), viewerId);
  }

  const story = await StoryModel.findOne({ slug: shareSlug, status: "published", visibility: "public" });
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  story.readCount += 1;
  await story.save();
  const payload = await serializeStory(story);
  await writeJsonCache(`stories:public:${shareSlug}`, payload, 30);
  return await attachStoryAuthorState(await attachViewerStoryState(payload, viewerId), viewerId);
}

export async function getPublicFeed(viewerId?: string) {
  const cachedFeed = await readJsonCache<PublicFeedStory[]>("stories:feed");
  if (cachedFeed) {
    return await attachStoryAuthorStateList(await attachViewerStoryStateList(cachedFeed, viewerId), viewerId);
  }

  const stories = await StoryModel.find({ visibility: "public", status: "published" })
    .sort({ createdAt: -1 })
    .limit(20)
    .select(
      "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
    );

  const chapterCommentCounts = await Promise.all(
    stories.map(async (story) => {
      const commentsCount = await CommentModel.countDocuments({
        targetType: "storyChapter",
        targetId: { $regex: `^${story.id}:` }
      });

      return [story.id, commentsCount] as const;
    })
  );

  const commentMap = new Map(chapterCommentCounts);
  const payload = await Promise.all(stories.map(async (story) => ({
    ...(await serializeStory(story)),
    commentCount: commentMap.get(story.id) ?? 0,
    chapterCount: story.chapters.length
  })));
  await writeJsonCache("stories:feed", payload, 30);
  return await attachStoryAuthorStateList(await attachViewerStoryStateList(payload, viewerId), viewerId);
}

export async function toggleStoryReaction(storyId: string, userId: string, action: "like" | "bookmark") {
  const story = await StoryModel.findById(storyId);
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  const existingInteraction = await StoryInteractionModel.findOne({
    storyId,
    userId,
    kind: action
  });

  let active = false;

  if (existingInteraction) {
    await existingInteraction.deleteOne();
  } else {
    await StoryInteractionModel.create({
      storyId,
      userId,
      kind: action
    });
    active = true;
  }

  const [likesCount, bookmarksCount] = await Promise.all([
    StoryInteractionModel.countDocuments({ storyId, kind: "like" }),
    StoryInteractionModel.countDocuments({ storyId, kind: "bookmark" })
  ]);

  await StoryModel.updateOne(
    { _id: story.id },
    {
      $set: {
        likesCount,
        bookmarksCount,
        reactionsCount: likesCount + bookmarksCount
      }
    }
  );

  await enqueueCounterSync("story", story.id);
  await deleteCache("stories:feed");
  await deleteCache(`stories:public:${story.slug}`);
  await deleteCacheByPrefix(`stories:mine:${story.authorId.toString()}`);

  broadcastAppEvent("feed", {
    kind: "story.reaction.updated",
    storyId: story.id,
    likesCount,
    bookmarksCount,
    reactionsCount: likesCount + bookmarksCount
  });
  broadcastAppEvent(`user:${userId}`, {
    kind: "story.reaction.updated",
    storyId: story.id,
    action,
    active,
    likesCount,
    bookmarksCount,
    reactionsCount: likesCount + bookmarksCount
  });

  return {
    storyId: story.id,
    action,
    active,
    likesCount,
    bookmarksCount,
    reactionsCount: likesCount + bookmarksCount
  };
}

export async function trackStoryShare(storyId: string) {
  const story = await StoryModel.findById(storyId);
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  story.sharesCount += 1;
  await story.save();

  await deleteCache("stories:feed");
  await deleteCache(`stories:public:${story.slug}`);
  await deleteCacheByPrefix(`stories:mine:${story.authorId.toString()}`);

  broadcastAppEvent("feed", {
    kind: "story.share.updated",
    storyId: story.id,
    sharesCount: story.sharesCount
  });

  return {
    storyId: story.id,
    sharesCount: story.sharesCount
  };
}

export async function listBookmarkedStories(userId: string) {
  const bookmarks = await StoryInteractionModel.find({
    userId,
    kind: "bookmark"
  }).sort({ updatedAt: -1 });

  const storyIds = bookmarks.map((bookmark) => bookmark.storyId);
  const stories = await StoryModel.find({ _id: { $in: storyIds } }).select(
    "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
  );

  const storiesById = new Map(stories.map((story) => [story.id, story]));
  const orderedStories = storyIds
    .map((storyId) => storiesById.get(String(storyId)))
    .filter(Boolean);

  return Promise.all(orderedStories.map((story) => serializeStory(story ?? null)));
}
