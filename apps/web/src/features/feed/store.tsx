import { useEffect, useSyncExternalStore } from "react";

import {
  apiRequest,
  type ApiComment,
  type ApiFeedStory,
  type ApiStatus,
  subscribeToAppEvents,
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

const applyRealtimeMessage = (message: RealtimeEventMessage, currentUserId: string) => {
  if (message.type !== "event") {
    return;
  }

  const payload = message.payload;
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
    updateFeedStatuses((current) => {
      const next = current.filter((status) => status.id !== statusEvent.id);
      return [statusEvent, ...next];
    });
    return;
  }

  if (payload.kind === "status.deleted") {
    const statusId = (payload as { kind: "status.deleted"; statusId: string }).statusId;
    updateFeedStatuses((current) => current.filter((status) => status.id !== statusId));
    updateMyStatusIds((current) => {
      const next = new Set(current);
      next.delete(statusId);
      return next;
    });
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

  if (payload.kind === "follow.updated") {
    updateFeedPosts((current) =>
      current.map((post) =>
        post.handle.replace(/^@/, "") === payload.username ? { ...post, following: payload.active } : post
      )
    );
    return;
  }

  if (payload.kind === "notification.followed") {
    if (typeof window !== "undefined") {
      const body = `${payload.fullName} (@${payload.username}) followed your archive.`;
      window.dispatchEvent(
        new CustomEvent("histora-live-notification", {
          detail: {
            title: "New follower",
            body
          }
        })
      );

      if ("Notification" in window && Notification.permission === "granted") {
        void Promise.resolve().then(() => {
          new Notification("New follower", { body });
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
        feedPosts: stories.map((story) => toFeedStoryRecord(story)),
        feedStatuses: statuses,
        myStatusIds: new Set(myStatuses.map((status) => status.id)),
        hydrated: true,
        loading: false,
        error: "",
        lastLoadedAt: Date.now()
      }));
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
          applyRealtimeMessage(rawMessage as RealtimeEventMessage, currentUserId);
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

    window.addEventListener(statusUpdateEvent, handleStatusUpdate as EventListener);

    return () => {
      unsubscribeEvents();
      window.removeEventListener(statusUpdateEvent, handleStatusUpdate as EventListener);
    };
  }, [accessToken, currentUserId]);

  return null;
}
