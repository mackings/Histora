const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

let latestAccessToken: string | null = null;
const storyPrefetchCache = new Map<string, ApiStory>();
const storyPrefetchInflight = new Map<string, Promise<ApiStory>>();

export type AuthUser = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  subscriptionTier: "free" | "premium";
  emailVerified?: boolean;
};

export type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

export type VerificationResponse = {
  ok: true;
  email: string;
  verificationRequired?: true;
  alreadyVerified?: boolean;
};

export type ApiComment = {
  id: string;
  targetType: "status" | "storyChapter" | "anonymousMessage";
  targetId: string;
  authorName: string;
  authorUsername: string;
  body: string;
  replyToCommentId?: string;
  createdAt: string;
};

export type ApiAnonymousMessage = {
  id: string;
  recipientUsername: string;
  body: string;
  shareSlug: string;
  distribution: "app" | "external";
  commentsCount: number;
  helpFee: number;
  viewerRole?: "recipient" | "reader" | "sender" | null;
  canRequestHelp?: boolean;
  helpRequests?: Array<{
    id: string;
    createdAt: string;
    accepted: boolean;
    helperName?: string | null;
    helperUsername?: string | null;
  }>;
  helperContact?: {
    name: string;
    phone: string;
  } | null;
  createdAt: string;
};

export type ApiCollaborationInvite = {
  id: string;
  ownerName: string;
  ownerUsername: string;
  circle: "family" | "friend";
  storyId: string;
  storyTitle: string;
  storySlug: string;
  status: "pending" | "accepted";
  createdAt: string;
  acceptedAt?: string | null;
};

export type ApiStatus = {
  id: string;
  authorName: string;
  authorUsername: string;
  body: string;
  anonymous: boolean;
  visibility: "public" | "followers" | "private";
  authorVerified?: boolean;
  imageUrl?: string | null;
  imageKey?: string | null;
  shareSlug?: string | null;
  commentsCount: number;
  likesCount: number;
  bookmarksCount: number;
  createdAt: string;
};

export type ApiStory = {
  id: string;
  slug: string;
  status: "draft" | "published";
  title: string;
  summary: string;
  coverImageUrl?: string | null;
  coverImageKey?: string | null;
  visibility: "private" | "public" | "selected";
  anonymous: boolean;
  authorName: string;
  authorUsername: string;
  isOwner?: boolean;
  canEdit?: boolean;
  collaborative?: boolean;
  collaborationRevision?: number;
  collaborators?: Array<{
    id: string;
    fullName: string;
    username: string;
    joinedAt: string;
  }>;
  lastEditedByName?: string | null;
  lastEditedByUsername?: string | null;
  lastEditedAt?: string | null;
  authorVerified: boolean;
  tags: string[];
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  readCount: number;
  reactionsCount: number;
  likesCount: number;
  bookmarksCount: number;
  sharesCount: number;
  commentsCount: number;
  liked: boolean;
  bookmarked: boolean;
  following: boolean;
  chapters: Array<{
    id?: string;
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    createdByName?: string | null;
    createdByUsername?: string | null;
    createdAt?: string | null;
    lastEditedByName?: string | null;
    lastEditedByUsername?: string | null;
    lastEditedAt?: string | null;
    imageUrls: string[];
    imageKeys?: string[];
    voiceNoteUrl?: string | null;
    voiceNoteKey?: string | null;
    moments: Array<{
      id?: string;
      title: string;
      description: string;
      happenedAt: string;
      createdByName?: string | null;
      createdByUsername?: string | null;
      createdAt?: string | null;
      lastEditedByName?: string | null;
      lastEditedByUsername?: string | null;
      lastEditedAt?: string | null;
      imageUrls: string[];
      imageKeys?: string[];
      voiceNoteUrl?: string | null;
      voiceNoteKey?: string | null;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type ApiFeedStory = ApiStory & {
  chapterCount: number;
  commentCount: number;
};

export type ProfileDashboard = {
  user: AuthUser & {
    bio: string;
    location: string;
    verificationStatus: "none" | "pending" | "verified";
    verifiedAt?: string | null;
    profileVisibility: "public" | "selected" | "private";
    defaultStoryVisibility: "public" | "selected" | "private" | "anonymous";
    allowCommentsByDefault: boolean;
    allowHelpRequests: boolean;
    hideReadCounts: boolean;
    showAnonymousActivity: boolean;
  };
  metrics: {
    publishedStories: number;
    totalChapters: number;
    totalReads: number;
    anonymousPosts: number;
    followers: number;
    following: number;
  };
  stories: Array<{
    id: string;
    title: string;
    visibility: string;
    chapters: string;
    chapterCount: number;
    reads: string;
    readsCount: number;
    likesCount: number;
    bookmarksCount: number;
    sharesCount: number;
    commentsCount: number;
    status: string;
    updatedAt: string;
  }>;
  activity: Array<{
    title: string;
    detail: string;
    time: string;
  }>;
  followersList: Array<{
    id: string;
    fullName: string;
    username: string;
    avatarUrl?: string | null;
    verified: boolean;
    followedAt: string;
    followingBack: boolean;
  }>;
  followingList: Array<{
    id: string;
    fullName: string;
    username: string;
    avatarUrl?: string | null;
    verified: boolean;
    followedAt: string;
    followingBack: boolean;
  }>;
};

export type ProfileSession = {
  id: string;
  userAgent: string;
  ipAddress?: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  active: boolean;
};

export type ProfileTrustedDevice = {
  id: string;
  label: string;
  userAgent: string;
  ipAddress?: string | null;
  approvedAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  active: boolean;
  pushEnabled?: boolean;
};

export type PushPublicKeyResponse = {
  publicKey: string | null;
};

export type PushSyncResult = {
  supported: boolean;
  enabled: boolean;
  message: string;
};

export type SignedUploadResponse = {
  uploadUrl: string;
  objectKey: string;
  publicUrl?: string | null;
};

export type SignedReadResponse = {
  objectKey: string;
  readUrl: string;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const setLatestAccessToken = (token: string | null) => {
  latestAccessToken = token;
};

type WebSocketTicketScope = "events" | "transcription";

export async function issueWebSocketTicket(scope: WebSocketTicketScope, accessToken?: string | null) {
  const result = await apiRequest<{ ticket: string; expiresIn: number }>("/auth/ws-ticket", {
    method: "POST",
    accessToken: accessToken ?? latestAccessToken,
    body: { scope }
  });
  return result.ticket;
}

export const getEventsSocketUrl = (ticket: string) => {
  const baseUrl = new URL(apiBaseUrl);
  const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${baseUrl.host}/ws/events?ticket=${encodeURIComponent(ticket)}`;
};

export function createAppEventsConnection(
  accessToken: string,
  handlers?: {
    onMessage?: (message: unknown) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: () => void;
  }
) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let closedManually = false;
  const subscriptions = new Set<string>();
  const pendingMessages: string[] = [];

  const cleanupReconnectTimer = () => {
    if (reconnectTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const flushSubscriptions = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    subscriptions.forEach((channel) => {
      socket?.send(JSON.stringify({ type: "subscribe", channel }));
    });
  };

  const flushPendingMessages = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingMessages.length > 0) {
      const nextPayload = pendingMessages.shift();
      if (!nextPayload) {
        continue;
      }
      socket.send(nextPayload);
    }
  };

  const connect = () => {
    if (closedManually || typeof window === "undefined") {
      return;
    }

    void issueWebSocketTicket("events", accessToken)
      .then((ticket) => {
        if (closedManually) {
          return;
        }
        socket = new WebSocket(getEventsSocketUrl(ticket));

        socket.addEventListener("open", () => {
          handlers?.onOpen?.();
          flushSubscriptions();
          flushPendingMessages();
        });

        socket.addEventListener("message", (event) => {
          try {
            handlers?.onMessage?.(JSON.parse(event.data as string));
          } catch {
            return;
          }
        });

        socket.addEventListener("error", () => {
          handlers?.onError?.();
          socket?.close();
        });

        socket.addEventListener("close", () => {
          handlers?.onClose?.();
          socket = null;
          if (closedManually || typeof window === "undefined") {
            return;
          }

          cleanupReconnectTimer();
          reconnectTimer = window.setTimeout(() => {
            connect();
          }, 1000);
        });
      })
      .catch(() => {
        handlers?.onError?.();
        if (closedManually || typeof window === "undefined") {
          return;
        }
        cleanupReconnectTimer();
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 1000);
      });
  };

  connect();

  return {
    subscribe(channels: string[]) {
      channels.forEach((channel) => subscriptions.add(channel));
      flushSubscriptions();
    },
    send(payload: unknown) {
      const serialized = JSON.stringify(payload);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(serialized);
        return;
      }

      pendingMessages.push(serialized);
    },
    close() {
      closedManually = true;
      cleanupReconnectTimer();
      socket?.close();
    }
  };
}

export function subscribeToAppEvents(
  accessToken: string,
  channels: string[],
  onMessage: (message: unknown) => void
) {
  const connection = createAppEventsConnection(accessToken, { onMessage });
  connection.subscribe(channels);

  return () => {
    connection.close();
  };
}

export const getCachedStory = (slug: string) => storyPrefetchCache.get(slug) ?? null;

export const updateCachedStoryCounts = (
  storyId: string,
  updater: (story: ApiStory) => ApiStory
) => {
  for (const [slug, story] of storyPrefetchCache.entries()) {
    if (story.id === storyId) {
      storyPrefetchCache.set(slug, updater(story));
    }
  }
};

export const updateCachedStoriesByAuthorUsername = (
  username: string,
  updater: (story: ApiStory) => ApiStory
) => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) {
    return;
  }

  for (const [slug, story] of storyPrefetchCache.entries()) {
    if (story.authorUsername.trim().toLowerCase() === normalizedUsername) {
      storyPrefetchCache.set(slug, updater(story));
    }
  }
};

export async function apiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    headers?: Record<string, string>;
    rawBody?: BodyInit;
    accessToken?: string | null;
  }
) {
  const method = options?.method ?? "GET";
  const hasRawBody = typeof options?.rawBody !== "undefined";
  const isJsonBody = typeof options?.body !== "undefined" && !hasRawBody;
  const executeRequest = async (tokenOverride?: string | null) =>
    fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" ? { "X-Requested-With": "XMLHttpRequest" } : {}),
        ...(tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {}),
        ...(options?.headers ?? {})
      },
      body: hasRawBody ? options?.rawBody : isJsonBody ? JSON.stringify(options.body) : undefined
    });

  let effectiveToken = options?.accessToken ?? latestAccessToken;
  let response = await executeRequest(effectiveToken);

  if (response.status === 401 && effectiveToken) {
    const refreshResponse = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (refreshResponse.ok) {
      const refreshedSession = (await refreshResponse.json()) as AuthSession;
      effectiveToken = refreshedSession.accessToken;
      setLatestAccessToken(refreshedSession.accessToken);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("histora-auth-session", { detail: refreshedSession }));
      }
      response = await executeRequest(effectiveToken);
    }
  }

  if (!response.ok) {
    let message = "Request failed.";
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if ((response.headers.get("content-type") ?? "").includes("application/json")) {
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        code?: string;
        details?: Record<string, unknown>;
        issues?: {
          formErrors?: string[];
          fieldErrors?: Record<string, string[] | undefined>;
        };
      };
      message = payload.message ?? payload.error ?? message;
      code = payload.code;
      details = payload.details;

      if (payload.issues?.fieldErrors) {
        const firstFieldError = Object.values(payload.issues.fieldErrors)
          .flat()
          .find((value): value is string => typeof value === "string" && value.trim().length > 0);

        if (firstFieldError) {
          message = firstFieldError;
        }
      }
    } else {
      const text = await response.text();
      if (text.trim()) {
        message = text;
      }
    }

    throw new ApiRequestError(message, response.status, code, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function prefetchStoryBySlug(slug: string, accessToken?: string | null) {
  const cachedStory = storyPrefetchCache.get(slug);
  if (cachedStory) {
    return cachedStory;
  }

  const inflightRequest = storyPrefetchInflight.get(slug);
  if (inflightRequest) {
    return inflightRequest;
  }

  const request = apiRequest<ApiStory>(`/stories/public/${slug}`, { accessToken })
    .then((story) => {
      storyPrefetchCache.set(slug, story);
      storyPrefetchInflight.delete(slug);
      return story;
    })
    .catch((error) => {
      storyPrefetchInflight.delete(slug);
      throw error;
    });

  storyPrefetchInflight.set(slug, request);
  return request;
}

export async function uploadMediaAsset(
  accessToken: string,
  asset: { blob: Blob; fileName: string; contentType: string }
) {
  const normalizedContentType = asset.contentType.split(";")[0]?.trim().toLowerCase() || asset.contentType;
  let signedUpload: SignedUploadResponse | null = null;

  try {
    signedUpload = await apiRequest<SignedUploadResponse>("/media/signed-upload", {
      method: "POST",
      accessToken,
      body: {
        fileName: asset.fileName,
        contentType: normalizedContentType
      }
    });
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.code !== "MEDIA_SCAN_REQUIRED") {
      throw error;
    }
  }

  if (!signedUpload) {
    return apiRequest<SignedReadResponse & { objectKey: string }>(
      `/media/upload?fileName=${encodeURIComponent(asset.fileName)}&contentType=${encodeURIComponent(normalizedContentType)}`,
      {
        method: "POST",
        accessToken,
        headers: {
          "Content-Type": normalizedContentType
        },
        rawBody: asset.blob
      }
    );
  }

  try {
    const uploadResponse = await fetch(signedUpload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": normalizedContentType
      },
      body: asset.blob
    });

    if (!uploadResponse.ok) {
      throw new Error("Direct upload failed.");
    }

    if (signedUpload.publicUrl) {
      return {
        objectKey: signedUpload.objectKey,
        readUrl: signedUpload.publicUrl
      };
    }

    const signedRead = await apiRequest<SignedReadResponse>(
      `/media/signed-read?objectKey=${encodeURIComponent(signedUpload.objectKey)}`,
      {
        accessToken
      }
    );

    return {
      objectKey: signedUpload.objectKey,
      readUrl: signedRead.readUrl
    };
  } catch {
    return apiRequest<SignedReadResponse & { objectKey: string }>(
      `/media/upload?fileName=${encodeURIComponent(asset.fileName)}&contentType=${encodeURIComponent(normalizedContentType)}`,
      {
        method: "POST",
        accessToken,
        headers: {
          "Content-Type": normalizedContentType
        },
        rawBody: asset.blob
      }
    );
  }
}
