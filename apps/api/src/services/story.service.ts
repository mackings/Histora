import type { StorySaveInput } from "../shared/index.js";

import { AppError } from "../utils/app-error.js";
import { StoryModel, type StoryDocument } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StoryInteractionModel } from "../models/story-interaction.model.js";
import { readJsonCache, writeJsonCache, deleteCache, deleteCacheByPrefix } from "./cache.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { resolveStoredObjectUrl } from "./storage.service.js";

function enforcePremiumLimits(input: StorySaveInput, tier: "free" | "premium") {
  const totalWords = input.chapters.reduce<number>(
    (sum, chapter) => sum + chapter.body.split(/\s+/).length,
    0
  );
  const totalImages = input.chapters.reduce<number>((sum, chapter) => sum + chapter.imageUrls.length, 0);
  const hasVoice = input.chapters.some((chapter) => Boolean(chapter.voiceNoteUrl));

  if (tier === "free" && (totalWords > 2500 || totalImages > 6 || hasVoice)) {
    throw new AppError("Premium is required for long-form stories, extra images, or voice notes", 403);
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
    tags: story.tags,
    readCount: story.readCount,
    reactionsCount: story.reactionsCount,
    likesCount: story.likesCount,
    bookmarksCount: story.bookmarksCount,
    commentsCount: story.commentsCount,
    chapters,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt
  };
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
  const cachedStories = await readJsonCache<ReturnType<typeof serializeStory>[]>(cacheKey);
  if (cachedStories) {
    return cachedStories;
  }

  const stories = await StoryModel.find({ authorId })
    .sort({ updatedAt: -1 })
    .select(
      "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags readCount reactionsCount chapters createdAt updatedAt"
    );

  const payload = await Promise.all(stories.map((story) => serializeStory(story)));
  await writeJsonCache(cacheKey, payload, 30);
  return payload;
}

export async function getMyStory(authorId: string, storyId: string) {
  const story = await StoryModel.findOne({ _id: storyId, authorId });
  return await serializeStory(story);
}

export async function getStoryBySlug(shareSlug: string) {
  const cachedStory = await readJsonCache<ReturnType<typeof serializeStory>>(`stories:public:${shareSlug}`);
  if (cachedStory) {
    await StoryModel.findOneAndUpdate({ slug: shareSlug, status: "published", visibility: "public" }, { $inc: { readCount: 1 } });
    return cachedStory;
  }

  const story = await StoryModel.findOne({ slug: shareSlug, status: "published", visibility: "public" });
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  story.readCount += 1;
  await story.save();
  const payload = await serializeStory(story);
  await writeJsonCache(`stories:public:${shareSlug}`, payload, 30);
  return payload;
}

export async function getPublicFeed() {
  const cachedFeed = await readJsonCache<Array<ReturnType<typeof serializeStory> & { commentCount: number; chapterCount: number }>>("stories:feed");
  if (cachedFeed) {
    return cachedFeed;
  }

  const stories = await StoryModel.find({ visibility: "public", status: "published" })
    .sort({ createdAt: -1 })
    .limit(20)
    .select(
      "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags readCount reactionsCount chapters createdAt updatedAt"
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
  return payload;
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

  await enqueueCounterSync("story", story.id);
  await deleteCache("stories:feed");
  await deleteCache(`stories:public:${story.slug}`);
  await deleteCacheByPrefix(`stories:mine:${story.authorId.toString()}`);

  return {
    storyId: story.id,
    action,
    active
  };
}

export async function listBookmarkedStories(userId: string) {
  const bookmarks = await StoryInteractionModel.find({
    userId,
    kind: "bookmark"
  }).sort({ updatedAt: -1 });

  const storyIds = bookmarks.map((bookmark) => bookmark.storyId);
  const stories = await StoryModel.find({ _id: { $in: storyIds } }).select(
    "slug status title summary coverImageUrl visibility anonymous authorName authorUsername tags readCount reactionsCount likesCount bookmarksCount commentsCount chapters createdAt updatedAt"
  );

  const storiesById = new Map(stories.map((story) => [story.id, story]));
  const orderedStories = storyIds
    .map((storyId) => storiesById.get(String(storyId)))
    .filter(Boolean);

  return Promise.all(orderedStories.map((story) => serializeStory(story ?? null)));
}
