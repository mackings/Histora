import type { StorySaveInput } from "../shared/index.js";
import crypto from "crypto";

import { AppError } from "../utils/app-error.js";
import { StoryModel, type StoryDocument } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { CommentModel } from "../models/comment.model.js";
import { StoryInteractionModel } from "../models/story-interaction.model.js";
import { FollowModel } from "../models/follow.model.js";
import { readJsonCache, writeJsonCache, deleteCache, deleteCacheByPrefix } from "./cache.service.js";
import { enqueueCounterSync } from "./queue.service.js";
import { extractOwnedObjectKey, resolveStoredObjectUrl } from "./storage.service.js";
import { broadcastAppEvent } from "../realtime/app-events.js";
import { sendGenericNotificationPush } from "./push.service.js";
import { buildStoredStoryContent, resolveStoryTextContent } from "./story-content.service.js";

type StoryViewerState = {
  liked: boolean;
  bookmarked: boolean;
};

type StoryAuthorState = {
  authorVerified: boolean;
  following: boolean;
};

type StoryEditorIdentity = {
  userId: string;
  fullName: string;
  username: string;
};

type ComparableStorySnapshot = {
  status: "draft" | "published";
  title: string;
  summary: string;
  coverImageUrl: string | null;
  visibility: "private" | "public" | "selected";
  anonymous: boolean;
  allowedViewerIds: string[];
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  chapters: Array<{
    id: string | null;
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    imageUrls: string[];
    voiceNoteUrl: string | null;
    moments: Array<{
      id: string | null;
      title: string;
      description: string;
      happenedAt: string;
      imageUrls: string[];
      voiceNoteUrl: string | null;
    }>;
  }>;
};

const buildStoryPartId = (prefix: "chapter" | "moment") =>
  `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

const isStoryCollaborator = (story: Pick<StoryDocument, "collaborators">, userId?: string) =>
  Boolean(userId && story.collaborators.some((collaborator) => String(collaborator.userId) === userId));

const isStoryEditor = (story: Pick<StoryDocument, "authorId" | "collaborators">, userId?: string) =>
  Boolean(userId && (String(story.authorId) === userId || isStoryCollaborator(story, userId)));

const createAuditStamp = (actor: StoryEditorIdentity, occurredAt: Date) => ({
  createdByUserId: actor.userId as never,
  createdByName: actor.fullName,
  createdByUsername: actor.username,
  createdAt: occurredAt,
  lastEditedByUserId: actor.userId as never,
  lastEditedByName: actor.fullName,
  lastEditedByUsername: actor.username,
  lastEditedAt: occurredAt
});

const applyEditAuditStamp = (
  existing:
    | {
        createdByUserId?: StoryDocument["chapters"][number]["createdByUserId"];
        createdByName?: string | null;
        createdByUsername?: string | null;
        createdAt?: Date | null;
        lastEditedByUserId?: StoryDocument["chapters"][number]["lastEditedByUserId"];
        lastEditedByName?: string | null;
        lastEditedByUsername?: string | null;
        lastEditedAt?: Date | null;
      }
    | undefined,
  actor: StoryEditorIdentity,
  occurredAt: Date,
  changed: boolean
) => ({
  createdByUserId: existing?.createdByUserId ?? (actor.userId as never),
  createdByName: existing?.createdByName ?? actor.fullName,
  createdByUsername: existing?.createdByUsername ?? actor.username,
  createdAt: existing?.createdAt ?? occurredAt,
  lastEditedByUserId: changed ? (actor.userId as never) : existing?.lastEditedByUserId ?? (actor.userId as never),
  lastEditedByName: changed ? actor.fullName : existing?.lastEditedByName ?? actor.fullName,
  lastEditedByUsername: changed ? actor.username : existing?.lastEditedByUsername ?? actor.username,
  lastEditedAt: changed ? occurredAt : existing?.lastEditedAt ?? occurredAt
});

const normalizeStoryMediaReference = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  return extractOwnedObjectKey(value) ?? value;
};

const normalizeComparableMediaReference = (value?: string | null) =>
  normalizeStoryMediaReference(value) ?? null;

const buildComparableStorySnapshotFromInput = (
  input: StorySaveInput,
  status: "draft" | "published"
): ComparableStorySnapshot => ({
  status,
  title: input.title,
  summary: input.summary,
  coverImageUrl: normalizeComparableMediaReference(input.coverImageUrl),
  visibility: input.visibility,
  anonymous: input.anonymous,
  allowedViewerIds: [...input.allowedViewerIds].map(String).sort(),
  tags: [...input.tags],
  links: input.links.map((link) => ({
    label: link.label,
    url: link.url,
    kind: link.kind
  })),
  chapters: input.chapters.map((chapter) => ({
    id: chapter.id ?? null,
    title: chapter.title,
    body: chapter.body,
    type: chapter.type,
    order: chapter.order,
    imageUrls: chapter.imageUrls.map((imageUrl) => normalizeComparableMediaReference(imageUrl) ?? imageUrl),
    voiceNoteUrl: normalizeComparableMediaReference(chapter.voiceNoteUrl),
    moments: chapter.moments.map((moment) => ({
      id: moment.id ?? null,
      title: moment.title,
      description: moment.description,
      happenedAt: new Date(moment.happenedAt).toISOString(),
      imageUrls: moment.imageUrls.map((imageUrl) => normalizeComparableMediaReference(imageUrl) ?? imageUrl),
      voiceNoteUrl: normalizeComparableMediaReference(moment.voiceNoteUrl)
    }))
  }))
});

const buildComparableStorySnapshotFromDocument = (story: StoryDocument): ComparableStorySnapshot => {
  const storyText = resolveStoryTextContent(story);

  return {
    status: story.status,
    title: storyText.title,
    summary: storyText.summary,
    coverImageUrl: normalizeComparableMediaReference(story.coverImageUrl ?? null),
    visibility: story.visibility,
    anonymous: story.anonymous,
    allowedViewerIds: story.allowedViewerIds.map((viewerId) => String(viewerId)).sort(),
    tags: [...storyText.tags],
    links: storyText.links.map((link) => ({
      label: link.label,
      url: link.url,
      kind: link.kind
    })),
    chapters: story.chapters.map((chapter, chapterIndex) => ({
      id: chapter.id ?? null,
      title: storyText.chapters[chapterIndex]?.title ?? chapter.title,
      body: storyText.chapters[chapterIndex]?.body ?? chapter.body,
      type: chapter.type,
      order: chapter.order,
      imageUrls: chapter.imageUrls.map((imageUrl) => normalizeComparableMediaReference(imageUrl) ?? imageUrl),
      voiceNoteUrl: normalizeComparableMediaReference(chapter.voiceNoteUrl ?? null),
      moments: chapter.moments.map((moment, momentIndex) => ({
        id: moment.id ?? null,
        title: storyText.chapters[chapterIndex]?.moments[momentIndex]?.title ?? moment.title,
        description: storyText.chapters[chapterIndex]?.moments[momentIndex]?.description ?? moment.description,
        happenedAt: moment.happenedAt.toISOString(),
        imageUrls: moment.imageUrls.map((imageUrl) => normalizeComparableMediaReference(imageUrl) ?? imageUrl),
        voiceNoteUrl: normalizeComparableMediaReference(moment.voiceNoteUrl ?? null)
      }))
    }))
  };
};

const storySnapshotsMatch = (
  currentStory: StoryDocument,
  nextInput: StorySaveInput,
  nextStatus: "draft" | "published"
) =>
  JSON.stringify(buildComparableStorySnapshotFromDocument(currentStory)) ===
  JSON.stringify(buildComparableStorySnapshotFromInput(nextInput, nextStatus));

const normalizeStoryMediaInput = (input: StorySaveInput): StorySaveInput => ({
  ...input,
  coverImageUrl: normalizeStoryMediaReference(input.coverImageUrl),
  chapters: input.chapters.map((chapter) => ({
    ...chapter,
    imageUrls: chapter.imageUrls.map((imageUrl) => normalizeStoryMediaReference(imageUrl) ?? imageUrl),
    voiceNoteUrl: normalizeStoryMediaReference(chapter.voiceNoteUrl),
    moments: chapter.moments.map((moment) => ({
      ...moment,
      imageUrls: moment.imageUrls.map((imageUrl) => normalizeStoryMediaReference(imageUrl) ?? imageUrl),
      voiceNoteUrl: normalizeStoryMediaReference(moment.voiceNoteUrl)
    }))
  }))
});

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

function normalizeCollaborativeChapters(
  input: StorySaveInput,
  existingStory: StoryDocument | null,
  actor: StoryEditorIdentity,
  occurredAt: Date
) {
  return input.chapters.map((chapter, chapterIndex) => {
    const existingChapter =
      existingStory?.chapters.find((entry) => entry.id === chapter.id) ??
      existingStory?.chapters[chapterIndex];
    const normalizedChapterId = chapter.id || existingChapter?.id || buildStoryPartId("chapter");
    const normalizedMoments = chapter.moments.map((moment, momentIndex) => {
      const existingMoment =
        existingChapter?.moments.find((entry) => entry.id === moment.id) ??
        existingChapter?.moments[momentIndex];
      const normalizedMomentId = moment.id || existingMoment?.id || buildStoryPartId("moment");
      const momentChanged =
        !existingMoment ||
        existingMoment.title !== moment.title ||
        existingMoment.description !== moment.description ||
        existingMoment.happenedAt.toISOString() !== moment.happenedAt ||
        JSON.stringify(existingMoment.imageUrls) !== JSON.stringify(moment.imageUrls) ||
        (existingMoment.voiceNoteUrl ?? null) !== (moment.voiceNoteUrl ?? null);

      return {
        ...moment,
        id: normalizedMomentId,
        ...(!existingMoment
          ? createAuditStamp(actor, occurredAt)
          : applyEditAuditStamp(existingMoment, actor, occurredAt, momentChanged))
      };
    });

    const chapterChanged =
      !existingChapter ||
      existingChapter.title !== chapter.title ||
      existingChapter.body !== chapter.body ||
      existingChapter.type !== chapter.type ||
      existingChapter.order !== chapter.order ||
      JSON.stringify(existingChapter.imageUrls) !== JSON.stringify(chapter.imageUrls) ||
      (existingChapter.voiceNoteUrl ?? null) !== (chapter.voiceNoteUrl ?? null) ||
      JSON.stringify(
        existingChapter.moments.map((moment) => ({
          id: moment.id,
          title: moment.title,
          description: moment.description,
          happenedAt: moment.happenedAt.toISOString(),
          imageUrls: moment.imageUrls,
          voiceNoteUrl: moment.voiceNoteUrl ?? null
        }))
      ) !==
        JSON.stringify(
          normalizedMoments.map((moment) => ({
            id: moment.id,
            title: moment.title,
            description: moment.description,
            happenedAt: moment.happenedAt,
            imageUrls: moment.imageUrls,
            voiceNoteUrl: moment.voiceNoteUrl ?? null
          }))
        );

    return {
      ...chapter,
      id: normalizedChapterId,
      moments: normalizedMoments,
      ...(!existingChapter
        ? createAuditStamp(actor, occurredAt)
        : applyEditAuditStamp(existingChapter, actor, occurredAt, chapterChanged))
    };
  });
}

async function findEditableStory(storyId: string, userId: string) {
  const story = await StoryModel.findById(storyId);
  if (!story || !isStoryEditor(story, userId)) {
    throw new AppError("Story not found", 404);
  }

  return story;
}

export async function canReadStoryMediaObject(userId: string, storyId: string, objectKey: string) {
  const story = await StoryModel.findById(storyId).select(
    "authorId collaborators coverImageUrl chapters.imageUrls chapters.voiceNoteUrl chapters.moments.imageUrls chapters.moments.voiceNoteUrl"
  );

  if (!story || !isStoryEditor(story, userId)) {
    return false;
  }

  const normalizedObjectKey = normalizeComparableMediaReference(objectKey);
  if (!normalizedObjectKey) {
    return false;
  }

  if (normalizeComparableMediaReference(story.coverImageUrl ?? null) === normalizedObjectKey) {
    return true;
  }

  for (const chapter of story.chapters) {
    if (chapter.imageUrls.some((imageUrl) => normalizeComparableMediaReference(imageUrl) === normalizedObjectKey)) {
      return true;
    }

    if (normalizeComparableMediaReference(chapter.voiceNoteUrl ?? null) === normalizedObjectKey) {
      return true;
    }

    for (const moment of chapter.moments) {
      if (moment.imageUrls.some((imageUrl) => normalizeComparableMediaReference(imageUrl) === normalizedObjectKey)) {
        return true;
      }

      if (normalizeComparableMediaReference(moment.voiceNoteUrl ?? null) === normalizedObjectKey) {
        return true;
      }
    }
  }

  return false;
}

async function serializeStory(story: StoryDocument | null, viewerId?: string) {
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  const storyText = resolveStoryTextContent(story);
  const coverImageUrl = await resolveStoredObjectUrl(story.coverImageUrl ?? null);
  const chapters = await Promise.all(
    story.chapters.map(async (chapter, chapterIndex) => ({
      id: chapter.id,
      title: storyText.chapters[chapterIndex]?.title ?? chapter.title,
      body: storyText.chapters[chapterIndex]?.body ?? chapter.body,
      type: chapter.type,
      order: chapter.order,
      createdByName: chapter.createdByName ?? null,
      createdByUsername: chapter.createdByUsername ?? null,
      createdAt: chapter.createdAt ?? null,
      lastEditedByName: chapter.lastEditedByName ?? null,
      lastEditedByUsername: chapter.lastEditedByUsername ?? null,
      lastEditedAt: chapter.lastEditedAt ?? null,
      imageUrls: (await Promise.all(chapter.imageUrls.map((imageUrl) => resolveStoredObjectUrl(imageUrl)))).filter(Boolean) as string[],
      imageKeys: chapter.imageUrls.map((imageUrl) => extractOwnedObjectKey(imageUrl) ?? imageUrl),
      voiceNoteUrl: await resolveStoredObjectUrl(chapter.voiceNoteUrl ?? null),
      voiceNoteKey: extractOwnedObjectKey(chapter.voiceNoteUrl ?? null) ?? chapter.voiceNoteUrl ?? null,
      moments: await Promise.all(
        chapter.moments.map(async (moment, momentIndex) => ({
          id: moment.id,
          title: storyText.chapters[chapterIndex]?.moments[momentIndex]?.title ?? moment.title,
          description: storyText.chapters[chapterIndex]?.moments[momentIndex]?.description ?? moment.description,
          happenedAt: moment.happenedAt,
          createdByName: moment.createdByName ?? null,
          createdByUsername: moment.createdByUsername ?? null,
          createdAt: moment.createdAt ?? null,
          lastEditedByName: moment.lastEditedByName ?? null,
          lastEditedByUsername: moment.lastEditedByUsername ?? null,
          lastEditedAt: moment.lastEditedAt ?? null,
          imageUrls: (await Promise.all(moment.imageUrls.map((imageUrl) => resolveStoredObjectUrl(imageUrl)))).filter(Boolean) as string[],
          imageKeys: moment.imageUrls.map((imageUrl) => extractOwnedObjectKey(imageUrl) ?? imageUrl),
          voiceNoteUrl: await resolveStoredObjectUrl(moment.voiceNoteUrl ?? null),
          voiceNoteKey: extractOwnedObjectKey(moment.voiceNoteUrl ?? null) ?? moment.voiceNoteUrl ?? null
        }))
      )
    }))
  );

  return {
    id: story.id,
    slug: story.slug,
    status: story.status,
    title: storyText.title,
    summary: storyText.summary,
    coverImageUrl,
    coverImageKey: extractOwnedObjectKey(story.coverImageUrl ?? null) ?? story.coverImageUrl ?? null,
    visibility: story.visibility,
    anonymous: story.anonymous,
    authorName: story.authorName,
    authorUsername: story.authorUsername,
    isOwner: Boolean(viewerId && String(story.authorId) === viewerId),
    canEdit: isStoryEditor(story, viewerId),
    collaborators: story.collaborators.map((collaborator) => ({
      id: String(collaborator.userId),
      fullName: collaborator.fullName,
      username: collaborator.username,
      joinedAt: collaborator.joinedAt
    })),
    collaborationRevision: story.collaborationRevision ?? 0,
    collaborative: story.collaborators.length > 0,
    lastEditedByName: story.lastEditedByName ?? null,
    lastEditedByUsername: story.lastEditedByUsername ?? null,
    lastEditedAt: story.lastEditedAt ?? null,
    authorVerified: false,
    tags: storyText.tags,
    links: storyText.links.map((link) => ({
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

export async function assertStoryViewerAccess(storyId: string, viewerId?: string) {
  const story = await StoryModel.findById(storyId).select(
    "authorId slug status visibility allowedViewerIds anonymous title contentEncrypted sharesCount collaborators"
  );

  if (!story || story.status !== "published") {
    throw new AppError("Story not found", 404);
  }

  if (isStoryEditor(story, viewerId)) {
    return story;
  }

  if (story.visibility === "public") {
    return story;
  }

  if (
    story.visibility === "selected" &&
    viewerId &&
    story.allowedViewerIds.some((allowedViewerId) => String(allowedViewerId) === viewerId)
  ) {
    return story;
  }

  throw new AppError("Story not found", 404);
}

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

async function applyAnonymousStoryFollowState<T extends { id: string; anonymous: boolean; following?: boolean }>(
  storyPayload: T,
  viewerId?: string
) {
  if (!viewerId || !storyPayload.anonymous) {
    return storyPayload;
  }

  const story = await StoryModel.findById(storyPayload.id).select("authorId").lean();
  if (!story) {
    return storyPayload;
  }

  const follow = await FollowModel.findOne({
    followerUserId: viewerId,
    followeeUserId: String(story.authorId)
  })
    .select("_id")
    .lean();

  return {
    ...storyPayload,
    following: Boolean(follow)
  };
}

async function applyAnonymousStoryFollowStateList<T extends { id: string; anonymous: boolean; following?: boolean }>(
  storyPayloads: T[],
  viewerId?: string
) {
  if (!viewerId) {
    return storyPayloads;
  }

  const anonymousStoryIds = storyPayloads.filter((story) => story.anonymous).map((story) => story.id);
  if (!anonymousStoryIds.length) {
    return storyPayloads;
  }

  const anonymousStories = await StoryModel.find({ _id: { $in: anonymousStoryIds } }).select("_id authorId").lean();
  const authorIdByStoryId = new Map(anonymousStories.map((story) => [String(story._id), String(story.authorId)] as const));
  const authorIds = [...new Set(anonymousStories.map((story) => String(story.authorId)))];

  if (!authorIds.length) {
    return storyPayloads;
  }

  const follows = await FollowModel.find({
    followerUserId: viewerId,
    followeeUserId: { $in: authorIds }
  })
    .select("followeeUserId")
    .lean();
  const followedAuthorIds = new Set(follows.map((follow) => String(follow.followeeUserId)));

  return storyPayloads.map((story) =>
    story.anonymous
      ? {
          ...story,
          following: followedAuthorIds.has(authorIdByStoryId.get(story.id) ?? "")
        }
      : story
  );
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

  const normalizedMediaInput = normalizeStoryMediaInput(input);
  enforcePremiumLimits(normalizedMediaInput, user.subscriptionTier);
  const slug = await buildUniqueStorySlug(normalizedMediaInput.title, storyId);
  const actor: StoryEditorIdentity = {
    userId: authorId,
    fullName: user.fullName,
    username: user.username
  };
  const occurredAt = new Date();
  const existingStory = storyId ? await findEditableStory(storyId, authorId) : null;

  const normalizedInput: StorySaveInput = {
    ...normalizedMediaInput,
    visibility: existingStory && String(existingStory.authorId) !== authorId ? existingStory.visibility : normalizedMediaInput.visibility,
    anonymous: existingStory && String(existingStory.authorId) !== authorId ? existingStory.anonymous : normalizedMediaInput.anonymous,
    allowedViewerIds:
      existingStory && String(existingStory.authorId) !== authorId
        ? existingStory.allowedViewerIds.map((viewerId) => String(viewerId))
        : normalizedMediaInput.allowedViewerIds,
    chapters: normalizeCollaborativeChapters(normalizedMediaInput, existingStory, actor, occurredAt)
  };
  const storedStoryContent = buildStoredStoryContent(normalizedInput);

  if (!storyId) {
    const story = await StoryModel.create({
      ...normalizedInput,
      ...storedStoryContent,
      slug,
      authorId,
      authorName: input.anonymous ? "Anonymous" : user.fullName,
      authorUsername: input.anonymous ? "anonymous" : user.username,
      collaborators: [],
      collaborationRevision: 1,
      lastEditedByUserId: authorId,
      lastEditedByName: user.fullName,
      lastEditedByUsername: user.username,
      lastEditedAt: occurredAt
    });
    await deleteCache("stories:feed");
    await deleteCacheByPrefix(`stories:mine:${authorId}`);
    return await serializeStory(story, authorId);
  }

  if (!existingStory) {
    throw new AppError("Story not found", 404);
  }

  const story = existingStory;

  if (storySnapshotsMatch(story, normalizedInput, input.status)) {
    return await serializeStory(story, authorId);
  }

  if (typeof input.expectedRevision === "number" && input.expectedRevision !== (story.collaborationRevision ?? 0)) {
    throw new AppError(
      "A newer collaborative version is available. Load the latest version before saving again.",
      409,
      "STORY_REVISION_CONFLICT",
      { latestRevision: story.collaborationRevision ?? 0 }
    );
  }

  story.title = storedStoryContent.title;
  story.summary = storedStoryContent.summary;
  story.contentEncrypted = storedStoryContent.contentEncrypted;
  story.coverImageUrl = normalizedInput.coverImageUrl;
  story.visibility = normalizedInput.visibility;
  story.anonymous = normalizedInput.anonymous;
  story.allowedViewerIds = normalizedInput.allowedViewerIds.map((viewerId) => viewerId as never);
  story.tags = storedStoryContent.tags;
  story.links = storedStoryContent.links as never;
  story.chapters = storedStoryContent.chapters as never;
  story.status = input.status;
  story.slug = slug;
  if (String(story.authorId) === authorId) {
    story.authorName = normalizedInput.anonymous ? "Anonymous" : user.fullName;
    story.authorUsername = normalizedInput.anonymous ? "anonymous" : user.username;
  }
  story.collaborationRevision = (story.collaborationRevision ?? 0) + 1;
  story.lastEditedByUserId = authorId as never;
  story.lastEditedByName = user.fullName;
  story.lastEditedByUsername = user.username;
  story.lastEditedAt = occurredAt;
  await story.save();
  await deleteCache("stories:feed");
  await deleteCacheByPrefix(`stories:mine:${story.authorId.toString()}`);
  await deleteCache(`stories:public:${story.slug}`);
  const participantIds = new Set([
    story.authorId.toString(),
    ...story.collaborators.map((collaborator) => String(collaborator.userId))
  ]);

  for (const participantId of participantIds) {
    broadcastAppEvent(`user:${participantId}`, {
      kind: "story.collaboration.updated",
      storyId: story.id,
      title: resolveStoryTextContent(story).title,
      revision: story.collaborationRevision,
      status: story.status,
      updatedAt: story.updatedAt,
      updatedByName: user.fullName,
      updatedByUsername: user.username
    });
  }

  return await serializeStory(story, authorId);
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
      "slug status title summary contentEncrypted coverImageUrl visibility anonymous authorId authorName authorUsername collaborators collaborationRevision lastEditedByName lastEditedByUsername lastEditedAt tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
    );

  const payload = await Promise.all(stories.map((story) => serializeStory(story, authorId)));
  await writeJsonCache(cacheKey, payload, 30);
  return payload;
}

export async function getMyStory(authorId: string, storyId: string) {
  const story = await findEditableStory(storyId, authorId);
  return await serializeStory(story, authorId);
}

export async function getCollaborativeStories(userId: string) {
  const stories = await StoryModel.find({
    authorId: { $ne: userId },
    "collaborators.userId": userId
  })
    .sort({ updatedAt: -1 })
    .select(
      "slug status title summary contentEncrypted coverImageUrl visibility anonymous authorId authorName authorUsername collaborators collaborationRevision lastEditedByName lastEditedByUsername lastEditedAt tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
    );

  return Promise.all(stories.map((story) => serializeStory(story, userId)));
}

export async function getStoryBySlug(shareSlug: string, viewerId?: string) {
  const cachedStory = await readJsonCache<SerializedStory>(`stories:public:${shareSlug}`);
  if (cachedStory) {
    await StoryModel.findOneAndUpdate({ slug: shareSlug, status: "published", visibility: "public" }, { $inc: { readCount: 1 } });
    return await attachStoryAuthorState(await attachViewerStoryState(cachedStory, viewerId), viewerId);
  }

  const story = await StoryModel.findOne({ slug: shareSlug, status: "published" });
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  const viewerCanAccessNonPublicStory =
    Boolean(viewerId) &&
    (
      isStoryEditor(story, viewerId) ||
      (story.visibility === "selected" &&
        story.allowedViewerIds.some((allowedViewerId) => String(allowedViewerId) === viewerId))
    );

  if (story.visibility !== "public" && !viewerCanAccessNonPublicStory) {
    throw new AppError("Story not found", 404);
  }

  if (story.visibility === "public") {
    story.readCount += 1;
    await StoryModel.updateOne({ _id: story.id }, { $inc: { readCount: 1 } });
  }

  const payload = await serializeStory(story, viewerId);
  if (story.visibility === "public") {
    await writeJsonCache(`stories:public:${shareSlug}`, payload, 30);
  }
  return await applyAnonymousStoryFollowState(
    await attachStoryAuthorState(await attachViewerStoryState(payload, viewerId), viewerId),
    viewerId
  );
}

async function includeOwnPublishedStoriesInFeed(feedStories: PublicFeedStory[], viewerId?: string) {
  if (!viewerId) {
    return feedStories;
  }

  const ownStories = await StoryModel.find({ authorId: viewerId, status: "published" })
    .sort({ createdAt: -1 })
    .select(
      "slug status title summary contentEncrypted coverImageUrl visibility anonymous authorId authorName authorUsername collaborators collaborationRevision lastEditedByName lastEditedByUsername lastEditedAt tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
    );

  const publicStoryIdSet = new Set(feedStories.map((story) => story.id));
  const ownStoriesMissingFromPublicFeed = ownStories.filter((story) => !publicStoryIdSet.has(story.id));
  const ownStoryCommentCounts = await Promise.all(
    ownStoriesMissingFromPublicFeed.map(async (story) => {
      const commentsCount = await CommentModel.countDocuments({
        targetType: "storyChapter",
        targetId: { $regex: `^${story.id}:` }
      });

      return [story.id, commentsCount] as const;
    })
  );

  const ownCommentMap = new Map(ownStoryCommentCounts);
  const ownPayload = await Promise.all(
    ownStoriesMissingFromPublicFeed.map(async (story) => ({
      ...(await serializeStory(story, viewerId)),
      commentCount: ownCommentMap.get(story.id) ?? 0,
      chapterCount: story.chapters.length
    }))
  );

  return [...ownPayload, ...feedStories].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}

export async function getPublicFeed(viewerId?: string) {
  const cachedFeed = await readJsonCache<PublicFeedStory[]>("stories:feed");
  if (cachedFeed) {
    const combinedFeed = await includeOwnPublishedStoriesInFeed(cachedFeed, viewerId);
    return await applyAnonymousStoryFollowStateList(
      await attachStoryAuthorStateList(await attachViewerStoryStateList(combinedFeed, viewerId), viewerId),
      viewerId
    );
  }

  const stories = await StoryModel.find({ visibility: "public", status: "published" })
    .sort({ createdAt: -1 })
    .limit(20)
    .select(
      "slug status title summary contentEncrypted coverImageUrl visibility anonymous authorId authorName authorUsername collaborators collaborationRevision lastEditedByName lastEditedByUsername lastEditedAt tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
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
    ...(await serializeStory(story, viewerId)),
    commentCount: commentMap.get(story.id) ?? 0,
    chapterCount: story.chapters.length
  })));
  await writeJsonCache("stories:feed", payload, 30);
  const combinedFeed = await includeOwnPublishedStoriesInFeed(payload, viewerId);
  return await applyAnonymousStoryFollowStateList(
    await attachStoryAuthorStateList(await attachViewerStoryStateList(combinedFeed, viewerId), viewerId),
    viewerId
  );
}

export async function toggleStoryReaction(storyId: string, userId: string, action: "like" | "bookmark") {
  const story = await assertStoryViewerAccess(storyId, userId);

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
  const actor = await UserModel.findById(userId).select("fullName username").lean();

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

  if (action === "like" && active && actor && String(story.authorId) !== userId) {
    const storyTitle = resolveStoryTextContent(story).title;
    const body = `${actor.fullName} (@${actor.username}) liked your ${story.anonymous ? "anonymous post" : "post"} "${storyTitle}".`;
    broadcastAppEvent(`user:${String(story.authorId)}`, {
      kind: "notification.generic",
      title: "New post like",
      body
    });
    void sendGenericNotificationPush(String(story.authorId), {
      title: "New post like",
      body,
      tag: `histora-story-like-${story.id}-${actor.username}`,
      url: `/feed/story/${story.slug}`
    }).catch(() => undefined);
  }

  return {
    storyId: story.id,
    action,
    active,
    likesCount,
    bookmarksCount,
    reactionsCount: likesCount + bookmarksCount
  };
}

export async function trackStoryShare(storyId: string, userId: string) {
  const story = await assertStoryViewerAccess(storyId, userId);
  const actor = await UserModel.findById(userId).select("fullName username").lean();

  story.sharesCount += 1;
  await StoryModel.updateOne({ _id: story.id }, { $inc: { sharesCount: 1 } });

  await deleteCache("stories:feed");
  await deleteCache(`stories:public:${story.slug}`);
  await deleteCacheByPrefix(`stories:mine:${story.authorId.toString()}`);

  broadcastAppEvent("feed", {
    kind: "story.share.updated",
    storyId: story.id,
    sharesCount: story.sharesCount
  });

  if (actor && String(story.authorId) !== userId) {
    const storyTitle = resolveStoryTextContent(story).title;
    const body = `${actor.fullName} (@${actor.username}) shared your ${story.anonymous ? "anonymous post" : "post"} "${storyTitle}".`;
    broadcastAppEvent(`user:${String(story.authorId)}`, {
      kind: "notification.generic",
      title: "New post share",
      body
    });
    void sendGenericNotificationPush(String(story.authorId), {
      title: "New post share",
      body,
      tag: `histora-story-share-${story.id}-${actor.username}`,
      url: `/feed/story/${story.slug}`
    }).catch(() => undefined);
  }

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
    "slug status title summary contentEncrypted coverImageUrl visibility anonymous authorId authorName authorUsername collaborators collaborationRevision lastEditedByName lastEditedByUsername lastEditedAt tags links readCount reactionsCount likesCount bookmarksCount sharesCount commentsCount chapters createdAt updatedAt"
  );

  const storiesById = new Map(stories.map((story) => [story.id, story]));
  const orderedStories = storyIds
    .map((storyId) => storiesById.get(String(storyId)))
    .filter(Boolean);

  return Promise.all(orderedStories.map((story) => serializeStory(story ?? null, userId)));
}
