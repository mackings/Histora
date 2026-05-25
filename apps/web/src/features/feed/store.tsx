import { useEffect, useSyncExternalStore } from "react";

import {
  apiRequest,
  type ApiComment,
  type ApiFeedStory,
  type ApiStatus,
  type SignedReadResponse,
  subscribeToAppEvents,
  updateCachedStoriesByAuthorUsername,
  updateCachedStoryCounts
} from "../../lib/api-client";
import { type FeedStoryRecord, toFeedStoryRecord } from "./models";
import { statusUpdateEvent, toAnonymousPublicFeedSource, type AnonymousFeedSource } from "./support";

type RealtimeEventMessage =
  | {
      type: "event";
      channel: string;
      payload:
        | {
            kind: "story.created" | "story.updated";
            story: ApiFeedStory;
          }
        | {
            kind: "story.reaction.updated";
            storyId: string;
            action?: "like" | "bookmark";
            active?: boolean;
            likesCount: number;
            bookmarksCount: number;
            reactionsCount: number;
          }
        | {
            kind: "comment.created";
            comment: ApiComment;
          }
        | {
            kind: "follow.updated";
            username: string;
            active: boolean;
          }
        | {
            kind: "story.share.updated";
            storyId: string;
            sharesCount: number;
          }
        | {
            kind: "status.created" | "status.deleted" | "status.reaction.updated";
            [key: string]: unknown;
          }
        | {
            kind: "anonymous.public.created";
            [key: string]: unknown;
          }
        | {
            kind: "notification.followed";
            username: string;
            fullName: string;
            body?: string;
            title?: string;
            url?: string;
          }
        | {
            kind: "notification.status.reacted";
            username: string;
            fullName: string;
          }
        | {
            kind: "notification.generic";
            title: string;
            body: string;
          };
    }
  | {
      type: "ready" | "subscribed" | "error";
      channel?: string;
      error?: string;
      channels?: string[];
    };

type FeedStoreState = {
  feedPosts: FeedStoryRecord[];
  feedStatuses: ApiStatus[];
  myStatusIds: Set<string>;
  liveAnonymousSources: AnonymousFeedSource[];
  hydrated: boolean;
  loading: boolean;
  error: string;
  lastLoadedAt: number;
};

const initialFeedStoreState: FeedStoreState = {
  feedPosts: [],
  feedStatuses: [],
  myStatusIds: new Set(),
  liveAnonymousSources: [],
  hydrated: false,
  loading: false,
  error: "",
  lastLoadedAt: 0
};

let feedStoreState: FeedStoreState = initialFeedStoreState;
let activeFeedLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emitFeedStoreChange = () => {
  listeners.forEach((listener) => listener());
};

const setFeedStoreState = (updater: FeedStoreState | ((current: FeedStoreState) => FeedStoreState)) => {
  feedStoreState = typeof updater === "function" ? updater(feedStoreState) : updater;
  emitFeedStoreChange();
};

export const getFeedStoreSnapshot = () => feedStoreState;

export const subscribeFeedStore = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useFeedStore = () => useSyncExternalStore(subscribeFeedStore, getFeedStoreSnapshot);

export const updateFeedPosts = (updater: (current: FeedStoryRecord[]) => FeedStoryRecord[]) => {
  setFeedStoreState((current) => ({
    ...current,
    feedPosts: updater(current.feedPosts)
  }));
};

export const updateFeedStatuses = (updater: (current: ApiStatus[]) => ApiStatus[]) => {
  setFeedStoreState((current) => ({
    ...current,
    feedStatuses: updater(current.feedStatuses)
  }));
};

export const updateMyStatusIds = (updater: (current: Set<string>) => Set<string>) => {
  setFeedStoreState((current) => ({
    ...current,
    myStatusIds: updater(current.myStatusIds)
  }));
};

export const updateLiveAnonymousSources = (
  updater: (current: AnonymousFeedSource[]) => AnonymousFeedSource[]
) => {
  setFeedStoreState((current) => ({
    ...current,
    liveAnonymousSources: updater(current.liveAnonymousSources)
  }));
};

const applyLocalStatusUpdate = (payload: {
  type: "created" | "deleted";
  status?: ApiStatus;
  statusId?: string;
}) => {
  if (payload.type === "created" && payload.status) {
    updateFeedStatuses((current) => {
      const next = current.filter((status) => status.id !== payload.status!.id);
      return [payload.status!, ...next];
    });
    updateMyStatusIds((current) => new Set([...current, payload.status!.id]));
    return;
  }

  if (payload.type === "deleted" && payload.statusId) {
    updateFeedStatuses((current) => current.filter((status) => status.id !== payload.statusId));
    updateMyStatusIds((current) => {
      const next = new Set(current);
      next.delete(payload.statusId!);
      return next;
    });
  }
};

const isOwnedStorageObjectKey = (value?: string | null): value is string =>
  typeof value === "string" && /^users\/[^/]+\/.+/.test(value);

async function resolveFeedMediaUrl(accessToken: string, storyId: string, value?: string | null) {
  if (!isOwnedStorageObjectKey(value)) {
    return value ?? null;
  }
  try {
    const objectKey = value;
    const query = new URLSearchParams({ objectKey, storyId });
    const signedRead = await apiRequest<SignedReadResponse>(`/media/public-read?${query.toString()}`, { accessToken });
    return signedRead.readUrl;
  } catch {
    return value;
  }
}

async function resolveStatusMediaUrl(accessToken: string, statusId: string, value?: string | null) {
  if (!isOwnedStorageObjectKey(value)) {
    return value ?? null;
  }
  try {
    const objectKey = value;
    const query = new URLSearchParams({ objectKey, statusId });
    const signedRead = await apiRequest<SignedReadResponse>(`/media/public-read?${query.toString()}`, { accessToken });
    return signedRead.readUrl;
  } catch {
    return value;
  }
}

async function hydrateStatusMedia(accessToken: string, status: ApiStatus): Promise<ApiStatus> {
  const imageUrl = await resolveStatusMediaUrl(accessToken, status.id, status.imageKey ?? status.imageUrl ?? null);
  return {
    ...status,
    imageUrl
  };
}

async function hydrateStatusesMedia(accessToken: string, statuses: ApiStatus[]) {
  return Promise.all(statuses.map((status) => hydrateStatusMedia(accessToken, status)));
}

async function hydrateFeedStoryMedia(accessToken: string, story: ApiFeedStory): Promise<ApiFeedStory> {
  const coverImageUrl = await resolveFeedMediaUrl(
    accessToken,
    story.id,
    story.coverImageKey ?? story.coverImageUrl ?? null
  );
  const chapters = await Promise.all(
    story.chapters.map(async (chapter) => {
      const imageUrls = await Promise.all(
        (chapter.imageKeys?.length ? chapter.imageKeys : chapter.imageUrls).map((imageUrl) =>
          resolveFeedMediaUrl(accessToken, story.id, imageUrl)
        )
      );
      const voiceNoteUrl = await resolveFeedMediaUrl(
        accessToken,
        story.id,
        chapter.voiceNoteKey ?? chapter.voiceNoteUrl ?? null
      );
      return {
        ...chapter,
        imageUrls: imageUrls.filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
        voiceNoteUrl: voiceNoteUrl ?? chapter.voiceNoteUrl
      };
    })
  );
  return {
    ...story,
    coverImageUrl,
    chapters
  };
}

async function hydrateFeedStoriesMedia(accessToken: string, stories: ApiFeedStory[]) {
  return Promise.all(stories.map((story) => hydrateFeedStoryMedia(accessToken, story)));
}

const preserveResolvedFeedPostMedia = (
  post: FeedStoryRecord,
  existing?: FeedStoryRecord
): FeedStoryRecord => {
  if (!existing) {
    return post;
  }

  return {
    ...post,
    coverImageUrl:
      isOwnedStorageObjectKey(post.coverImageUrl) && existing.coverImageUrl && !isOwnedStorageObjectKey(existing.coverImageUrl)
        ? existing.coverImageUrl
        : post.coverImageUrl,
    chapters: post.chapters.map((chapter, chapterIndex) => {
      const existingChapter = existing.chapters[chapterIndex];
      if (!existingChapter) {
        return chapter;
      }

      return {
        ...chapter,
        images: chapter.images.map((image, imageIndex) => {
          const existingImage = existingChapter.images[imageIndex];
          return existingImage && isOwnedStorageObjectKey(image.src) && !isOwnedStorageObjectKey(existingImage.src)
            ? { ...image, src: existingImage.src }
            : image;
        }),
        voiceNotes: chapter.voiceNotes.map((voice, voiceIndex) => {
          const existingVoice = existingChapter.voiceNotes[voiceIndex];
          return existingVoice && isOwnedStorageObjectKey(voice.src) && !isOwnedStorageObjectKey(existingVoice.src)
            ? { ...voice, src: existingVoice.src }
            : voice;
        })
      };
    })
  };
};

const applyRealtimeMessage = (message: RealtimeEventMessage, currentUserId: string, accessToken: string) => {
  if (message.type !== "event") {
    return;
  }

  const payload = message.payload;
  if (payload.kind === "story.created" || payload.kind === "story.updated") {
    void hydrateFeedStoryMedia(accessToken, payload.story).then((story) => {
      updateCachedStoryCounts(story.id, () => story);
      updateFeedPosts((current) => {
        if (story.status !== "published" || story.visibility !== "public") {
          return current.filter((post) => post.id !== story.id);
        }
        const nextPost = toFeedStoryRecord(story);
        const existing = current.find((post) => post.id === story.id);
        const next = current.filter((post) => post.id !== story.id);
        return [preserveResolvedFeedPostMedia(nextPost, existing), ...next];
      });
    });
    return;
  }

  if (payload.kind === "story.reaction.updated") {
    updateCachedStoryCounts(payload.storyId, (story) => ({
      ...story,
      likesCount: payload.likesCount,
      bookmarksCount: payload.bookmarksCount,
      reactionsCount: payload.likesCount + payload.bookmarksCount,
      ...(message.channel === `user:${currentUserId}` && payload.action
        ? {
            liked: payload.action === "like" ? !!payload.active : story.liked,
            bookmarked: payload.action === "bookmark" ? !!payload.active : story.bookmarked
          }
        : {})
    }));
    updateFeedPosts((current) =>
      current.map((post) =>
        post.id === payload.storyId
          ? {
              ...post,
              likes: payload.likesCount,
              saves: String(payload.bookmarksCount),
              ...(message.channel === `user:${currentUserId}` && payload.action
                ? {
                    liked: payload.action === "like" ? !!payload.active : post.liked,
                    bookmarked: payload.action === "bookmark" ? !!payload.active : post.bookmarked
                  }
                : {})
            }
          : post
      )
    );
    return;
  }

  if (payload.kind === "story.share.updated") {
    updateCachedStoryCounts(payload.storyId, (story) => ({
      ...story,
      sharesCount: payload.sharesCount
    }));
    updateFeedPosts((current) =>
      current.map((post) =>
        post.id === payload.storyId
          ? {
              ...post,
              shares: payload.sharesCount
            }
          : post
      )
    );
    return;
  }

  if (payload.kind === "status.created") {
    const statusEvent = (payload as { kind: "status.created"; status: ApiStatus }).status;
    void hydrateStatusMedia(accessToken, statusEvent).then((status) => {
      updateFeedStatuses((current) => {
        const next = current.filter((entry) => entry.id !== status.id);
        return [status, ...next];
      });
      if (message.channel === `user:${currentUserId}`) {
        updateMyStatusIds((current) => new Set([...current, status.id]));
      }
    });
    return;
  }

  if (payload.kind === "status.deleted") {
    const statusId = (payload as { kind: "status.deleted"; statusId: string }).statusId;
    updateFeedStatuses((current) => current.filter((status) => status.id !== statusId));
    if (message.channel === `user:${currentUserId}`) {
      updateMyStatusIds((current) => {
        const next = new Set(current);
        next.delete(statusId);
        return next;
      });
    }
    return;
  }

  if (payload.kind === "status.reaction.updated") {
    const statusEvent = payload as {
      kind: "status.reaction.updated";
      statusId: string;
      likesCount: number;
      bookmarksCount: number;
    };
    updateFeedStatuses((current) =>
      current.map((status) =>
        status.id === statusEvent.statusId
          ? { ...status, likesCount: statusEvent.likesCount, bookmarksCount: statusEvent.bookmarksCount }
          : status
      )
    );
    return;
  }

  if (payload.kind === "anonymous.public.created") {
    const anonymousEvent = payload as {
      kind: "anonymous.public.created";
      message: { id: string; shareSlug: string; body: string; commentsCount?: number; createdAt: string };
    };
    updateLiveAnonymousSources((current) => [
      toAnonymousPublicFeedSource(anonymousEvent.message),
      ...current.filter((entry) => entry.id !== anonymousEvent.message.id)
    ]);
    return;
  }

  if (payload.kind === "comment.created" && payload.comment.targetType === "storyChapter") {
    const [storyId] = payload.comment.targetId.split(":");
    updateFeedPosts((current) => current.map((post) => (post.id === storyId ? { ...post, comments: post.comments + 1 } : post)));
    return;
  }

  if (payload.kind === "comment.created" && payload.comment.targetType === "status") {
    updateFeedStatuses((current) =>
      current.map((status) =>
        status.id === payload.comment.targetId
          ? { ...status, commentsCount: status.commentsCount + 1 }
          : status
      )
    );
    return;
  }

  if (payload.kind === "follow.updated") {
    updateCachedStoriesByAuthorUsername(payload.username, (story) => ({
      ...story,
      following: payload.active
    }));
    updateFeedPosts((current) =>
      current.map((post) =>
        post.handle.replace(/^@/, "") === payload.username ? { ...post, following: payload.active } : post
      )
    );
    return;
  }

  if (payload.kind === "notification.followed") {
    if (typeof window !== "undefined") {
      const body = payload.body ?? `${payload.fullName} (@${payload.username}) followed your archive.`;
      const title = payload.title ?? "New follower";
      window.dispatchEvent(
        new CustomEvent("histora-live-notification", {
          detail: {
            title,
            body
          }
        })
      );

      if ("Notification" in window && Notification.permission === "granted") {
        void Promise.resolve().then(() => {
          new Notification(title, { body });
        });
      }
    }
  }

  if (payload.kind === "notification.status.reacted") {
    if (typeof window !== "undefined") {
      const body = `${payload.fullName} (@${payload.username}) reacted to your status.`;
      window.dispatchEvent(
        new CustomEvent("histora-live-notification", {
          detail: {
            title: "New status reaction",
            body
          }
        })
      );

      if ("Notification" in window && Notification.permission === "granted") {
        void Promise.resolve().then(() => {
          new Notification("New status reaction", { body });
        });
      }
    }
  }

  if (payload.kind === "notification.generic") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("histora-live-notification", {
          detail: {
            title: payload.title,
            body: payload.body
          }
        })
      );

      if ("Notification" in window && Notification.permission === "granted") {
        void Promise.resolve().then(() => {
          new Notification(payload.title, { body: payload.body });
        });
      }
    }
  }
};

async function loadFeedStore(accessToken: string, options?: { force?: boolean; silent?: boolean }) {
  const force = options?.force ?? false;
  const silent = options?.silent ?? false;

  if (activeFeedLoad) {
    return activeFeedLoad;
  }

  if (!force && feedStoreState.hydrated) {
    return;
  }

  if (!silent) {
    setFeedStoreState((current) => ({
      ...current,
      loading: true,
      error: ""
    }));
  }

  activeFeedLoad = Promise.all([
    apiRequest<ApiFeedStory[]>("/stories/feed", { accessToken }),
    apiRequest<ApiStatus[]>("/statuses", { accessToken }),
    apiRequest<ApiStatus[]>("/statuses/mine", { accessToken })
  ])
    .then(([stories, statuses, myStatuses]) => {
      setFeedStoreState((current) => ({
        ...current,
        feedPosts: stories.map((story) => {
          const nextPost = toFeedStoryRecord(story);
          return preserveResolvedFeedPostMedia(
            nextPost,
            current.feedPosts.find((post) => post.id === nextPost.id)
          );
        }),
        feedStatuses: statuses,
        myStatusIds: new Set(myStatuses.map((status) => status.id)),
        hydrated: true,
        loading: false,
        error: "",
        lastLoadedAt: Date.now()
      }));
      void Promise.all([
        hydrateFeedStoriesMedia(accessToken, stories),
        hydrateStatusesMedia(accessToken, statuses)
      ]).then(([hydratedStories, hydratedStatuses]) => {
        const hydratedPosts = hydratedStories.map((story) => toFeedStoryRecord(story));
        setFeedStoreState((current) => ({
          ...current,
          feedPosts: hydratedPosts.map((post) => {
            const existing = current.feedPosts.find((entry) => entry.id === post.id);
            return existing
              ? {
                  ...preserveResolvedFeedPostMedia(post, existing),
                  likes: existing.likes,
                  saves: existing.saves,
                  comments: existing.comments,
                  shares: existing.shares,
                  liked: existing.liked,
                  bookmarked: existing.bookmarked,
                  following: existing.following
                }
              : post;
          }),
          feedStatuses: hydratedStatuses.map((status) => {
            const existing = current.feedStatuses.find((entry) => entry.id === status.id);
            return existing
              ? {
                  ...status,
                  commentsCount: existing.commentsCount,
                  likesCount: existing.likesCount,
                  bookmarksCount: existing.bookmarksCount
                }
              : status;
          })
        }));
      });
    })
    .catch((error) => {
      setFeedStoreState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error && error.message.trim() ? error.message : "Could not load the public feed."
      }));
    })
    .finally(() => {
      activeFeedLoad = null;
    });

  return activeFeedLoad;
}

export async function hydrateFeedStore(accessToken: string, force = false) {
  return loadFeedStore(accessToken, { force, silent: false });
}

export async function revalidateFeedStore(accessToken: string) {
  return loadFeedStore(accessToken, { force: true, silent: true });
}

export function FeedRealtimeBridge({
  accessToken,
  currentUserId
}: {
  accessToken: string;
  currentUserId: string;
}) {
  useEffect(() => {
    void hydrateFeedStore(accessToken);

    const unsubscribeEvents = subscribeToAppEvents(
      accessToken,
      ["feed", "anonymous:public", `user:${currentUserId}`],
      (rawMessage) => {
        try {
          applyRealtimeMessage(rawMessage as RealtimeEventMessage, currentUserId, accessToken);
        } catch {
          return;
        }
      }
    );

    const handleStatusUpdate = (event: Event) => {
      const payload = (event as CustomEvent<{
        type: "created" | "deleted";
        status?: ApiStatus;
        statusId?: string;
      }>).detail;

      if (!payload) {
        return;
      }

      applyLocalStatusUpdate(payload);
    };

    const revalidateVisibleFeed = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      void revalidateFeedStore(accessToken);
    };

    window.addEventListener(statusUpdateEvent, handleStatusUpdate as EventListener);
    window.addEventListener("online", revalidateVisibleFeed);
    document.addEventListener("visibilitychange", revalidateVisibleFeed);

    return () => {
      unsubscribeEvents();
      window.removeEventListener(statusUpdateEvent, handleStatusUpdate as EventListener);
      window.removeEventListener("online", revalidateVisibleFeed);
      document.removeEventListener("visibilitychange", revalidateVisibleFeed);
    };
  }, [accessToken, currentUserId]);

  return null;
}
