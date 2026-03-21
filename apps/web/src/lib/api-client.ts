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
  helperContact?: {
    name: string;
    phone: string;
  } | null;
  createdAt: string;
};

export type ApiStatus = {
  id: string;
  authorName: string;
  authorUsername: string;
  body: string;
  anonymous: boolean;
  visibility: "public" | "followers" | "private";
  imageUrl?: string | null;
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
  tags: string[];
  readCount: number;
  reactionsCount: number;
  likesCount: number;
  bookmarksCount: number;
  sharesCount: number;
  commentsCount: number;
  liked: boolean;
  bookmarked: boolean;
  chapters: Array<{
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    imageUrls: string[];
    imageKeys?: string[];
    voiceNoteUrl?: string | null;
    voiceNoteKey?: string | null;
    moments: Array<{
      title: string;
      description: string;
      happenedAt: string;
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
    reads: string;
    status: string;
    updatedAt: string;
  }>;
  activity: Array<{
    title: string;
    detail: string;
    time: string;
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

export const getEventsSocketUrl = (accessToken: string) => {
  const baseUrl = new URL(apiBaseUrl);
  const protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${baseUrl.host}/ws/events?token=${encodeURIComponent(accessToken)}`;
};

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
  const signedUpload = await apiRequest<SignedUploadResponse>("/media/signed-upload", {
    method: "POST",
    accessToken,
    body: {
      fileName: asset.fileName,
      contentType: normalizedContentType
    }
  });

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
