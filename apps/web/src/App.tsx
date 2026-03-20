import { Fragment, useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  chapterDrafts,
  feedPreview,
  pricingPlans,
  profileActivity,
  profileSavedShelf,
  profileSettings,
  profileStats,
  profileStories,
  readingShelves,
  storyCircles,
  timelineMoments
} from "./app-data";
import feedStory from "./assets/feed-story.svg";
import heroMemory from "./assets/hero-memory.svg";

function Icon({
  name,
  className
}: {
  name:
    | "home"
    | "feed"
    | "write"
    | "premium"
    | "signin"
    | "spark"
    | "bookmark"
    | "heart"
    | "comment"
    | "share"
    | "bolt"
    | "arrow"
    | "check"
    | "close"
    | "person"
    | "download"
    | "mic"
    | "pause"
    | "eye"
    | "eyeOff"
    | "bold"
    | "italic"
    | "quote"
    | "checklist"
    | "timeline"
    | "note";
  className?: string;
}) {
  const paths = {
    home: "M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3v-10.5Z",
    feed: "M4 5h16v4H4V5Zm0 5.5h10V15H4v-4.5Zm0 6h16V19H4v-2.5Z",
    write: "M4 17.25V20h2.75L18.8 7.95l-2.75-2.75L4 17.25Z M20.7 6.05a1 1 0 0 0 0-1.4l-1.35-1.35a1 1 0 0 0-1.4 0l-1.05 1.05 2.75 2.75 1.05-1.05Z",
    premium: "M12 3l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.7 6.8 19.99l1-5.78-4.22-4.1 5.82-.85L12 3Z",
    signin: "M10 17l1.4-1.4-2.6-2.6H21v-2H8.8l2.6-2.6L10 7l-5 5 5 5Zm-7 4h7v-2H3V5h7V3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z",
    spark: "M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Zm7 13l.95 2.55L22.5 18l-2.55.45L19 21l-.95-2.55L15.5 18l2.55-.45L19 15ZM5 14l1.2 3.2L9.4 18l-3.2 1.2L5 22l-1.2-2.8L.6 18l3.2-.8L5 14Z",
    bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z",
    heart: "M12 20.5 4.9 13.9a4.8 4.8 0 0 1 6.8-6.8L12 7.4l.3-.3a4.8 4.8 0 1 1 6.8 6.8L12 20.5Z",
    comment: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z",
    share: "M18 16a3 3 0 0 0-2.4 1.2l-6.6-3.3a3.2 3.2 0 0 0 0-1.8l6.6-3.3A3 3 0 1 0 15 7a3.2 3.2 0 0 0 .1.7L8.5 11a3 3 0 1 0 0 2l6.6 3.3A3 3 0 1 0 18 16Z",
    bolt: "M13 2 4 13h6l-1 9 9-11h-6l1-9Z",
    arrow: "M5 12h12.2l-4.1 4.1 1.4 1.4L21 11l-6.5-6.5-1.4 1.4 4.1 4.1H5v2Z",
    check: "m9.3 16.6-4-4 1.4-1.4 2.6 2.6 8-8 1.4 1.4-9.4 9.4Z",
    close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z",
    person: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.7 0-8.5 2.6-8.5 5.8 0 .7.6 1.2 1.2 1.2h14.6c.7 0 1.2-.5 1.2-1.2C20.5 16.6 16.7 14 12 14Z",
    download: "M11 4h2v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4 2.6 2.6V4Zm-6 14h14v2H5v-2Z",
    mic: "M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z",
    pause: "M7 5h3v14H7V5Zm7 0h3v14h-3V5Z",
    eye: "M12 6c5.1 0 9.3 3.3 10.8 6-1.5 2.7-5.7 6-10.8 6S2.7 14.7 1.2 12C2.7 9.3 6.9 6 12 6Zm0 2C8.1 8 4.8 10.3 3.4 12 4.8 13.7 8.1 16 12 16s7.2-2.3 8.6-4C19.2 10.3 15.9 8 12 8Zm0 1.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z",
    eyeOff:
      "m4.3 3 16.7 16.7-1.4 1.4-2.7-2.7A12.6 12.6 0 0 1 12 18c-5.1 0-9.3-3.3-10.8-6A14.7 14.7 0 0 1 6 7.2L2.9 4.1 4.3 3Zm3.2 5.9A8.9 8.9 0 0 0 3.4 12C4.8 13.7 8.1 16 12 16c1.2 0 2.2-.2 3.2-.6l-1.8-1.8a3.5 3.5 0 0 1-4.8-4.8L7.5 8.9Zm4.8-2.9c5.1 0 9.3 3.3 10.8 6a14 14 0 0 1-3.8 4.2l-1.4-1.4A10.2 10.2 0 0 0 20.6 12C19.2 10.3 15.9 8 12 8c-.3 0-.7 0-1 .1L9.4 6.5c.8-.3 1.7-.5 2.6-.5Z",
    bold: "M8 5h5.5a4 4 0 0 1 2.3 7.3A4.2 4.2 0 0 1 13.2 20H8V5Zm3 6h2.1a1.8 1.8 0 1 0 0-3.6H11V11Zm0 6.2h2.5a2 2 0 0 0 0-4H11v4Z",
    italic: "M10 5h9v2h-3.2l-3.6 10H15v2H6v-2h3.2l3.6-10H10V5Z",
    quote: "M7.5 9A2.5 2.5 0 0 1 10 11.5c0 2.6-2 4.7-4.5 4.9v-2A2.9 2.9 0 0 0 8 11.7H5.5V9h2Zm8 0A2.5 2.5 0 0 1 18 11.5c0 2.6-2 4.7-4.5 4.9v-2A2.9 2.9 0 0 0 16 11.7h-2.5V9h2Z",
    checklist: "M9 7 7.6 5.6 6.2 7 9 9.8 13.8 5 12.4 3.6 9 7Zm0 10-1.4-1.4-1.4 1.4L9 19.8l4.8-4.8-1.4-1.4L9 17Zm6-9h5v2h-5V8Zm0 8h5v2h-5v-2Z",
    timeline: "M7 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm10 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 7h2v10H6V7Zm10 0h2v10h-2V7ZM9 10h6v2H9v-2Z",
    note: "M6 4h12a2 2 0 0 1 2 2v10l-4 4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h8V8H8Zm0 4v2h5v-2H8Z"
  } as const;

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

function useHomeIntroVoice() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/" || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const hasPlayed = window.sessionStorage.getItem("histora-home-voice-played");
    if (hasPlayed) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance("Histora");
    utterance.rate = 0.58;
    utterance.pitch = 1.18;
    utterance.volume = 0.72;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find((voice) =>
        /female|woman|zira|samantha|karen|moira|ava|allison|aria|jenny/i.test(voice.name)
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    };

    const speak = () => {
      pickVoice();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      window.sessionStorage.setItem("histora-home-voice-played", "true");
    };

    window.speechSynthesis.onvoiceschanged = pickVoice;

    const timer = window.setTimeout(speak, 650);

    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [location.pathname]);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const normalizedLabel = typeof children === "string" ? children.replaceAll("_", " ") : children;
  return <span className="section-label">{normalizedLabel}</span>;
}

type StatusEntry = {
  name: string;
  meta: string;
  tone: "orange" | "ink" | "add" | "blue";
  label: string;
  contentTitle: string;
  contentBody: string;
  anonymous?: boolean;
  shareSlug?: string;
  comments?: Array<{ author: string; text: string }>;
  helpFee?: number;
};

type StoredAnonymousStatus = {
  id: string;
  title: string;
  body: string;
  meta: string;
  shareSlug: string;
  comments: Array<{ author: string; text: string }>;
  helpFee: number;
  distribution: "app" | "external";
  source: "posted" | "received";
  helperContact?: {
    name: string;
    phone: string;
  } | null;
};

type AnonymousFeedSource = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  meta: string;
  comments: Array<{ author: string; text: string }>;
  helpFee: number;
  fromQuickMemory: boolean;
};

type AuthUser = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  subscriptionTier: "free" | "premium";
};

type AuthSession = {
  accessToken: string;
  user: AuthUser;
};

type ApiComment = {
  id: string;
  targetType: "status" | "storyChapter" | "anonymousMessage";
  targetId: string;
  authorName: string;
  authorUsername: string;
  body: string;
  replyToCommentId?: string;
  createdAt: string;
};

type ApiAnonymousMessage = {
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

type ApiStory = {
  id: string;
  slug: string;
  status: "draft" | "published";
  title: string;
  summary: string;
  coverImageUrl?: string | null;
  visibility: "private" | "public" | "selected";
  anonymous: boolean;
  authorName: string;
  authorUsername: string;
  tags: string[];
  readCount: number;
  reactionsCount: number;
  chapters: Array<{
    title: string;
    body: string;
    type: "memory" | "reflection" | "milestone" | "anonymous";
    order: number;
    imageUrls: string[];
    voiceNoteUrl?: string | null;
    moments: Array<{
      title: string;
      description: string;
      happenedAt: string;
      imageUrls: string[];
      voiceNoteUrl?: string | null;
    }>;
  }>;
  createdAt: string;
  updatedAt: string;
};

type ApiFeedStory = ApiStory & {
  chapterCount: number;
  commentCount: number;
};

type ProfileDashboard = {
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

type ContributorInviteRecord = {
  id: string;
  email: string;
  circle: "family" | "friend";
  story: string;
  status: string;
  createdAt: string;
};

type ProfileSession = {
  id: string;
  userAgent: string;
  ipAddress?: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
  active: boolean;
};

const anonymousStatusStorageKey = "histora-anonymous-feed-v1";
const anonymousStatusUpdateEvent = "histora-anonymous-status-updated";
const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

async function apiRequest<T>(
  path: string,
  options?: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    accessToken?: string | null;
  }
) {
  const method = options?.method ?? "GET";
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-Requested-With": "XMLHttpRequest" } : {}),
      ...(options?.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {})
    },
    body: options?.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let message = "Request failed.";

    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      message = payload.message ?? payload.error ?? message;
    } catch {
      const text = await response.text();
      if (text.trim()) {
        message = text;
      }
    }

    throw new ApiRequestError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const formatAnonymousMeta = (createdAt: string) =>
  new Date(createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });

const toStoredAnonymousStatus = (
  message: ApiAnonymousMessage,
  source: "posted" | "received",
  comments: Array<{ author: string; text: string }> = []
): StoredAnonymousStatus => ({
  id: message.id,
  title: message.body.slice(0, 72),
  body: message.body,
  meta: formatAnonymousMeta(message.createdAt),
  shareSlug: message.shareSlug,
  comments,
  helpFee: message.helpFee,
  distribution: message.distribution,
  source,
  helperContact: message.helperContact ?? null
});

const storyTypeToGenre = (type: ApiStory["chapters"][number]["type"]) => {
  if (type === "milestone") {
    return "Milestone";
  }
  if (type === "reflection") {
    return "Reflection";
  }
  if (type === "anonymous") {
    return "Advice";
  }
  return "Life archive";
};

const toFeedStoryRecord = (story: ApiFeedStory): FeedStoryRecord => ({
  author: story.authorName,
  handle: `@${story.authorUsername}`,
  title: story.title,
  excerpt: story.summary,
  reads: String(story.readCount),
  visibility: story.anonymous ? "ANON" : story.visibility.toUpperCase(),
  genre: storyTypeToGenre(story.chapters[0]?.type ?? "memory"),
  chapterCount: story.chapterCount,
  comments: story.commentCount,
  saves: String(story.reactionsCount),
  slug: story.slug,
  anonymous: story.anonymous,
  shares: 0,
  likes: story.reactionsCount,
  liked: false,
  bookmarked: false,
  following: false,
  helpFee: story.anonymous ? 8 : undefined,
  chapters: story.chapters.map((chapter) => ({
    id: `${story.id}:${chapter.order}`,
    title: chapter.title,
    body: chapter.body.replace(/<[^>]+>/g, " "),
    summary: chapter.body.replace(/<[^>]+>/g, " ").slice(0, 160),
    likes: 0,
    liked: false,
    comments: [],
    images: chapter.imageUrls.map((src, index) => ({
      src,
      alt: `${chapter.title} attachment ${index + 1}`
    })),
    voiceNotes: chapter.voiceNoteUrl
      ? [{ name: `Voice note ${chapter.order}`, detail: "Attached voice note", src: chapter.voiceNoteUrl }]
      : [],
    timeline: chapter.moments.map((moment) => ({
      label: new Date(moment.happenedAt).toLocaleDateString(),
      title: moment.title,
      body: moment.description
    }))
  }))
});

const readStoredAnonymousStatuses = (): StoredAnonymousStatus[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedStatuses = window.localStorage.getItem(anonymousStatusStorageKey);
    if (!savedStatuses) {
      return [];
    }

    const parsedStatuses = JSON.parse(savedStatuses);
    if (!Array.isArray(parsedStatuses)) {
      return [];
    }

    return parsedStatuses.filter(
      (entry): entry is StoredAnonymousStatus =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof entry.id === "string" &&
            typeof entry.title === "string" &&
            typeof entry.body === "string" &&
            typeof entry.meta === "string" &&
            typeof entry.shareSlug === "string" &&
            Array.isArray(entry.comments) &&
            typeof entry.helpFee === "number"
        )
    ).map((entry) => ({
      ...entry,
      distribution: entry.distribution === "external" ? "external" : "app",
      source: entry.source === "received" ? "received" : "posted",
      helperContact:
        entry.helperContact &&
        typeof entry.helperContact === "object" &&
        typeof entry.helperContact.name === "string" &&
        typeof entry.helperContact.phone === "string"
          ? entry.helperContact
          : null
    }));
  } catch {
    return [];
  }
};

const writeStoredAnonymousStatuses = (entries: StoredAnonymousStatus[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(anonymousStatusStorageKey, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(anonymousStatusUpdateEvent));
};

const storedAnonymousStatusToEntry = (entry: StoredAnonymousStatus): StatusEntry => ({
  name: "Anonymous",
  meta: entry.meta,
  tone: "ink",
  label: "Advice status",
  contentTitle: entry.title,
  contentBody: entry.body,
  anonymous: true,
  shareSlug: entry.shareSlug,
  comments: entry.comments,
  helpFee: entry.helpFee
});

function AppShell({ children, isLoggedIn }: { children: React.ReactNode; isLoggedIn: boolean }) {
  useHomeIntroVoice();
  const location = useLocation();

  if (!isLoggedIn && location.pathname === "/") {
    return <div className="onboarding-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/studio")) {
    return <div className="studio-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/feed/story/")) {
    return <div className="feed-reader-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/anonymous")) {
    return <div className="feed-reader-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/profile")) {
    return <div className="profile-focus-shell">{children}</div>;
  }

  if (
    location.pathname === "/signin" ||
    location.pathname === "/signup" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password"
  ) {
    return <div className="auth-focus-shell">{children}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <NavLink className="brandmark card" to="/">
          <span className="brand-lockup">
            <span className="brand-kicker">HISTORA_PROTOCOL</span>
            <strong>Histora</strong>
          </span>
          <span className="brand-badge">v2.0</span>
        </NavLink>

        <nav className="rail-nav card">
          <NavLink to="/feed">
            <Icon className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <Icon className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/anonymous">
            <Icon className="nav-icon" name="spark" />
            Anonymous
          </NavLink>
          <NavLink to="/profile">
            <Icon className="nav-icon" name="person" />
            Profile
          </NavLink>
          <NavLink to="/signin">
            <Icon className="nav-icon" name="signin" />
            Sign in
          </NavLink>
        </nav>

        <article className="rail-card card dark-card">
          <SectionLabel>ARCHIVE_ACCESS</SectionLabel>
          <h3>WRITE LIFE IN CHAPTERS.</h3>
          <p>Private stories, public storytelling, anonymous advice, and selected-reader drops inside one archive.</p>
          <NavLink className="primary-action" to="/signup">
            START WRITING
            <Icon className="button-icon" name="arrow" />
          </NavLink>
        </article>
      </aside>

      <div className="main-column">
        <header className="topbar card">
          <div className="topbar-copy">
            <SectionLabel>LIVE_ARCHIVE_NETWORK</SectionLabel>
            <strong>Social storytelling for real lives.</strong>
            <span>Build chapters, timeline drops, memory statuses, and controlled circles with a sharper editorial interface.</span>
          </div>
          <div className="topbar-actions">
            <NavLink className="ghost-action" to="/feed">
              EXPLORE
            </NavLink>
            <NavLink className="primary-action" to="/studio">
              NEW STORY
              <Icon className="button-icon" name="arrow" />
            </NavLink>
          </div>
        </header>

        {children}

        <nav className="mobile-dock card">
          <NavLink to="/feed">
            <Icon className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <Icon className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/anonymous">
            <Icon className="nav-icon" name="spark" />
            Anonymous
          </NavLink>
          <NavLink to="/profile">
            <Icon className="nav-icon" name="person" />
            Profile
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

function StoryCirclesRow() {
  const navigate = useNavigate();
  const emojiGroups = [
    { label: "Recent", icon: "🕘", emojis: ["😂", "❤️", "😭", "🔥", "🙏", "✨"] },
    { label: "Smileys", icon: "😊", emojis: ["😊", "😄", "😁", "😂", "🥹", "😮", "😌", "🤭"] },
    { label: "Love", icon: "💛", emojis: ["❤️", "💙", "💜", "💞", "💫", "🌈", "✨", "🫶"] },
    { label: "Support", icon: "🙌", emojis: ["👏", "🙏", "🙌", "🤍", "💭", "🤝", "🌟", "🕊️"] }
  ];
  const imageLibrary = [
    "Soft gradient card",
    "Journal page",
    "City window",
    "Memory board",
    "Polaroid frame",
    "Voice waveform"
  ];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [seenStories, setSeenStories] = useState<number[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState("Today I finally wrote the chapter I kept postponing.");
  const [statusStyle, setStatusStyle] = useState<"plain" | "bold" | "italic">("plain");
  const [statusTone, setStatusTone] = useState<"sky" | "mint" | "peach">("sky");
  const [showEmojiLibrary, setShowEmojiLibrary] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeEmojiGroup, setActiveEmojiGroup] = useState("Recent");
  const [isAnonymousComposer, setIsAnonymousComposer] = useState(false);
  const [statusItems, setStatusItems] = useState<StatusEntry[]>(storyCircles as StatusEntry[]);
  const [shareFeedback, setShareFeedback] = useState("");
  const [helpRequestTarget, setHelpRequestTarget] = useState<StatusEntry | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);

  const activeStatus = activeIndex === null ? null : statusItems[activeIndex];

  useEffect(() => {
    if (activeIndex === null) {
      setProgress(0);
      setIsPaused(false);
      return;
    }

    setSeenStories((current) => (current.includes(activeIndex) ? current : [...current, activeIndex]));
    setProgress(0);
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null || isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const nextProgress = current + 4;

        if (nextProgress < 100) {
          return nextProgress;
        }

        setActiveIndex((currentIndex) => {
          if (currentIndex === null) {
            return null;
          }

          return currentIndex < statusItems.length - 1 ? currentIndex + 1 : null;
        });

        return 100;
      });
    }, 160);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused]);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setActiveIndex((current) => (current === null ? 0 : Math.min(current + 1, statusItems.length - 1)));
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => (current === null ? 0 : Math.max(current - 1, 0)));
      }

      if (event.key === "Escape") {
        setActiveIndex(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex]);

  const goToPrevious = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return 0;
      }

      return Math.max(current - 1, 0);
    });
  };

  const goToNext = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return 0;
      }

      return current < statusItems.length - 1 ? current + 1 : null;
    });
  };

  const openStory = (index: number) => {
    if (statusItems[index]?.tone === "add") {
      setIsComposerOpen(true);
      setShowEmojiLibrary(false);
      setShowImageLibrary(false);
      setIsAnonymousComposer(false);
      setShareFeedback("");
      return;
    }

    setActiveIndex(index);
    setShareFeedback("");
  };

  const insertSnippet = (snippet: string) => {
    setStatusDraft((current) => `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}${snippet}`);
  };

  const createShareSlug = () => `anon-${Date.now().toString(36)}`;
  const getStatusShareLink = (entry: StatusEntry) => {
    if (typeof window === "undefined" || !entry.shareSlug) {
      return "";
    }

    return `${window.location.origin}/anonymous/${entry.shareSlug}`;
  };

  const copyStatusLink = async (entry: StatusEntry) => {
    const link = getStatusShareLink(entry);
    if (!link) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setShareFeedback("Anonymous status link copied.");
    } catch {
      setShareFeedback("Could not copy the link on this device.");
    }
  };

  const downloadAnonymousStatusImage = (entry: StatusEntry) => {
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");

    if (!context) {
      setShareFeedback("Could not prepare the anonymous status image.");
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#f6f9ff");
    gradient.addColorStop(1, "#fff0e7");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1080, 1350);
    context.fillStyle = "#1b2440";
    context.font = "700 46px Space Grotesk, sans-serif";
    context.fillText("HISTORA // ANONYMOUS STATUS", 80, 120);
    context.font = "700 72px Space Grotesk, sans-serif";
    context.fillText(entry.contentTitle.slice(0, 24), 80, 240);
    context.font = "400 42px Manrope, sans-serif";

    const words = entry.contentBody.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (context.measureText(nextLine).width > 880) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = nextLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    lines.slice(0, 10).forEach((line, index) => {
      context.fillText(line, 80, 360 + index * 60);
    });
    context.font = "700 36px Space Grotesk, sans-serif";
    context.fillStyle = "#cc5a24";
    context.fillText(`Advice replies stay anonymous // ${entry.meta}`, 80, 1160);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${entry.shareSlug ?? "histora-anonymous-status"}.png`;
    link.click();
    setShareFeedback("Anonymous status image saved to your device.");
  };

  const postStatus = () => {
    const shareSlug = isAnonymousComposer ? createShareSlug() : undefined;
    const nextEntry: StatusEntry = {
      name: isAnonymousComposer ? "Anonymous" : "Your status",
      meta: "Just now",
      tone: isAnonymousComposer ? "ink" : "blue",
      label: isAnonymousComposer ? "Advice status" : "Memory status",
      contentTitle: isAnonymousComposer ? "Anonymous advice status" : "Fresh memory status",
      contentBody: statusDraft,
      anonymous: isAnonymousComposer,
      shareSlug,
      comments: isAnonymousComposer
        ? [
            { author: "Reply 1", text: "You are not overreacting. Protect your peace first." },
            { author: "Reply 2", text: "Take your time. You can ask for help without revealing yourself." }
          ]
        : [],
      helpFee: isAnonymousComposer ? 8 : undefined
    };

    if (isAnonymousComposer && shareSlug) {
      const currentStoredStatuses = readStoredAnonymousStatuses();
      writeStoredAnonymousStatuses([
        {
          id: shareSlug,
          title: nextEntry.contentTitle,
          body: nextEntry.contentBody,
          meta: nextEntry.meta,
          shareSlug,
          comments: nextEntry.comments ?? [],
          helpFee: nextEntry.helpFee ?? 8,
          distribution: "app",
          source: "posted",
          helperContact: null
        },
        ...currentStoredStatuses
      ]);

      setStatusDraft("Today I finally wrote the chapter I kept postponing.");
      setSelectedImage(null);
      setIsComposerOpen(false);
      setIsAnonymousComposer(false);
      navigate("/anonymous");
      return;
    }

    setStatusItems((current) => [current[0], nextEntry, ...current.slice(1)]);
    setStatusDraft("Today I finally wrote the chapter I kept postponing.");
    setSelectedImage(null);
    setIsComposerOpen(false);
    setIsAnonymousComposer(false);
    setShareFeedback("Status posted.");
    setActiveIndex(1);
  };

  const confirmHelpRequest = () => {
    if (!helpRequestTarget || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    const targetName = helpRequestTarget.name === "Anonymous" ? "this anonymous poster" : helpRequestTarget.name;
    setHelpRequestTarget(null);
    setConsentAccepted(false);
    setShareFeedback(`Consent fee confirmed. The request to help ${targetName} is now pending.`);
  };

  return (
    <>
      <section aria-label="Status updates" className="story-circles card">
        <div className="section-head">
          <div>
            <SectionLabel>STATUS_STREAM</SectionLabel>
            <h2>Quick memory drops</h2>
          </div>
          <span aria-label="Scroll sideways" className="section-meta">↔</span>
        </div>

        <div className="status-scroll">
          {statusItems.map((circle, index) => (
            <button
              className={`status-bubble ${seenStories.includes(index) ? "status-bubble-seen" : ""}`}
              key={circle.name}
              onClick={() => openStory(index)}
              type="button"
            >
              <span className={`status-ring tone-${circle.tone}`}>
                <span className="status-avatar">{circle.tone === "add" ? "+" : circle.name.slice(0, 1)}</span>
              </span>
              <strong>{circle.name}</strong>
              <span className="status-bubble-meta">{circle.meta}</span>
            </button>
          ))}
        </div>
      </section>

      {isComposerOpen ? (
        <div className="status-viewer-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <article className="status-composer card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>YOUR_STATUS</SectionLabel>
                <h3>Write a memory status</h3>
              </div>
              <button aria-label="Close status composer" className="icon-chip" onClick={() => setIsComposerOpen(false)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>

            <div className="status-toolbar">
              <button
                className={statusStyle === "bold" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("bold")}
                type="button"
              >
                B
              </button>
              <button
                className={statusStyle === "italic" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("italic")}
                type="button"
              >
                I
              </button>
              <button
                className={statusStyle === "plain" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("plain")}
                type="button"
              >
                Aa
              </button>
              <button
                className={showEmojiLibrary ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setShowEmojiLibrary((current) => !current)}
                type="button"
              >
                Emoji
              </button>
              <button
                className={showImageLibrary ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setShowImageLibrary((current) => !current)}
                type="button"
              >
                Photo
              </button>
              <button className="composer-chip" onClick={() => insertSnippet("[Voice]")} type="button">
                Voice
              </button>
              <button className="composer-chip" onClick={() => insertSnippet("@closefriends")} type="button">
                Mention
              </button>
            </div>

            <div className="status-tone-picker">
              {["sky", "mint", "peach"].map((tone) => (
                <button
                  className={statusTone === tone ? "tone-swatch active-tone-swatch" : "tone-swatch"}
                  key={tone}
                  onClick={() => setStatusTone(tone as "sky" | "mint" | "peach")}
                  type="button"
                >
                  {tone}
                </button>
              ))}
            </div>

            <label className="toggle-row">
              <input checked={isAnonymousComposer} onChange={(event) => setIsAnonymousComposer(event.target.checked)} type="checkbox" />
              <span>Post this status anonymously and make it shareable</span>
            </label>

            {showEmojiLibrary ? (
              <div className="picker-panel">
                <div className="picker-panel-head">
                  <strong>Emoji library</strong>
                  <span>WhatsApp-style tray</span>
                </div>
                <div className="emoji-category-row">
                  {emojiGroups.map((group) => (
                    <button
                      className={activeEmojiGroup === group.label ? "emoji-category active-emoji-category" : "emoji-category"}
                      key={group.label}
                      onClick={() => setActiveEmojiGroup(group.label)}
                      type="button"
                    >
                      <span>{group.icon}</span>
                      {group.label}
                    </button>
                  ))}
                </div>
                <div className="emoji-library">
                  {emojiGroups
                    .find((group) => group.label === activeEmojiGroup)
                    ?.emojis.map((emoji) => (
                    <button className="emoji-tile" key={emoji} onClick={() => insertSnippet(emoji)} type="button">
                      {emoji}
                    </button>
                    ))}
                </div>
              </div>
            ) : null}

            {showImageLibrary ? (
              <div className="picker-panel">
                <div className="picker-panel-head">
                  <strong>Image picker</strong>
                  <span>Select a status background</span>
                </div>
                <div className="image-library">
                  {imageLibrary.map((imageName, index) => (
                    <button
                      className={selectedImage === imageName ? "image-tile active-image-tile" : "image-tile"}
                      key={imageName}
                      onClick={() => setSelectedImage(imageName)}
                      type="button"
                    >
                      <span className={`image-tile-preview image-preview-${(index % 3) + 1}`} />
                      <strong>{imageName}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <textarea
              className="status-compose-input"
              onChange={(event) => setStatusDraft(event.target.value)}
              placeholder="Write your status..."
              value={statusDraft}
            />

            <div className={`status-compose-preview tone-preview-${statusTone} style-preview-${statusStyle}`}>
              <span className="story-tag">{isAnonymousComposer ? "Anonymous preview" : "Preview"}</span>
              {selectedImage ? <span className="preview-asset-tag">Background: {selectedImage}</span> : null}
              <p>{statusDraft}</p>
            </div>

            {isAnonymousComposer ? (
              <div className="anonymous-compose-note">
                <strong>Anonymous post tools</strong>
                <span>After posting, you can copy a share link and save the anonymous post image to your device.</span>
              </div>
            ) : null}

            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => insertSnippet("✨")} type="button">
                Add emoji
              </button>
              <button className="primary-action" onClick={postStatus} type="button">
                {isAnonymousComposer ? "Post anonymous status" : "Post status"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {activeStatus ? (
        <div className="status-viewer-backdrop" onClick={() => setActiveIndex(null)} role="presentation">
          <article className={`status-story-viewer tone-${activeStatus.tone}`} onClick={(event) => event.stopPropagation()}>
            <div className="story-viewer-close-row">
              <button aria-label="Close story viewer" className="icon-chip" onClick={() => setActiveIndex(null)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <div className="story-progress-row">
              {statusItems.map((circle, index) => (
                <span className="story-progress-track" key={circle.name}>
                  <span
                    className="story-progress-fill"
                    style={{
                      width:
                        index < (activeIndex ?? -1)
                          ? "100%"
                          : index === (activeIndex ?? -1)
                            ? `${progress}%`
                            : "0%"
                    }}
                  />
                </span>
              ))}
            </div>

            <div className="story-viewer-top">
              <div className="story-viewer-author">
                <span className={`status-ring tone-${activeStatus.tone}`}>
                  <span className="status-avatar">{activeStatus.tone === "add" ? "+" : activeStatus.name.slice(0, 1)}</span>
                </span>
                <div>
                  <strong>{activeStatus.name}</strong>
                  <span>{activeStatus.meta}</span>
                </div>
              </div>
              <div className="story-viewer-top-actions">
                <button className="story-chip" onClick={() => setIsPaused((current) => !current)} type="button">
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>

            <div className="story-viewer-stage">
              <button aria-label="Previous story" className="story-nav-zone story-nav-left" onClick={goToPrevious} type="button" />
              <button aria-label="Next story" className="story-nav-zone story-nav-right" onClick={goToNext} type="button" />

              <div className="story-stage-card">
                <span className="story-tag">{activeStatus.label}</span>
                <h3>{activeStatus.contentTitle}</h3>
                <p>{activeStatus.contentBody}</p>
                <div className="story-stage-metrics">
                  <span>Memory status</span>
                  <strong>{activeStatus.meta}</strong>
                </div>
                <div className="story-react-row">
                  <button className="story-reaction" type="button">❤️</button>
                  <button className="story-reaction" type="button">👏</button>
                  <button className="story-reaction" type="button">🔥</button>
                  <button className="story-reaction" type="button">😭</button>
                </div>
                {activeStatus.anonymous ? (
                  <div className="anonymous-status-tools">
                    <button className="story-chip" onClick={() => copyStatusLink(activeStatus)} type="button">Copy link</button>
                    <button className="story-chip" onClick={() => downloadAnonymousStatusImage(activeStatus)} type="button">Save image</button>
                    <button className="story-chip" onClick={() => setHelpRequestTarget(activeStatus)} type="button">Request to help</button>
                  </div>
                ) : null}
                {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
              </div>
            </div>

            <div className="story-footer-row">
              <button className="ghost-action" disabled={activeIndex === 0} onClick={goToPrevious} type="button">
                Previous
              </button>
              <button className="ghost-action" onClick={goToNext} type="button">
                {activeIndex === statusItems.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {helpRequestTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpRequestTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>CONSENT_FEE</SectionLabel>
                <h3>Request access to help this anonymous poster</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setHelpRequestTarget(null)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <p>
              To protect privacy, helpers pay a consent fee of ${helpRequestTarget.helpFee ?? 8} before any contact request can be
              passed to the anonymous poster.
            </p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for this help request.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setHelpRequestTarget(null)} type="button">Cancel</button>
              <button className="primary-action" onClick={confirmHelpRequest} type="button">Pay consent fee</button>
            </div>
          </article>
        </div>
      ) : null}
    </>
  );
}

function OnboardingPage() {
  return (
    <main className="page-shell">
      <section className="hero-layout onboarding-hero">
        <article className="hero-copy-card card">
          <SectionLabel>WELCOME_TO_HISTORA</SectionLabel>
          <h1>Turn your life into chapters, statuses, and timelines.</h1>
          <p>
            Build a social archive from real memories. Write chapter by chapter, post quick status drops, attach media, and control
            who gets access.
          </p>
          <div className="hero-actions">
            <NavLink className="primary-action" to="/signup">
              SIGN UP
              <Icon className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/signin">
              SIGN IN
            </NavLink>
          </div>
          <div className="status-matrix">
            {readingShelves.map((shelf) => (
              <article key={shelf.title} className="status-card">
                <span className="story-tag">{shelf.mood}</span>
                <strong>{shelf.title}</strong>
                <span>{shelf.meta}</span>
                <small>{shelf.reactions}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="hero-visual-card card">
          <div className="image-frame">
            <img alt="Histora onboarding preview" className="feature-image" src={heroMemory} />
          </div>
          <div className="hero-overlay-stack">
            <article className="overlay-card">
              <SectionLabel>START_HERE</SectionLabel>
              <h3>PRIVATE MEMORIES, PUBLIC STORIES, ANONYMOUS ADVICE</h3>
              <p>Start with your first profile and move into chapters, statuses, contributors, and premium media.</p>
            </article>
          </div>
        </article>
      </section>
    </main>
  );
}

function AuthPage({
  mode,
  onAuthenticated
}: {
  mode: "signin" | "signup" | "forgot" | "reset";
  onAuthenticated: (session: AuthSession) => void;
}) {
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isSignin = mode === "signin";
  const navigate = useNavigate();
  const location = useLocation();
  const redirectAfterAuth = new URLSearchParams(location.search).get("redirect");
  const authEyebrow = isSignup
    ? "OPEN_YOUR_ARCHIVE"
    : isForgot
      ? "RECOVER_ACCESS"
      : isReset
        ? "RESET_ENTRY"
        : "RETURN_TO_RECORD";
  const authHeadline = isSignup
    ? "Begin your archive."
    : isForgot
      ? "Recover access."
      : isReset
        ? "Choose a new password."
        : "Welcome back.";
  const authIntro = isSignup
    ? "Build a private record first. Publish only when the story is ready."
    : isForgot
      ? "Request a reset code and get back to your drafts."
      : isReset
        ? "Set a stronger password and reopen your archive."
        : "Sign in to continue writing, reading, and managing your archive.";
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    password: "",
    resetCode: "",
    newPassword: "",
    confirmPassword: "",
    dateOfBirth: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formFeedback, setFormFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    newPassword: false,
    confirmPassword: false
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  };

  const togglePasswordVisibility = (field: keyof typeof visiblePasswords) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field]
    }));
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};
    const trimmedEmail = form.email.trim();

    if (isSignin || isSignup || isForgot) {
      if (!trimmedEmail) {
        nextErrors.email = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        nextErrors.email = "Enter a valid email address.";
      }
    }

    if (isSignin || isSignup) {
      if (!form.password) {
        nextErrors.password = "Password is required.";
      } else if (form.password.length < 8) {
        nextErrors.password = "Password must be at least 8 characters.";
      }
    }

    if (isSignup) {
      if (!form.fullName.trim()) {
        nextErrors.fullName = "Full name is required.";
      }

      if (!form.username.trim()) {
        nextErrors.username = "Username is required.";
      } else if (!/^@?[a-z0-9_]{3,20}$/i.test(form.username.trim())) {
        nextErrors.username = "Use 3-20 letters, numbers, or underscores.";
      }

      if (!form.dateOfBirth) {
        nextErrors.dateOfBirth = "Date of birth is required.";
      } else {
        const birthDate = new Date(form.dateOfBirth);
        const now = new Date();
        let age = now.getFullYear() - birthDate.getFullYear();
        const monthDiff = now.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
          age -= 1;
        }
        if (Number.isNaN(birthDate.getTime()) || age < 13) {
          nextErrors.dateOfBirth = "You must be at least 13 years old.";
        }
      }
    }

    if (isReset) {
      if (!form.resetCode.trim()) {
        nextErrors.resetCode = "Reset code is required.";
      } else if (form.resetCode.trim().length < 4) {
        nextErrors.resetCode = "Reset code looks too short.";
      }

      if (!form.newPassword) {
        nextErrors.newPassword = "New password is required.";
      } else if (form.newPassword.length < 8) {
        nextErrors.newPassword = "New password must be at least 8 characters.";
      }

      if (!form.confirmPassword) {
        nextErrors.confirmPassword = "Confirm your new password.";
      } else if (form.confirmPassword !== form.newPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handlePrimaryAction = async () => {
    if (!validateForm()) {
      setFormFeedback("Please fix the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    setFormFeedback("");

    try {
      if (isSignin) {
        const session = await apiRequest<AuthSession>("/auth/login", {
          method: "POST",
          body: {
            email: form.email.trim(),
            password: form.password
          }
        });
        onAuthenticated(session);
        setFormFeedback("Sign-in complete. Redirecting...");
        navigate(redirectAfterAuth || "/feed");
        return;
      }

      if (isSignup) {
        const session = await apiRequest<AuthSession>("/auth/register", {
          method: "POST",
          body: {
            fullName: form.fullName.trim(),
            username: form.username.trim().replace(/^@/, "").toLowerCase(),
            email: form.email.trim(),
            password: form.password,
            dateOfBirth: form.dateOfBirth
          }
        });
        onAuthenticated(session);
        setFormFeedback("Account created. Redirecting...");
        navigate(redirectAfterAuth || "/feed");
        return;
      }

      if (isForgot) {
        const result = await apiRequest<{ ok: boolean; resetCode?: string }>("/auth/forgot-password", {
          method: "POST",
          body: {
            email: form.email.trim()
          }
        });
        setFormFeedback(
          result.resetCode
            ? `Reset code generated: ${result.resetCode}`
            : `If an account exists for ${form.email.trim()}, reset instructions have been prepared.`
        );
        return;
      }

      if (isReset) {
        await apiRequest<{ ok: boolean }>("/auth/reset-password", {
          method: "POST",
          body: {
            code: form.resetCode.trim(),
            password: form.newPassword
          }
        });
        setFormFeedback("Password updated. Redirecting to sign in...");
        navigate("/signin");
      }
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Authentication request failed."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page-shell auth-shell">
      <section className="auth-layout">
        <article className="auth-info card">
          <div className="auth-copy-stack">
            <SectionLabel>{authEyebrow}</SectionLabel>
            <h1>{authHeadline}</h1>
            <p>{authIntro}</p>
          </div>

          <div className="auth-story-panel">
            <div className="auth-pattern-band" aria-hidden="true">
              <span className="auth-pattern-mark" />
              <span className="auth-pattern-mark" />
              <span className="auth-pattern-mark" />
            </div>
            <p className="auth-motto">From oral memory to written archive.</p>
            <div className="auth-feature-list auth-heritage-grid">
              <div className="auth-feature-row auth-heritage-card">
                <strong>Griots and lineages</strong>
                <span>Hold names, moments, migrations, and family memory in one place.</span>
              </div>
              <div className="auth-feature-row auth-heritage-card">
                <strong>Bronze, cloth, manuscript</strong>
                <span>Write with the patience of preserved craft, not the noise of the feed.</span>
              </div>
              <div className="auth-feature-row auth-heritage-card">
                <strong>Private before public</strong>
                <span>Keep drafts protected, then decide what becomes part of the public record.</span>
              </div>
            </div>
          </div>
        </article>

        <article className="auth-card card">
          <div className="auth-card-head">
            <SectionLabel>{isSignup ? "ACCOUNT_SETUP" : isForgot ? "EMAIL_RECOVERY" : isReset ? "PASSWORD_RESET" : "SIGN_IN"}</SectionLabel>
            <h2>{isSignup ? "Create account" : isForgot ? "Forgot password" : isReset ? "Reset password" : "Sign in"}</h2>
          </div>
          <form className="auth-form">
            {isSignup ? (
              <label className="auth-field">
                <span>Full name</span>
                <input onChange={(event) => updateField("fullName", event.target.value)} placeholder="Full name" value={form.fullName} />
                {errors.fullName ? <small className="form-error">{errors.fullName}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="auth-field">
                <span>Username</span>
                <input onChange={(event) => updateField("username", event.target.value)} placeholder="@username" value={form.username} />
                {errors.username ? <small className="form-error">{errors.username}</small> : null}
              </label>
            ) : null}
            {isSignin || isSignup || isForgot ? (
              <label className="auth-field">
                <span>Email address</span>
                <input onChange={(event) => updateField("email", event.target.value)} placeholder="Email address" type="email" value={form.email} />
                {errors.email ? <small className="form-error">{errors.email}</small> : null}
              </label>
            ) : null}
            {isSignin || isSignup ? (
              <label className="auth-field">
                <span>Password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("password", event.target.value)}
                    placeholder="Password"
                    type={visiblePasswords.password ? "text" : "password"}
                    value={form.password}
                  />
                  <button
                    aria-label={visiblePasswords.password ? "Hide password" : "Show password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("password")}
                    type="button"
                  >
                    <Icon className="inline-icon" name={visiblePasswords.password ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.password ? <small className="form-error">{errors.password}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>Reset code</span>
                <input onChange={(event) => updateField("resetCode", event.target.value)} placeholder="Reset code" value={form.resetCode} />
                {errors.resetCode ? <small className="form-error">{errors.resetCode}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>New password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("newPassword", event.target.value)}
                    placeholder="New password"
                    type={visiblePasswords.newPassword ? "text" : "password"}
                    value={form.newPassword}
                  />
                  <button
                    aria-label={visiblePasswords.newPassword ? "Hide new password" : "Show new password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("newPassword")}
                    type="button"
                  >
                    <Icon className="inline-icon" name={visiblePasswords.newPassword ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.newPassword ? <small className="form-error">{errors.newPassword}</small> : null}
              </label>
            ) : null}
            {isReset ? (
              <label className="auth-field">
                <span>Confirm new password</span>
                <div className="auth-password-field">
                  <input
                    onChange={(event) => updateField("confirmPassword", event.target.value)}
                    placeholder="Confirm new password"
                    type={visiblePasswords.confirmPassword ? "text" : "password"}
                    value={form.confirmPassword}
                  />
                  <button
                    aria-label={visiblePasswords.confirmPassword ? "Hide confirm password" : "Show confirm password"}
                    className="auth-visibility-toggle"
                    onClick={() => togglePasswordVisibility("confirmPassword")}
                    type="button"
                  >
                    <Icon className="inline-icon" name={visiblePasswords.confirmPassword ? "eyeOff" : "eye"} />
                  </button>
                </div>
                {errors.confirmPassword ? <small className="form-error">{errors.confirmPassword}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="auth-field">
                <span>Date of birth</span>
                <input onChange={(event) => updateField("dateOfBirth", event.target.value)} type="date" value={form.dateOfBirth} />
                {errors.dateOfBirth ? <small className="form-error">{errors.dateOfBirth}</small> : null}
              </label>
            ) : null}
            {isSignup ? (
              <label className="toggle-row auth-toggle-row">
                <input defaultChecked type="checkbox" />
                <span>Allow comments on published chapters by default</span>
              </label>
            ) : null}
            {formFeedback ? <p className="auth-feedback">{formFeedback}</p> : null}
            <button className="primary-action block-action" disabled={isSubmitting} onClick={() => void handlePrimaryAction()} type="button">
              {isSubmitting
                ? "PROCESSING..."
                : isSignup
                  ? "CREATE ACCOUNT"
                  : isForgot
                    ? "SEND RESET LINK"
                    : isReset
                      ? "UPDATE PASSWORD"
                      : "SIGN IN"}
              <Icon className="button-icon" name="arrow" />
            </button>
          </form>

          <div className="auth-support-links">
            {isSignin ? <NavLink to="/forgot-password">Forgot password?</NavLink> : null}
            {isSignup ? <NavLink to="/signin">Already have an account? Sign in</NavLink> : null}
            {isForgot ? <NavLink to="/reset-password">Already have a code? Reset password</NavLink> : null}
            {isReset ? <NavLink to="/signin">Back to sign in</NavLink> : null}
          </div>
          <div className="auth-note card">
            <strong>{isSignin ? "Protected access" : "Archive settings"}</strong>
            <span>
              {isSignin
                ? "Your session restores drafts, saved stories, and archive controls."
                : "Your account controls visibility, defaults, and archive ownership."}
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}

function RequireSignInRedirect({ redirectTo }: { redirectTo: string }) {
  return <Navigate replace to={`/signin?redirect=${encodeURIComponent(redirectTo)}`} />;
}

function RequireCurrentLocationSignInRedirect() {
  const location = useLocation();
  return <Navigate replace to={`/signin?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`} />;
}

const sampleHelperContacts = [
  { name: "Tolu A.", phone: "+234 803 555 0102" },
  { name: "Mariam K.", phone: "+234 809 555 0194" },
  { name: "David O.", phone: "+234 812 555 0138" }
];

function AnonymousHubPage({
  accessToken,
  currentUser
}: {
  accessToken: string;
  currentUser: AuthUser;
}) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<StoredAnonymousStatus[]>([]);
  const [shareFeedback, setShareFeedback] = useState("");
  const inboxLink =
    typeof window === "undefined"
      ? `/anonymous/write/${currentUser.username}`
      : `${window.location.origin}/anonymous/write/${currentUser.username}`;
  const receivedMessages = statuses.filter((status) => status.source === "received");
  const postedMessages = statuses.filter((status) => status.source === "posted");

  useEffect(() => {
    let cancelled = false;

    const loadStatuses = async () => {
      try {
        const [inboxMessages, sentMessages] = await Promise.all([
          apiRequest<ApiAnonymousMessage[]>("/anonymous-messages/inbox", { accessToken }),
          apiRequest<ApiAnonymousMessage[]>("/anonymous-messages/sent", { accessToken })
        ]);

        if (cancelled) {
          return;
        }

        setStatuses([
          ...inboxMessages.map((message) => toStoredAnonymousStatus(message, "received")),
          ...sentMessages.map((message) => toStoredAnonymousStatus(message, "posted"))
        ]);
      } catch (error) {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load anonymous messages."));
        }
      }
    };

    void loadStatuses();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const copyAnonymousLink = async (status: StoredAnonymousStatus) => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/anonymous/${status.shareSlug}`);
      setShareFeedback("Anonymous link copied.");
    } catch {
      setShareFeedback("Could not copy the anonymous link on this device.");
    }
  };

  const copyInboxLink = async () => {
    if (typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(inboxLink);
      setShareFeedback("Anonymous inbox link copied.");
    } catch {
      setShareFeedback("Could not copy the inbox link on this device.");
    }
  };

  const toggleDistribution = async (status: StoredAnonymousStatus, distribution: "app" | "external") => {
    try {
      const updated = await apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${status.id}/distribution`, {
        method: "PATCH",
        accessToken,
        body: { distribution }
      });

      setStatuses((current) =>
        current.map((entry) =>
          entry.id === status.id
            ? {
                ...entry,
                distribution: updated.distribution,
                helperContact: updated.helperContact ?? entry.helperContact
              }
            : entry
        )
      );
      setShareFeedback(
        distribution === "app"
          ? "Anonymous post will stay visible inside Histora."
          : "Anonymous post is now marked for external sharing only."
      );
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not update anonymous distribution."));
    }
  };

  const downloadAnonymousCard = (status: StoredAnonymousStatus) => {
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");

    if (!context) {
      setShareFeedback("Could not prepare the anonymous post image.");
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#f7faff");
    gradient.addColorStop(1, "#fff1e8");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1080, 1350);

    context.fillStyle = "#ffffff";
    roundRect(context, 70, 70, 940, 1210, 42);
    context.fill();

    context.fillStyle = "#1b2440";
    context.font = "700 32px Space Grotesk, sans-serif";
    context.fillText("HISTORA", 130, 136);
    context.font = "700 42px Space Grotesk, sans-serif";
    context.fillText("ANONYMOUS MESSAGE", 130, 186);
    context.font = "400 30px Manrope, sans-serif";
    context.fillStyle = "#667085";
    context.fillText(status.meta, 130, 230);

    const ringGradient = context.createLinearGradient(110, 270, 270, 430);
    ringGradient.addColorStop(0, "#315efb");
    ringGradient.addColorStop(1, "#ff7a45");
    context.fillStyle = ringGradient;
    context.beginPath();
    context.arc(190, 360, 84, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#1b2440";
    context.beginPath();
    context.arc(190, 360, 72, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.font = "700 64px Space Grotesk, sans-serif";
    context.textAlign = "center";
    context.fillText("A", 190, 382);
    context.textAlign = "start";

    context.fillStyle = "#1b2440";
    context.font = "700 56px Space Grotesk, sans-serif";
    const messageLines = wrapCanvasText(context, status.body, 820);
    messageLines.slice(0, 12).forEach((line, index) => {
      context.fillText(line, 130, 520 + index * 68);
    });

    context.font = "700 34px Space Grotesk, sans-serif";
    context.fillStyle = "#cc5a24";
    context.fillText(`${status.comments.length} replies // Anonymous advice`, 130, 1170);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${status.shareSlug}-anonymous-message.png`;
    link.click();
    setShareFeedback("Anonymous post image saved to your device.");
  };

  return (
    <main className="feed-reader-shell anonymous-hub-shell">
      <div className="profile-edit-back">
        <button className="ghost-action" onClick={() => navigate("/feed")} type="button">
          <Icon className="button-icon" name="arrow" />
          BACK
        </button>
      </div>

      <section className="story-reader-stage card anonymous-hero">
        <div className="anonymous-hero-copy">
          <SectionLabel>ANONYMOUS_ARCHIVE</SectionLabel>
          <p>Share your inbox link so others can write to you anonymously. Keep messages private, publish them inside Histora, or export them elsewhere.</p>
        </div>
        <div className="anonymous-inbox-card">
          <span className="story-tag">YOUR INBOX LINK</span>
          <strong>Let people write to you anonymously</strong>
          <p>{inboxLink}</p>
          <div className="anonymous-hub-actions">
            <button className="ghost-action" onClick={copyInboxLink} type="button">
              COPY LINK
            </button>
            <button className="primary-action" onClick={() => navigate(`/anonymous/write/${currentUser.username}`)} type="button">
              OPEN LINK PAGE
              <Icon className="button-icon" name="arrow" />
            </button>
          </div>
        </div>
      </section>

      {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}

      <section className="anonymous-summary-strip">
        <article className="profile-stat-card">
          <span>Inbox messages</span>
          <strong>{receivedMessages.length}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Published on app</span>
          <strong>{statuses.filter((status) => status.distribution === "app").length}</strong>
        </article>
        <article className="profile-stat-card">
          <span>External only</span>
          <strong>{statuses.filter((status) => status.distribution === "external").length}</strong>
        </article>
      </section>

      <section className="anonymous-hub-stack">
        <article className="chapter-reader-card card anonymous-hub-panel">
          <div className="anonymous-panel-body">
          <div className="profile-section-copy anonymous-section-copy">
            <SectionLabel>INBOX</SectionLabel>
            <h2>Anonymous messages people sent to you</h2>
            <span>Review the message, then decide whether it stays in Histora or remains only for external sharing.</span>
          </div>
          <div className="anonymous-hub-list">
            {receivedMessages.length ? (
              receivedMessages.map((status) => (
                <article className="anonymous-hub-card" key={status.shareSlug}>
                  <div className="anonymous-hub-card-top">
                    <div className="anonymous-hub-card-copy">
                      <strong>Anonymous message</strong>
                      <span>{status.meta}</span>
                    </div>
                    <span className="story-tag">{status.distribution === "app" ? "ON APP" : "EXTERNAL"}</span>
                  </div>
                  <p>{status.body}</p>
                  <div className="anonymous-hub-meta">
                    <span>{status.comments.length} replies</span>
                    <span>Consent fee ${status.helpFee}</span>
                  </div>
                  {status.helperContact ? (
                    <div className="anonymous-helper-card">
                      <strong>Helper unlocked</strong>
                      <span>{status.helperContact.name}</span>
                      <small>{status.helperContact.phone}</small>
                    </div>
                  ) : null}
                  <div className="anonymous-distribution-row">
                    <button
                      className={status.distribution === "app" ? "composer-chip active-composer-chip" : "composer-chip"}
                      onClick={() => void toggleDistribution(status, "app")}
                      type="button"
                    >
                      Show on app
                    </button>
                    <button
                      className={status.distribution === "external" ? "composer-chip active-composer-chip" : "composer-chip"}
                      onClick={() => void toggleDistribution(status, "external")}
                      type="button"
                    >
                      Keep external
                    </button>
                  </div>
                  <div className="anonymous-hub-actions">
                    <button className="ghost-action" onClick={() => copyAnonymousLink(status)} type="button">
                      COPY MESSAGE LINK
                    </button>
                    <button className="ghost-action" onClick={() => downloadAnonymousCard(status)} type="button">
                      DOWNLOAD CARD
                    </button>
                    <button className="primary-action" onClick={() => navigate(`/anonymous/${status.shareSlug}`)} type="button">
                      OPEN MESSAGE
                      <Icon className="button-icon" name="arrow" />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <article className="anonymous-empty">
                <strong>No anonymous messages yet</strong>
                <p>Share your inbox link and people will be able to write you anonymous messages after signing in.</p>
                <div className="anonymous-hub-actions">
                  <button className="ghost-action" onClick={copyInboxLink} type="button">
                    COPY INBOX LINK
                  </button>
                  <button className="primary-action" onClick={() => navigate(`/anonymous/write/${currentUser.username}`)} type="button">
                    PREVIEW INBOX PAGE
                    <Icon className="button-icon" name="arrow" />
                  </button>
                </div>
              </article>
            )}
          </div>
          </div>
        </article>

        <article className="chapter-reader-card card anonymous-hub-panel">
          <div className="anonymous-panel-body">
          <div className="profile-section-copy anonymous-section-copy">
            <SectionLabel>POSTED_BY_YOU</SectionLabel>
            <h2>Anonymous posts you already shared</h2>
            <span>These came from your quick-memory anonymous posts and can still be shared, downloaded, or opened as pages.</span>
          </div>
          <div className="anonymous-hub-list">
            {postedMessages.length ? (
              postedMessages.map((status) => (
                <article className="anonymous-hub-card" key={status.shareSlug}>
                  <div className="anonymous-hub-card-top">
                    <div className="anonymous-hub-card-copy">
                      <strong>Anonymous message</strong>
                      <span>{status.meta}</span>
                    </div>
                    <span className="story-tag">{status.distribution === "app" ? "ON APP" : "EXTERNAL"}</span>
                  </div>
                  <p>{status.body}</p>
                  <div className="anonymous-hub-meta">
                    <span>{status.comments.length} replies</span>
                    <span>Consent fee ${status.helpFee}</span>
                  </div>
                  {status.helperContact ? (
                    <div className="anonymous-helper-card">
                      <strong>Helper unlocked</strong>
                      <span>{status.helperContact.name}</span>
                      <small>{status.helperContact.phone}</small>
                    </div>
                  ) : null}
                  <div className="anonymous-distribution-row">
                    <button
                      className={status.distribution === "app" ? "composer-chip active-composer-chip" : "composer-chip"}
                      onClick={() => void toggleDistribution(status, "app")}
                      type="button"
                    >
                      Keep on Histora
                    </button>
                    <button
                      className={status.distribution === "external" ? "composer-chip active-composer-chip" : "composer-chip"}
                      onClick={() => void toggleDistribution(status, "external")}
                      type="button"
                    >
                      Share elsewhere
                    </button>
                  </div>
                  <div className="anonymous-hub-actions">
                    <button className="ghost-action" onClick={() => copyAnonymousLink(status)} type="button">
                      COPY LINK
                    </button>
                    <button className="ghost-action" onClick={() => downloadAnonymousCard(status)} type="button">
                      DOWNLOAD
                    </button>
                    <button className="primary-action" onClick={() => navigate(`/anonymous/${status.shareSlug}`)} type="button">
                      OPEN PAGE
                      <Icon className="button-icon" name="arrow" />
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <article className="anonymous-empty">
                <strong>No anonymous posts yet</strong>
                <p>Post an anonymous quick memory from the home status row and it will appear here.</p>
                <NavLink className="primary-action" to="/">
                  GO TO QUICK MEMORY
                  <Icon className="button-icon" name="arrow" />
                </NavLink>
              </article>
            )}
          </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function AnonymousStoryPage({
  accessToken
}: {
  accessToken: string;
}) {
  const { shareSlug = "" } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ApiAnonymousMessage | null>(null);
  const [comments, setComments] = useState<Array<{ author: string; text: string }>>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadMessage = async () => {
      try {
        const [publicMessage, privateMessage] = await Promise.all([
          apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}`),
          apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}/private`, { accessToken }).catch(
            () => null
          )
        ]);

        if (cancelled) {
          return;
        }

        const activeMessage = privateMessage ?? publicMessage;
        setStatus(activeMessage);
      } catch (error) {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load this anonymous message."));
        }
      }
    };

    void loadMessage();

    return () => {
      cancelled = true;
    };
  }, [accessToken, shareSlug]);

  useEffect(() => {
    if (!status) {
      return;
    }

    void apiRequest<ApiComment[]>(
      `/comments?targetType=anonymousMessage&targetId=${encodeURIComponent(status.id)}`
    )
      .then((messageComments) => {
        setComments(
          messageComments.map((comment) => ({
            author: comment.authorName,
            text: comment.body
          }))
        );
      })
      .catch(() => undefined);
  }, [status?.id]);

  const submitReply = async () => {
    if (!status || !replyDraft.trim()) {
      return;
    }

    try {
      const createdComment = await apiRequest<ApiComment>("/comments", {
        method: "POST",
        accessToken,
        body: {
          targetType: "anonymousMessage",
          targetId: status.id,
          body: replyDraft.trim()
        }
      });

      setComments((current) => [
        { author: createdComment.authorName, text: createdComment.body },
        ...current
      ]);
      setStatus((current) =>
        current
          ? {
              ...current,
              commentsCount: current.commentsCount + 1
            }
          : current
      );
      setReplyDraft("");
      setShareFeedback("Anonymous advice sent.");
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not send your anonymous reply."));
    }
  };

  const confirmHelpRequest = async () => {
    if (!status || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    const helperContact = sampleHelperContacts[Math.abs(status.shareSlug.length) % sampleHelperContacts.length];

    try {
      const updatedMessage = await apiRequest<ApiAnonymousMessage>(
        `/anonymous-messages/${status.id}/helper-contact/unlock`,
        {
          method: "POST",
          accessToken,
          body: {
            helperName: helperContact.name,
            helperPhone: helperContact.phone
          }
        }
      );

      setStatus(updatedMessage);
      setShowHelpDialog(false);
      setConsentAccepted(false);
      setShareFeedback(`Consent fee confirmed. ${helperContact.name} is now available to help.`);
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not unlock helper contact."));
    }
  };

  const copyAnonymousLink = async () => {
    if (!status || typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/anonymous/${status.shareSlug}`);
      setShareFeedback("Anonymous link copied.");
    } catch {
      setShareFeedback("Could not copy the anonymous link on this device.");
    }
  };

  if (!status) {
    return (
      <main className="feed-reader-shell">
        <article className="story-reader-stage card">
          <SectionLabel>ANONYMOUS_MESSAGE</SectionLabel>
          <h1>This anonymous message was not found.</h1>
          <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
            BACK TO ANONYMOUS
          </button>
        </article>
      </main>
    );
  }

  return (
    <main className="feed-reader-shell anonymous-story-shell">
      <section className="topbar card feed-reader-topbar">
        <div className="topbar-copy">
          <SectionLabel>ANONYMOUS_MESSAGE</SectionLabel>
          <span>{formatAnonymousMeta(status.createdAt)} // {comments.length} replies // Consent fee ${status.helpFee}</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
            BACK
          </button>
          <button className="primary-action" onClick={() => setShowHelpDialog(true)} type="button">
            RENDER HELP
          </button>
        </div>
      </section>

      <article className="chapter-reader-card card anonymous-story-card">
        <div className="story-reader-author-row">
          <div className="story-viewer-author">
            <span className="status-ring tone-ink">
              <span className="status-avatar">A</span>
            </span>
            <div>
              <strong>Anonymous</strong>
              <span>{formatAnonymousMeta(status.createdAt)}</span>
            </div>
          </div>
          <div className="story-reader-stage-actions">
            <button className="feed-action-pill" onClick={copyAnonymousLink} type="button">
              <Icon className="inline-icon" name="share" />
              Copy link
            </button>
          </div>
        </div>

        <div className="chapter-reader-head">
          <span className="story-tag">{status.distribution === "app" ? "ON APP" : "EXTERNAL"}</span>
        </div>
        <p className="chapter-reader-summary">{status.body}</p>

        {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
        {status.helperContact ? (
          <div className="anonymous-helper-card">
            <strong>Helper unlocked</strong>
            <span>{status.helperContact.name}</span>
            <small>{status.helperContact.phone}</small>
          </div>
        ) : null}

        <section className="story-reader-footer-card">
          <div className="profile-section-copy">
            <SectionLabel>THREAD</SectionLabel>
            <h2>Anonymous advice thread</h2>
          </div>
          <div className="story-comment-list">
            {comments.map((comment, index) => (
              <div className="story-comment-card" key={`${comment.author}-${index}`}>
                <strong>{comment.author}</strong>
                <p>{comment.text}</p>
              </div>
            ))}
          </div>
          <div className="story-reply-bar">
            <input onChange={(event) => setReplyDraft(event.target.value)} placeholder="Reply anonymously..." value={replyDraft} />
            <button className="primary-action" onClick={() => void submitReply()} type="button">
              Send anonymous reply
            </button>
          </div>
        </section>
      </article>

      {showHelpDialog ? (
        <div className="status-viewer-backdrop" onClick={() => setShowHelpDialog(false)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>CONSENT_FEE</SectionLabel>
                <h3>Render help for this anonymous message</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setShowHelpDialog(false)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <p>To protect privacy, helpers pay a consent fee of ${status.helpFee} before any contact request can be passed to the poster.</p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for this help request.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setShowHelpDialog(false)} type="button">Cancel</button>
              <button className="primary-action" onClick={() => void confirmHelpRequest()} type="button">Pay consent fee</button>
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}

function AnonymousInboxComposePage({
  accessToken
}: {
  accessToken: string;
}) {
  const { recipientSlug = "kingsleyarchive" } = useParams();
  const navigate = useNavigate();
  const [body, setBody] = useState("I need perspective before I decide what the next chapter should be.");
  const [feedback, setFeedback] = useState("");

  const submitAnonymousMessage = async () => {
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      setFeedback("Add your message first.");
      return;
    }

    try {
      await apiRequest<ApiAnonymousMessage>("/anonymous-messages", {
        method: "POST",
        accessToken,
        body: {
          recipientUsername: recipientSlug.toLowerCase(),
          body: trimmedBody,
          distribution: "external"
        }
      });
      setFeedback("Anonymous message sent. The recipient can now review it in their anonymous inbox.");
      window.setTimeout(() => navigate("/anonymous"), 260);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not send the anonymous message."));
    }
  };

  return (
    <main className="feed-reader-shell anonymous-hub-shell anonymous-compose-page">
      <div className="profile-edit-back">
        <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
          <Icon className="button-icon" name="arrow" />
          BACK
        </button>
      </div>

      <section className="story-reader-stage card anonymous-hero">
        <div className="anonymous-hero-copy">
          <SectionLabel>WRITE_ANONYMOUSLY</SectionLabel>
          <h1>Send an anonymous message to @{recipientSlug}.</h1>
          <p>Your message stays anonymous. The recipient decides whether to keep it inside Histora or share it elsewhere.</p>
        </div>
      </section>

      <section className="chapter-reader-card card anonymous-compose-card">
        <div className="anonymous-panel-body">
        <div className="profile-section-copy anonymous-section-copy">
          <SectionLabel>MESSAGE_FORM</SectionLabel>
          <h2>Write the anonymous message</h2>
        </div>
        <div className="profile-form-grid">
          <label>
            Message
            <textarea onChange={(event) => setBody(event.target.value)} placeholder="Write your anonymous message..." value={body} />
          </label>
        </div>
        {feedback ? <p className="status-feedback">{feedback}</p> : null}
        <div className="chapter-controls">
          <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
            CANCEL
          </button>
          <button className="primary-action" onClick={() => void submitAnonymousMessage()} type="button">
            SEND ANONYMOUS MESSAGE
            <Icon className="button-icon" name="arrow" />
          </button>
        </div>
        </div>
      </section>
    </main>
  );
}

type FeedThreadComment = {
  author: string;
  handle: string;
  text: string;
  time: string;
  replyTo?: string;
};

type FeedStoryChapter = {
  id: string;
  title: string;
  body: string;
  summary: string;
  likes: number;
  liked: boolean;
  comments: FeedThreadComment[];
  images: Array<{ src: string; alt: string }>;
  voiceNotes: Array<{ name: string; detail: string; src: string }>;
  timeline: Array<{ label: string; title: string; body: string }>;
};

type FeedStoryRecord = (typeof feedPreview)[number] & {
  slug: string;
  anonymous: boolean;
  shares: number;
  likes: number;
  liked: boolean;
  bookmarked: boolean;
  following: boolean;
  helpFee?: number;
  chapters: FeedStoryChapter[];
};

type StudioChapter = (typeof chapterDrafts)[number] & {
  title: string;
  body: string;
};

type ShareSheetPayload = {
  title: string;
  text: string;
  url: string;
};

const slugifyStoryTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const sampleVoiceNoteUrl = "https://samplelib.com/lib/preview/mp3/sample-3s.mp3";

const roundRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const wrapCanvasText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(nextLine).width > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

function ShareSheet({
  share,
  onClose,
  onFeedback
}: {
  share: ShareSheetPayload;
  onClose: () => void;
  onFeedback: (message: string) => void;
}) {
  const openShareTarget = async (target: "copy" | "email" | "whatsapp" | "more") => {
    if (typeof window === "undefined") {
      return;
    }

    if (target === "copy") {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(share.url);
        onFeedback("Share link copied.");
      } else {
        onFeedback("Copy is not available in this browser.");
      }
      onClose();
      return;
    }

    if (target === "more") {
      if (navigator.share) {
        await navigator.share({ title: share.title, text: share.text, url: share.url });
        onFeedback("Shared successfully.");
      } else {
        onFeedback("More apps sharing is not available in this browser.");
      }
      onClose();
      return;
    }

    const encodedUrl = encodeURIComponent(share.url);
    const encodedText = encodeURIComponent(`${share.text} ${share.url}`);
    const encodedTitle = encodeURIComponent(share.title);

    const targetUrl =
      target === "whatsapp"
        ? `https://wa.me/?text=${encodedText}`
        : `mailto:?subject=${encodedTitle}&body=${encodedText}`;

    window.open(targetUrl, "_blank", "noopener,noreferrer");
    onFeedback(target === "whatsapp" ? "Opening WhatsApp share..." : "Opening email share...");
    onClose();
  };

  return (
    <div className="status-viewer-backdrop" onClick={onClose} role="presentation">
      <article className="share-sheet-modal card" onClick={(event) => event.stopPropagation()}>
        <div className="status-composer-top">
          <div>
            <SectionLabel>SHARE_STORY</SectionLabel>
            <h3>{share.title}</h3>
          </div>
          <button aria-label="Close share dialog" className="icon-chip" onClick={onClose} type="button">
            <Icon className="button-icon" name="close" />
          </button>
        </div>
        <p>{share.text}</p>
        <div className="share-sheet-actions">
          <button className="ghost-action" onClick={() => void openShareTarget("whatsapp")} type="button">WhatsApp</button>
          <button className="ghost-action" onClick={() => void openShareTarget("email")} type="button">Email</button>
          <button className="ghost-action" onClick={() => void openShareTarget("copy")} type="button">Copy link</button>
          <button className="primary-action" onClick={() => void openShareTarget("more")} type="button">More apps</button>
        </div>
      </article>
    </div>
  );
}

const buildFeedStories = (): FeedStoryRecord[] =>
  feedPreview.map((post, index) => ({
    ...post,
    slug: slugifyStoryTitle(post.title),
    anonymous: post.visibility === "ANON",
    shares: [48, 31, 66][index] ?? 12,
    likes: [428, 213, 689][index] ?? 120,
    liked: false,
    bookmarked: false,
    following: false,
    helpFee: post.visibility === "ANON" ? 8 : undefined,
    chapters:
      index === 0
        ? [
            {
              id: "chapter-1",
              title: "Packing evidence into memory",
              body:
                "I stopped describing the move as one dramatic leap and started preserving it in pieces. Rent receipts, blurry kitchen photos, and one voice note from the night I could finally lock my own front door became part of the chapter itself.",
              summary: "Receipts, photos, and one voice note turn the move into evidence instead of a vague memory.",
              likes: 132,
              liked: false,
              images: [
                {
                  src: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
                  alt: "Moving boxes stacked in a new apartment"
                },
                {
                  src: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
                  alt: "Kitchen corner in a newly rented home"
                }
              ],
              voiceNotes: [{ name: "Voice note after move-in", detail: "01:18 // recorded at midnight", src: sampleVoiceNoteUrl }],
              timeline: [
                { label: "Feb / 4 / 2014", title: "Signed the lease", body: "The first document that proved I was not staying temporarily." },
                { label: "Feb / 9 / 2014", title: "Moved the boxes", body: "Everything I owned suddenly had to fit a new room." }
              ],
              comments: [
                { author: "Dami A.", handle: "@damireads", text: "The receipts beside the memory detail make this feel very real.", time: "9m" },
                { author: "Amina Kole", handle: "@aminawrites", text: "That was the point. I wanted the archive to feel provable.", time: "7m", replyTo: "@damireads" }
              ]
            },
            {
              id: "chapter-2",
              title: "The room started answering back",
              body:
                "The apartment changed tone once I had to fill it with my own routines. Every object became proof that I was not passing through. That is when the story stopped sounding like survival and started sounding like arrival.",
              summary: "The room stops being temporary once routine, objects, and silence start belonging to the writer.",
              likes: 88,
              liked: false,
              images: [
                {
                  src: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
                  alt: "Quiet bedroom with warm evening light"
                }
              ],
              voiceNotes: [],
              timeline: [{ label: "Mar / 1 / 2014", title: "First night of routine", body: "The room finally sounded like mine and not borrowed space." }],
              comments: [{ author: "Tolu R.", handle: "@tolureads", text: "This chapter reads like breathing out after years of tension.", time: "4m" }]
            }
          ]
        : index === 1
          ? [
              {
                id: "chapter-1",
                title: "Need advice on forgiving a parent",
                body:
                  "Posting this anonymously because the memory still feels too close to name. I want perspective before I decide whether the next chapter should become a call, a boundary, or silence that protects what is left of me.",
                summary: "An anonymous chapter asking whether forgiveness must also mean renewed access.",
                likes: 74,
                liked: false,
                images: [
                  {
                    src: "https://images.unsplash.com/photo-1516589091380-5d8e87df6999?auto=format&fit=crop&w=1200&q=80",
                    alt: "Hands folded together in a reflective moment"
                  }
                ],
              voiceNotes: [{ name: "Private reflection note", detail: "00:42 // anonymized voice", src: sampleVoiceNoteUrl }],
                timeline: [{ label: "Present", title: "Decision point", body: "Trying to decide between contact, distance, and a softer boundary." }],
                comments: [
                  { author: "Anonymous reply", handle: "@advice", text: "You can forgive without reopening direct access immediately.", time: "11m" },
                  { author: "Anonymous reply", handle: "@advice", text: "Protect your peace first, then decide what contact means.", time: "5m", replyTo: "@advice" }
                ]
              }
            ]
          : [
              {
                id: "chapter-1",
                title: "The first loss did not explain the second",
                body:
                  "When the business fell apart, I kept trying to narrate the entire collapse in one paragraph. It made me sound clean and wise. The truth was messier. The archive only started making sense when I gave each failure its own date and weight.",
                summary: "The collapse becomes readable only after each setback gets its own chapter and timestamp.",
                likes: 201,
                liked: false,
                images: [
                  {
                    src: "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80",
                    alt: "Desk with invoices, papers, and calculator"
                  }
                ],
                voiceNotes: [{ name: "Loss inventory voice note", detail: "01:06 // recorded after closing accounts", src: sampleVoiceNoteUrl }],
                timeline: [
                  { label: "Jun / 12 / 2021", title: "First unpaid invoice", body: "The first sign that the collapse had already started." },
                  { label: "Sep / 3 / 2021", title: "Closed the office", body: "I packed what was left and kept only the records." }
                ],
                comments: [{ author: "Maryam A.", handle: "@maryamarchive", text: "Writing the setbacks separately is what made the story breathe.", time: "14m" }]
              },
              {
                id: "chapter-2",
                title: "Rebuilding as a sequence, not a slogan",
                body:
                  "Recovery arrived as invoices, rejected calls, quiet payments, and one client who stayed long enough to prove the work could still carry me. That was more honest than calling it a comeback.",
                summary: "Recovery is shown as a chain of small proofs instead of one dramatic comeback scene.",
                likes: 163,
                liked: false,
                images: [
                  {
                    src: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1200&q=80",
                    alt: "Person working quietly at a desk while rebuilding"
                  },
                  {
                    src: "https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=1200&q=80",
                    alt: "First client payment notification on a phone"
                  }
                ],
                voiceNotes: [],
                timeline: [{ label: "Jan / 10 / 2022", title: "First stable client", body: "The first payment that felt like a possible future." }],
                comments: [
                  { author: "David Ojo", handle: "@davidwrites", text: "One giant summary kept flattening the life inside it.", time: "10m", replyTo: "@maryamarchive" },
                  { author: "Femi K.", handle: "@femireads", text: "This should be a full public series.", time: "3m" }
                ]
              }
            ]
  }));

function ProfilePage({
  accessToken
}: {
  accessToken: string;
}) {
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);
  const [savedStories, setSavedStories] = useState<ApiStory[]>([]);

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ProfileDashboard>("/profile/me", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setDashboard(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboard(null);
        }
      });

    void apiRequest<{ stories: ApiStory[] }>("/profile/saved", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setSavedStories(payload.stories);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const profileStoriesData = dashboard?.stories ?? [];
  const profileActivityData = dashboard?.activity ?? [];
  const profileMetrics = dashboard?.metrics;
  const profileUser = dashboard?.user;

  return (
    <main className="page-shell">
      <section className="topbar card profile-utility-bar">
        <div className="topbar-copy profile-topbar-copy">
          <strong>Profile archive</strong>
          <span>Identity, privacy, and archive controls.</span>
        </div>
        <div className="topbar-actions profile-topbar-actions">
          <NavLink className="ghost-action" to="/feed">
            BACK TO FEED
          </NavLink>
          <NavLink className="primary-action" to="/profile/edit">
            EDIT PROFILE
            <Icon className="button-icon" name="arrow" />
          </NavLink>
        </div>
      </section>

      <section className="profile-stage card">
        <div className="profile-stage-copy">
          <h1>{profileUser?.fullName ?? "Loading profile..."}</h1>
          <strong>{profileUser ? `@${profileUser.username}` : "@..."}</strong>
          <p>{profileUser?.bio || "Update your profile to describe your archive."}</p>
        </div>

        <div className="profile-header">
          <span className="profile-avatar-xl">{(profileUser?.fullName ?? "H").slice(0, 1).toUpperCase()}</span>
          <div className="profile-header-copy">
            <div className="profile-header-meta">
              <span className="story-tag">{(profileUser?.profileVisibility ?? "public").toUpperCase()} PROFILE</span>
              <span className="story-tag">{(profileUser?.subscriptionTier ?? "free").toUpperCase()} PLAN</span>
            </div>
            <p>{profileUser?.location || "Add your location in profile settings."}</p>
          </div>
          <div className="profile-header-actions">
            <NavLink className="primary-action" to="/profile/edit">
              EDIT PROFILE
              <Icon className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/studio">
              OPEN STUDIO
            </NavLink>
          </div>
        </div>

      </section>

      <section className="profile-metric-strip">
        <article className="profile-stat-card">
          <span>Published stories</span>
          <strong>{profileMetrics?.publishedStories ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Total chapters</span>
          <strong>{profileMetrics?.totalChapters ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Total reads</span>
          <strong>{profileMetrics?.totalReads ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Anonymous posts</span>
          <strong>{profileMetrics?.anonymousPosts ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Followers</span>
          <strong>{profileMetrics?.followers ?? 0}</strong>
        </article>
      </section>

      <section className="profile-content-grid">
        <div className="profile-primary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>PUBLISHED_STORIES</SectionLabel>
                <h2>Stories and chapter packs</h2>
              </div>
              <div className="profile-story-list">
                {profileStoriesData.map((story) => (
                  <div className="profile-story-card" key={story.title}>
                    <div className="profile-story-head">
                      <div className="profile-story-copy">
                        <strong>{story.title}</strong>
                        <span>{story.chapters}</span>
                      </div>
                      <span className="story-tag">{story.visibility}</span>
                    </div>
                    <small>{story.reads} // {story.status}</small>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>RECENT_ACTIVITY</SectionLabel>
                <h2>Archive notifications</h2>
              </div>
              <div className="profile-activity-list">
                {profileActivityData.map((item) => (
                  <div className="profile-activity-row" key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    <small>{item.time}</small>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="profile-secondary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>ACCOUNT_CONTROLS</SectionLabel>
                <h2>What you can manage</h2>
              </div>
              <div className="profile-settings-list">
                {profileSettings.map((item) => (
                  <div className="profile-setting-row" key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>ANON_AND_HELP</SectionLabel>
                <h2>Anonymous posts and help requests</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Anonymous advice posts</strong>
                  <span>{profileMetrics?.anonymousPosts ?? 0} active anonymous messages tied to your account.</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Consent-fee requests</strong>
                  <span>{profileUser?.allowHelpRequests ? "Help requests are enabled on your account." : "Help requests are disabled on your account."}</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Comment defaults</strong>
                  <span>{profileUser?.allowCommentsByDefault ? "Comments are enabled by default for new stories." : "Comments are disabled by default for new stories."}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>SAVED_AND_PREMIUM</SectionLabel>
                <h2>Saved reading and plan status</h2>
              </div>
              <div className="profile-story-list">
                {(savedStories.length
                  ? savedStories.map((story) => ({ title: story.title, meta: `${story.readCount} reads` }))
                  : profileSavedShelf
                ).map((item) => (
                  <div className="profile-story-card" key={item.title}>
                    <div className="profile-story-copy">
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="profile-premium-card">
                <span className="story-tag">PRO PLAN</span>
                <strong>$12 / month</strong>
                <p>Unlimited chapters, more media slots, selected-reader controls, and extended archive privacy.</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function EditProfilePage({
  accessToken
}: {
  accessToken: string;
}) {
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);
  const [sessions, setSessions] = useState<ProfileSession[]>([]);
  const [formFeedback, setFormFeedback] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCircle, setInviteCircle] = useState<"family" | "friend">("family");
  const [stories, setStories] = useState<ApiStory[]>([]);
  const [inviteStoryId, setInviteStoryId] = useState("");
  const [contributorInvites, setContributorInvites] = useState<ContributorInviteRecord[]>([]);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    username: "",
    bio: "",
    location: "",
    profileVisibility: "public",
    defaultStoryVisibility: "selected",
    allowCommentsByDefault: true,
    allowHelpRequests: true,
    hideReadCounts: false,
    showAnonymousActivity: true
  });

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ProfileDashboard>("/profile/me", { accessToken })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDashboard(payload);
        setProfileForm({
          fullName: payload.user.fullName,
          username: payload.user.username,
          bio: payload.user.bio,
          location: payload.user.location,
          profileVisibility: payload.user.profileVisibility,
          defaultStoryVisibility: payload.user.defaultStoryVisibility,
          allowCommentsByDefault: payload.user.allowCommentsByDefault,
          allowHelpRequests: payload.user.allowHelpRequests,
          hideReadCounts: payload.user.hideReadCounts,
          showAnonymousActivity: payload.user.showAnonymousActivity
        });
      })
      .catch(() => undefined);

    void apiRequest<ApiStory[]>("/stories/mine", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setStories(payload);
          setInviteStoryId(payload[0]?.id ?? "");
        }
      })
      .catch(() => undefined);

    void apiRequest<{ invites: ContributorInviteRecord[] }>("/profile/invites", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setContributorInvites(payload.invites);
        }
      })
      .catch(() => undefined);

    void apiRequest<{ sessions: ProfileSession[] }>("/profile/sessions", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setSessions(payload.sessions);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleInviteContributor = () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail || !inviteStoryId) {
      return;
    }

    void apiRequest<{ invite: ContributorInviteRecord }>("/profile/invites", {
      method: "POST",
      accessToken,
      body: {
        email: trimmedEmail,
        circle: inviteCircle,
        storyId: inviteStoryId
      }
    })
      .then((payload) => {
        setContributorInvites((current) => [payload.invite, ...current]);
        setInviteEmail("");
        setInviteCircle("family");
        setInviteStoryId(stories[0]?.id ?? inviteStoryId);
      })
      .catch((error) => {
        setFormFeedback(getErrorMessage(error, "Could not create invite."));
      });
  };

  const handleRemoveInvite = (inviteId: string) => {
    void apiRequest<{ invite: ContributorInviteRecord }>(`/profile/invites/${inviteId}`, {
      method: "DELETE",
      accessToken
    })
      .then((payload) => {
        setContributorInvites((current) =>
          current.map((invite) => (invite.id === inviteId ? payload.invite : invite))
        );
      })
      .catch((error) => {
        setFormFeedback(getErrorMessage(error, "Could not revoke invite."));
      });
  };

  const handleProfileInput = (field: keyof typeof profileForm, value: string | boolean) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfile = async () => {
    try {
      const result = await apiRequest<{ user: ProfileDashboard["user"] }>("/profile/me", {
        method: "PATCH",
        accessToken,
        body: profileForm
      });
      setProfileForm((current) => ({
        ...current,
        fullName: result.user.fullName,
        username: result.user.username
      }));
      setFormFeedback("Profile saved.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not save profile."));
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const payload = await apiRequest<{ session: ProfileSession }>(`/profile/sessions/${sessionId}/revoke`, {
        method: "POST",
        accessToken
      });
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? payload.session : session))
      );
      setFormFeedback("Session revoked.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not revoke session."));
    }
  };

  return (
    <main className="page-shell">
      <div className="profile-edit-back">
        <NavLink className="ghost-action" to="/profile">
          <Icon className="button-icon" name="arrow" />
          BACK
        </NavLink>
      </div>

      <section className="profile-editor-stage card">
        <div className="profile-editor-stage-copy">
          <SectionLabel>IDENTITY_AND_ACCESS</SectionLabel>
          <h1>Update identity, privacy, invites, and archive defaults.</h1>
          <p>Use this page to manage what readers see, how stories open to others, and who can help you write by invitation.</p>
        </div>
        <div className="profile-editor-stage-notes">
          <div className="profile-editor-note">
            <strong>Public profile</strong>
            <span>Controls name, username, bio, and location shown to readers.</span>
          </div>
          <div className="profile-editor-note">
            <strong>Contributor invites</strong>
            <span>Invite family or friends by email and choose the exact story they can contribute to.</span>
          </div>
        </div>
      </section>

      <section className="profile-editor-shell">
        <article className="profile-panel card profile-editor-main">
          <div className="profile-panel-body">
            <div className="profile-section-copy profile-editor-copy">
              <SectionLabel>EDIT_PROFILE</SectionLabel>
              <h2>Identity and visibility</h2>
              <span>Update the public details, location, bio, and default archive visibility for new chapters.</span>
            </div>
            <div className="profile-form-grid">
              <label>
                Display name
                <input onChange={(event) => handleProfileInput("fullName", event.target.value)} value={profileForm.fullName} />
              </label>
              <label>
                Username
                <input onChange={(event) => handleProfileInput("username", event.target.value.replace(/^@/, ""))} value={`@${profileForm.username}`} />
              </label>
              <label>
                Bio
                <textarea onChange={(event) => handleProfileInput("bio", event.target.value)} value={profileForm.bio} />
              </label>
              <label>
                Location
                <input onChange={(event) => handleProfileInput("location", event.target.value)} value={profileForm.location} />
              </label>
              <label>
                Profile visibility
                <select onChange={(event) => handleProfileInput("profileVisibility", event.target.value)} value={profileForm.profileVisibility}>
                  <option value="public">Public</option>
                  <option value="selected">Selected readers</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label>
                Default chapter visibility
                <select onChange={(event) => handleProfileInput("defaultStoryVisibility", event.target.value)} value={profileForm.defaultStoryVisibility}>
                  <option value="public">Public</option>
                  <option value="selected">Selected readers</option>
                  <option value="private">Private</option>
                  <option value="anonymous">Anonymous advice</option>
                </select>
              </label>
            </div>
          </div>
        </article>

        <div className="profile-editor-side">
          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>CONTRIBUTOR_INVITES</SectionLabel>
                <h2>Invite family or friends to contribute</h2>
                <span>Choose a story, send the invite by email, and manage who can contribute.</span>
              </div>
              <div className="profile-form-grid profile-invite-grid">
                <label>
                  Invite email
                  <input onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" value={inviteEmail} />
                </label>
                <label>
                  Invite type
                  <select onChange={(event) => setInviteCircle(event.target.value as "family" | "friend")} value={inviteCircle}>
                    <option value="family">Family</option>
                    <option value="friend">Friend</option>
                  </select>
                </label>
                <label>
                  Story to contribute to
                  <select onChange={(event) => setInviteStoryId(event.target.value)} value={inviteStoryId}>
                    {stories.map((story) => (
                      <option key={story.id} value={story.id}>
                        {story.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chapter-controls profile-editor-actions">
                <button className="primary-action" onClick={handleInviteContributor} type="button">
                  SEND INVITE
                  <Icon className="button-icon" name="arrow" />
                </button>
              </div>
              <div className="profile-settings-list">
                {contributorInvites.map((invite) => (
                  <div className="profile-setting-row" key={invite.id}>
                    <strong>{invite.email}</strong>
                    <span>
                      {invite.circle === "family" ? "Family" : "Friend"} // {invite.story}
                    </span>
                    <small>{invite.status}</small>
                    <button className="ghost-action slim-action" onClick={() => handleRemoveInvite(invite.id)} type="button">
                      REVOKE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>PROFILE_CONTROLS</SectionLabel>
                <h2>Profile controls</h2>
              </div>
              <div className="profile-toggle-stack">
                <label className="toggle-row">
                  <input checked={profileForm.allowCommentsByDefault} onChange={(event) => handleProfileInput("allowCommentsByDefault", event.target.checked)} type="checkbox" />
                  <span>Allow comments on published chapters</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.allowHelpRequests} onChange={(event) => handleProfileInput("allowHelpRequests", event.target.checked)} type="checkbox" />
                  <span>Let readers request to help through consent-fee flow</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.hideReadCounts} onChange={(event) => handleProfileInput("hideReadCounts", event.target.checked)} type="checkbox" />
                  <span>Hide read counts from public profile view</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.showAnonymousActivity} onChange={(event) => handleProfileInput("showAnonymousActivity", event.target.checked)} type="checkbox" />
                  <span>Show anonymous advice activity inside profile dashboard</span>
                </label>
              </div>
              {formFeedback ? <p className="status-feedback">{formFeedback}</p> : null}
              <div className="chapter-controls">
                <button className="ghost-action" type="button">CANCEL</button>
                <button className="primary-action" onClick={() => void saveProfile()} type="button">
                  SAVE PROFILE
                  <Icon className="button-icon" name="arrow" />
                </button>
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>SECURITY_AND_ACCESS</SectionLabel>
                <h2>Security and access</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Email verification</strong>
                  <span>{dashboard?.user.email ?? "Loading email..."}</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Password</strong>
                  <span>Last changed 14 days ago</span>
                </div>
                {sessions.map((session) => (
                  <div className="profile-setting-row" key={session.id}>
                    <strong>{session.userAgent}</strong>
                    <span>{session.active ? "Active session" : "Revoked"}{session.ipAddress ? ` // ${session.ipAddress}` : ""}</span>
                    <button className="ghost-action slim-action" onClick={() => void revokeSession(session.id)} type="button">
                      {session.active ? "REVOKE" : "REVOKED"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function FeedPage({
  accessToken
}: {
  accessToken: string;
}) {
  const navigate = useNavigate();
  const [feedPosts, setFeedPosts] = useState<FeedStoryRecord[]>([]);
  const [shareSheet, setShareSheet] = useState<ShareSheetPayload | null>(null);
  const [activeAnonymousIndex, setActiveAnonymousIndex] = useState<number | null>(null);
  const [anonymousReplyDraft, setAnonymousReplyDraft] = useState("");
  const [helpTarget, setHelpTarget] = useState<AnonymousFeedSource | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const openStory = (slug: string) => navigate(`/feed/story/${slug}`);
  const openShareSheet = (post: FeedStoryRecord) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    setShareSheet({
      title: post.title,
      text: `${post.title} by ${post.author}`,
      url: `${baseUrl}/feed/story/${post.slug}`
    });
  };
  const [shareFeedback, setShareFeedback] = useState("");
  const anonymousFeedPosts = feedPosts.filter((post) => post.anonymous);

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ApiFeedStory[]>("/stories/feed")
      .then((stories) => {
        if (!cancelled) {
          setFeedPosts(stories.map((story) => toFeedStoryRecord(story)));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load the public feed."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const anonymousFeedSources: AnonymousFeedSource[] = [
    ...anonymousFeedPosts.map((post) => ({
      id: post.slug,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      meta: `${post.reads} reads`,
      comments: (post.chapters[0]?.comments ?? []).map((comment) => ({ author: comment.author, text: comment.text })),
      helpFee: post.helpFee ?? 8,
      fromQuickMemory: false
    }))
  ];
  const anonymousFeedMessages = anonymousFeedSources.flatMap((source) => {
    const chapterReplies =
      source.comments.slice(0, 2).map((comment, index) => ({
        id: `${source.slug}-reply-${index}`,
        postSlug: source.slug,
        title: "Anonymous reply",
        meta: source.meta,
        preview: comment.text
      })) ?? [];

    return [
      {
        id: `${source.slug}-lead`,
        postSlug: source.slug,
        title: "Anonymous",
        meta: source.meta,
        preview: source.excerpt
      },
      ...chapterReplies
    ];
  });
  const activeAnonymousMessage = activeAnonymousIndex === null ? null : anonymousFeedMessages[activeAnonymousIndex] ?? null;
  const activeAnonymousPost =
    activeAnonymousMessage ? anonymousFeedSources.find((source) => source.slug === activeAnonymousMessage.postSlug) ?? null : null;

  const toggleFeedLike = (slug: string) => {
    const targetPost = feedPosts.find((post) => post.slug === slug);
    if (!targetPost) {
      return;
    }

    void apiRequest<{ storyId: string; action: "like" | "bookmark"; active: boolean }>(
      `/stories/${targetPost.chapters[0]?.id.split(":")[0] ?? ""}/reactions`,
      {
        method: "POST",
        accessToken,
        body: { action: "like" }
      }
    )
      .then((result) => {
        setFeedPosts((current) =>
          current.map((post) =>
            post.slug === slug
              ? { ...post, liked: result.active, likes: Math.max(0, post.likes + (result.active ? 1 : -1)) }
              : post
          )
        );
      })
      .catch((error) => setShareFeedback(getErrorMessage(error, "Could not update story like.")));
  };

  const toggleFeedBookmark = (slug: string) => {
    const targetPost = feedPosts.find((post) => post.slug === slug);
    if (!targetPost) {
      return;
    }

    void apiRequest<{ storyId: string; action: "like" | "bookmark"; active: boolean }>(
      `/stories/${targetPost.chapters[0]?.id.split(":")[0] ?? ""}/reactions`,
      {
        method: "POST",
        accessToken,
        body: { action: "bookmark" }
      }
    )
      .then((result) => {
        setFeedPosts((current) =>
          current.map((post) => (post.slug === slug ? { ...post, bookmarked: result.active } : post))
        );
      })
      .catch((error) => setShareFeedback(getErrorMessage(error, "Could not update bookmark.")));
  };

  const submitAnonymousReply = () => {
    if (!activeAnonymousPost || !anonymousReplyDraft.trim()) {
      return;
    }

    void apiRequest<ApiComment>("/comments", {
      method: "POST",
      accessToken,
      body: {
        targetType: "storyChapter",
        targetId: activeAnonymousPost.id,
        body: anonymousReplyDraft.trim()
      }
    })
      .then((comment) => {
        setFeedPosts((current) =>
          current.map((post) =>
            post.slug === activeAnonymousPost.slug
              ? {
                  ...post,
                  chapters: post.chapters.map((chapter, index) =>
                    index === 0
                      ? {
                          ...chapter,
                          comments: [
                            ...chapter.comments,
                            {
                              author: comment.authorName,
                              handle: `@${comment.authorUsername}`,
                              text: comment.body,
                              time: "now"
                            }
                          ]
                        }
                      : chapter
                  )
                }
              : post
          )
        );
        setAnonymousReplyDraft("");
        setShareFeedback("Anonymous advice sent.");
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not send the anonymous reply."));
      });
  };

  const confirmHelpRequest = () => {
    if (!helpTarget || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    setShareFeedback(`Consent fee confirmed. The help request for "${helpTarget.title}" is now pending.`);
    setHelpTarget(null);
    setConsentAccepted(false);
  };

  const downloadAnonymousMessageImage = (post: AnonymousFeedSource) => {
    if (typeof document === "undefined") {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const context = canvas.getContext("2d");

    if (!context) {
      setShareFeedback("Could not prepare the anonymous post image.");
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#f7faff");
    gradient.addColorStop(1, "#fff1e8");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1080, 1350);

    context.fillStyle = "#ffffff";
    roundRect(context, 70, 70, 940, 1210, 42);
    context.fill();

    context.fillStyle = "#1b2440";
    context.font = "700 32px Space Grotesk, sans-serif";
    context.fillText("HISTORA", 130, 136);
    context.font = "700 42px Space Grotesk, sans-serif";
    context.fillText("ANONYMOUS MESSAGE", 130, 186);
    context.font = "400 30px Manrope, sans-serif";
    context.fillStyle = "#667085";
    context.fillText(post.meta, 130, 230);

    const ringGradient = context.createLinearGradient(110, 270, 270, 430);
    ringGradient.addColorStop(0, "#315efb");
    ringGradient.addColorStop(1, "#ff7a45");
    context.fillStyle = ringGradient;
    context.beginPath();
    context.arc(190, 360, 84, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#1b2440";
    context.beginPath();
    context.arc(190, 360, 72, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = "#ffffff";
    context.font = "700 64px Space Grotesk, sans-serif";
    context.textAlign = "center";
    context.fillText("A", 190, 382);
    context.textAlign = "start";

    context.fillStyle = "#1b2440";
    context.font = "700 56px Space Grotesk, sans-serif";
    const messageLines = wrapCanvasText(context, post.excerpt, 820);
    messageLines.slice(0, 12).forEach((line, index) => {
      context.fillText(line, 130, 520 + index * 68);
    });

    context.font = "700 34px Space Grotesk, sans-serif";
    context.fillStyle = "#cc5a24";
    context.fillText(`${post.comments.length} replies // Anonymous advice`, 130, 1170);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${post.slug}-anonymous-message.png`;
    link.click();
    setShareFeedback("Anonymous post image saved to your device.");
  };

  return (
    <main className="page-shell">
      <StoryCirclesRow />

      <section className="feed-layout feed-layout-expanded">
        <div className="feed-column">
          {feedPosts.map((post, index) => (
            <Fragment key={post.title}>
              <article className="post-card card post-card-clickable" onClick={() => openStory(post.slug)}>
                <div className="post-top">
                  <div className="post-author">
                    <span className="post-avatar">{post.author.slice(0, 1)}</span>
                    <div>
                      <strong>{post.author}</strong>
                      <span>{post.handle}</span>
                    </div>
                  </div>
                  <span className="story-tag">{post.visibility}</span>
                </div>
                <div className="image-frame">
                  <img alt={post.title} className="post-image" src={feedStory} />
                </div>
                <div className="post-body">
                  <div className="post-meta-row">
                    <span>{post.genre}</span>
                    <span>{post.chapterCount} chapters</span>
                    <span>{post.reads} reads</span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt}</p>
                  <div className="post-actions feed-card-actions">
                    <button className={post.liked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={(event) => {
                      event.stopPropagation();
                      toggleFeedLike(post.slug);
                    }} type="button">
                      <Icon className="inline-icon" name="heart" />
                      {post.likes}
                    </button>
                    <button className="feed-action-pill" onClick={(event) => {
                      event.stopPropagation();
                      openStory(post.slug);
                    }} type="button">
                      <Icon className="inline-icon" name="comment" />
                      {post.comments}
                    </button>
                    <button className={post.bookmarked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={(event) => {
                      event.stopPropagation();
                      toggleFeedBookmark(post.slug);
                    }} type="button">
                      <Icon className="inline-icon" name="bookmark" />
                      {post.saves}
                    </button>
                    <button className="feed-action-pill" onClick={(event) => {
                      event.stopPropagation();
                      openShareSheet(post);
                    }} type="button">
                      <Icon className="inline-icon" name="share" />
                      {post.shares}
                    </button>
                  </div>
                  {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
                </div>
              </article>

              {index === 0 && anonymousFeedMessages.length ? (
                <section className="feed-footer-strip card feed-anonymous-inline">
                  <div className="section-head">
                    <div className="chapter-heading-block">
                      <SectionLabel>ANONYMOUS_MESSAGES</SectionLabel>
                      <h2>Anonymous messages readers are opening</h2>
                    </div>
                    <span aria-label="Scroll sideways" className="section-meta">↔</span>
                  </div>
                  <div className="status-scroll anonymous-status-strip">
                    {anonymousFeedMessages.map((message, messageIndex) => (
                      <button className="anonymous-message-card" key={message.id} onClick={() => setActiveAnonymousIndex(messageIndex)} type="button">
                        <div className="anonymous-message-head">
                          <span className="status-ring tone-ink">
                            <span className="status-avatar">A</span>
                          </span>
                          <div className="anonymous-message-meta">
                            <strong>{message.title}</strong>
                            <span>{message.meta}</span>
                          </div>
                        </div>
                        <p>{message.preview}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>
      {shareSheet ? <ShareSheet onClose={() => setShareSheet(null)} onFeedback={setShareFeedback} share={shareSheet} /> : null}
      {activeAnonymousPost ? (
        <div className="status-viewer-backdrop" onClick={() => setActiveAnonymousIndex(null)} role="presentation">
          <article className="status-story-viewer tone-ink anonymous-feed-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="story-viewer-close-row">
              <button aria-label="Close anonymous message" className="icon-chip" onClick={() => setActiveAnonymousIndex(null)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <div className="story-viewer-top">
              <div className="story-viewer-author">
                  <span className="status-ring tone-ink">
                    <span className="status-avatar">A</span>
                  </span>
                  <div>
                    <strong>Anonymous</strong>
                    <span>{activeAnonymousPost.meta}</span>
                  </div>
                </div>
                <div className="story-viewer-top-actions">
                <button aria-label="Download anonymous post" className="icon-chip" onClick={() => downloadAnonymousMessageImage(activeAnonymousPost)} type="button">
                  <Icon className="button-icon" name="download" />
                </button>
              </div>
            </div>

            <div className="story-stage-card">
              <span className="story-tag">Anonymous advice</span>
              <h3>{activeAnonymousPost.title}</h3>
              <p>{activeAnonymousPost.excerpt}</p>
              <div className="story-stage-metrics">
                <span>{activeAnonymousPost.fromQuickMemory ? "Quick memory status" : "Anonymous chapter"}</span>
                <strong>{activeAnonymousPost.comments.length} replies</strong>
              </div>
              <div className="anonymous-status-tools">
                <button className="primary-action anonymous-help-action" onClick={() => {
                  setHelpTarget(activeAnonymousPost);
                  setConsentAccepted(false);
                }} type="button">Render help</button>
              </div>
              {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
            </div>

            <div className="story-reply-bar">
              <input
                onChange={(event) => setAnonymousReplyDraft(event.target.value)}
                placeholder="Reply anonymously..."
                value={anonymousReplyDraft}
              />
              <button className="primary-action" onClick={submitAnonymousReply} type="button">
                Send anonymous reply
              </button>
            </div>

            <div className="story-comment-list">
              {activeAnonymousPost.comments.map((comment, index) => (
                <div className="story-comment-card" key={`${comment.author}-${index}`}>
                  <strong>{comment.author}</strong>
                  <p>{comment.text}</p>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}
      {helpTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>CONSENT_FEE</SectionLabel>
                <h3>Render help for this anonymous message</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setHelpTarget(null)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <p>
              To protect privacy, helpers pay a consent fee of ${helpTarget.helpFee ?? 8} before any contact request can be passed
              to the anonymous poster.
            </p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for this help request.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setHelpTarget(null)} type="button">Cancel</button>
              <button className="primary-action" onClick={confirmHelpRequest} type="button">Pay consent fee</button>
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}

function FeedStoryPage({
  accessToken
}: {
  accessToken: string;
}) {
  const navigate = useNavigate();
  const { storySlug } = useParams();
  const [stories, setStories] = useState<FeedStoryRecord[]>([]);
  const [chapterReplyDrafts, setChapterReplyDrafts] = useState<Record<string, string>>({});
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareSheet, setShareSheet] = useState<ShareSheetPayload | null>(null);
  const [helpTarget, setHelpTarget] = useState<FeedStoryRecord | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState("");

  const story = stories.find((entry) => entry.slug === storySlug) ?? null;
  const totalChapterComments = story?.chapters.reduce((total, chapter) => total + chapter.comments.length, 0) ?? 0;
  const activeChapter = story?.chapters.find((chapter) => chapter.id === activeChapterId) ?? story?.chapters[0] ?? null;
  const activeChapterIndex = story?.chapters.findIndex((chapter) => chapter.id === activeChapter?.id) ?? 0;
  const relatedChapters = story?.chapters.filter((chapter) => chapter.id !== activeChapter?.id) ?? [];
  const activeChapterNumber = activeChapterIndex >= 0 ? activeChapterIndex + 1 : 1;

  useEffect(() => {
    let cancelled = false;

    if (!storySlug) {
      return;
    }

    void apiRequest<ApiStory>(`/stories/public/${storySlug}`)
      .then(async (storyPayload) => {
        const nextStory = toFeedStoryRecord({
          ...storyPayload,
          chapterCount: storyPayload.chapters.length,
          commentCount: 0
        });

        const chapterComments = await Promise.all(
          storyPayload.chapters.map(async (chapter) => {
            const comments = await apiRequest<ApiComment[]>(
              `/comments?targetType=storyChapter&targetId=${encodeURIComponent(`${storyPayload.id}:${chapter.order}`)}`
            );

            return [chapter.order, comments] as const;
          })
        );

        if (cancelled) {
          return;
        }

        const commentMap = new Map(chapterComments);
        nextStory.chapters = nextStory.chapters.map((chapter, index) => ({
          ...chapter,
          comments:
            commentMap.get(index + 1)?.map((comment) => ({
              author: comment.authorName,
              handle: `@${comment.authorUsername}`,
              text: comment.body,
              time: new Date(comment.createdAt).toLocaleDateString()
            })) ?? []
        }));

        setStories([nextStory]);
      })
      .catch((error) => {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load this story."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storySlug]);

  useEffect(() => {
    if (!story) {
      return;
    }

    setActiveChapterId(story.chapters[0]?.id ?? "");
  }, [story?.slug]);

  const updateStory = (updater: (story: FeedStoryRecord) => FeedStoryRecord) => {
    if (!story) {
      return;
    }

    setStories((current) => current.map((entry) => (entry.slug === story.slug ? updater(entry) : entry)));
  };

  const toggleFollow = () => {
    if (!story) {
      return;
    }

    void apiRequest<{ username: string; active: boolean }>(
      `/profile/follows/${story.handle.replace(/^@/, "")}/toggle`,
      {
        method: "POST",
        accessToken
      }
    )
      .then((result) => {
        updateStory((current) => ({ ...current, following: result.active }));
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not update follow state."));
      });
  };

  const toggleStoryLike = () => {
    if (!story) {
      return;
    }

    void apiRequest<{ active: boolean }>(`/stories/${story.chapters[0]?.id.split(":")[0] ?? ""}/reactions`, {
      method: "POST",
      accessToken,
      body: { action: "like" }
    })
      .then((result) => {
        updateStory((current) => ({
          ...current,
          liked: result.active,
          likes: Math.max(0, current.likes + (result.active ? 1 : -1))
        }));
      })
      .catch((error) => setShareFeedback(getErrorMessage(error, "Could not update story like.")));
  };

  const toggleStoryBookmark = () => {
    if (!story) {
      return;
    }

    void apiRequest<{ active: boolean }>(`/stories/${story.chapters[0]?.id.split(":")[0] ?? ""}/reactions`, {
      method: "POST",
      accessToken,
      body: { action: "bookmark" }
    })
      .then((result) => {
        updateStory((current) => ({ ...current, bookmarked: result.active }));
      })
      .catch((error) => setShareFeedback(getErrorMessage(error, "Could not update bookmark.")));
  };

  const openShareSheet = (payload: ShareSheetPayload) => {
    setShareSheet(payload);
  };

  const shareStory = async () => {
    if (!story) {
      return;
    }
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    openShareSheet({
      title: story.title,
      text: `${story.title} by ${story.author}`,
      url: `${baseUrl}/feed/story/${story.slug}`
    });
  };

  const toggleChapterLike = (chapterId: string) => {
    updateStory((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId
          ? { ...chapter, liked: !chapter.liked, likes: chapter.liked ? chapter.likes - 1 : chapter.likes + 1 }
          : chapter
      )
    }));
  };

  const submitChapterComment = (chapterId: string) => {
    const draft = chapterReplyDrafts[chapterId]?.trim();
    if (!story || !draft) {
      return;
    }

    void apiRequest<ApiComment>("/comments", {
      method: "POST",
      accessToken,
      body: {
        targetType: "storyChapter",
        targetId: chapterId,
        body: draft
      }
    })
      .then((comment) => {
        const nextComment: FeedThreadComment = {
          author: comment.authorName,
          handle: `@${comment.authorUsername}`,
          text: comment.body,
          time: new Date(comment.createdAt).toLocaleDateString()
        };

        updateStory((current) => ({
          ...current,
          chapters: current.chapters.map((chapter) =>
            chapter.id === chapterId ? { ...chapter, comments: [...chapter.comments, nextComment] } : chapter
          )
        }));
        setChapterReplyDrafts((current) => ({ ...current, [chapterId]: "" }));
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not post this chapter reply."));
      });
  };

  const confirmHelpRequest = () => {
    if (!helpTarget || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    setShareFeedback(
      `Consent fee confirmed. You can now request to reach, message, or follow the anonymous poster for "${helpTarget.title}".`
    );
    setHelpTarget(null);
    setConsentAccepted(false);
  };

  if (!story) {
    return (
      <main className="page-shell">
        <section className="card feed-reader-empty">
          <h1>Story not found</h1>
          <p>Return to the feed and open another published story.</p>
          <button className="ghost-action" onClick={() => navigate("/feed")} type="button">Back to feed</button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell feed-reader-shell">
      <section className="topbar card feed-reader-topbar">
        <div className="topbar-copy">
          <strong>{activeChapter ? `Chapter ${activeChapterNumber}: ${activeChapter.title}` : story.title}</strong>
          <span>{story.author} // {story.genre} // {story.chapterCount} chapters // {story.reads} reads</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost-action" onClick={() => navigate("/feed")} type="button">BACK TO FEED</button>
          <button className={story.following ? "primary-action" : "ghost-action"} onClick={toggleFollow} type="button">
            {story.following ? "UNFOLLOW" : "FOLLOW"}
          </button>
        </div>
      </section>

      <section className="feed-reader-single-column">
        <article className="feed-reader-main card story-reader-stage">
          <div className="story-reader-stage-copy">
            <SectionLabel>STORY_READING</SectionLabel>
            <h1>{story.title}</h1>
            <p>{story.excerpt}</p>
          </div>
          <div className="story-reader-stage-meta">
            <div className="story-reader-author-row">
              <span className="post-avatar">{story.author.slice(0, 1)}</span>
              <div>
                <strong>{story.author}</strong>
                <span>{story.handle}</span>
              </div>
            </div>
            <div className="story-reader-meta-list">
              <span>{`Chapter ${activeChapterNumber} of ${story.chapters.length}`}</span>
              <span>{story.visibility}</span>
              <span>{story.reads} reads</span>
            </div>
          </div>
          <div className="post-actions story-reader-stage-actions">
            <button className={story.liked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={toggleStoryLike} type="button">
              <Icon className="inline-icon" name="heart" />
              {story.likes}
            </button>
            <button className={story.bookmarked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={toggleStoryBookmark} type="button">
              <Icon className="inline-icon" name="bookmark" />
              {story.bookmarked ? "Saved" : story.saves}
            </button>
              <button className="feed-action-pill" onClick={() => void shareStory()} type="button">
                <Icon className="inline-icon" name="share" />
                {story.shares}
              </button>
            {story.anonymous ? (
              <button className="feed-action-pill" onClick={() => {
                setHelpTarget(story);
                setConsentAccepted(false);
              }} type="button">
                <Icon className="inline-icon" name="bolt" />
                Render help
              </button>
            ) : null}
          </div>
          {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
        </article>

        {activeChapter ? (
          <article className="chapter-reader-card chapter-reader-primary card">
            <div className="chapter-reader-shell">
              <header className="chapter-reader-head">
                <div>
                  <SectionLabel>{`CHAPTER_${activeChapterNumber}`}</SectionLabel>
                  <h2>{activeChapter.title}</h2>
                  <p className="chapter-reader-summary">{activeChapter.summary}</p>
                </div>
                <span className="story-tag">{story.visibility}</span>
              </header>

              <div className="chapter-reader-body">
                <div className="preview-rich-text chapter-reader-copy">
                  {activeChapter.body.split(/\n+/).map((paragraph, index) => (
                    <p key={`${activeChapter.id}-paragraph-${index}`}>{paragraph}</p>
                  ))}
                </div>

                {activeChapter.images.length ? (
                  <section className="chapter-content-section">
                    <div className="chapter-section-head">
                      <SectionLabel>MEMORY_ATTACHMENTS</SectionLabel>
                      <span>{activeChapter.images.length} images</span>
                    </div>
                    <div className="feed-reader-media-grid">
                      {activeChapter.images.map((image, index) => (
                        <figure className="feed-reader-media-frame" key={image.alt}>
                          <img alt={image.alt} className="post-image story-reader-image" src={image.src} />
                          <figcaption>{`Attachment ${index + 1} // ${image.alt}`}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                ) : null}

                {activeChapter.voiceNotes.length ? (
                  <section className="chapter-content-section">
                    <div className="chapter-section-head">
                      <SectionLabel>VOICE_NOTES</SectionLabel>
                      <span>{activeChapter.voiceNotes.length} attached</span>
                    </div>
                    <div className="feed-reader-support-grid">
                      {activeChapter.voiceNotes.map((voice) => (
                        <article className="feed-reader-support-card voice-note-card" key={voice.name}>
                          <div className="voice-note-icon">
                            <Icon className="button-icon" name="mic" />
                          </div>
                          <div className="voice-note-copy">
                            <strong>{voice.name}</strong>
                            <span>{voice.detail}</span>
                          </div>
                          <audio className="voice-note-player" controls preload="none">
                            <source src={voice.src} type="audio/mpeg" />
                          </audio>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {activeChapter.timeline.length ? (
                  <section className="chapter-content-section">
                    <div className="chapter-section-head">
                      <SectionLabel>TIMELINE_MOMENTS</SectionLabel>
                      <span>{activeChapter.timeline.length} moments</span>
                    </div>
                    <div className="feed-reader-support-grid">
                      {activeChapter.timeline.map((entry) => (
                        <article className="feed-reader-support-card" key={`${entry.label}-${entry.title}`}>
                          <strong>{entry.label}</strong>
                          <span>{entry.title}</span>
                          <p>{entry.body}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="post-actions story-reader-chapter-actions">
              <button className={activeChapter.liked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={() => toggleChapterLike(activeChapter.id)} type="button">
                <Icon className="inline-icon" name="heart" />
                {activeChapter.likes}
              </button>
              <button
                className="feed-action-pill"
                onClick={() =>
                  openShareSheet({
                    title: `${story.title} — ${activeChapter.title}`,
                    text: `${activeChapter.title} from ${story.title} by ${story.author}`,
                    url: `${typeof window !== "undefined" ? window.location.origin : ""}/feed/story/${story.slug}#${activeChapter.id}`
                  })
                }
                type="button"
              >
                <Icon className="inline-icon" name="share" />
                Share chapter
              </button>
              <button className={story.following ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={toggleFollow} type="button">
                <Icon className="inline-icon" name="spark" />
                {story.following ? "Following" : "Follow"}
              </button>
            </div>

              <footer className="chapter-thread-footer">
                <div className="chapter-section-head">
                  <div>
                    <SectionLabel>COMMENTS_THREAD</SectionLabel>
                    <h3>{`${activeChapter.comments.length} replies on this chapter`}</h3>
                  </div>
                </div>
                <div className="feed-thread-list">
                  {activeChapter.comments.map((comment, commentIndex) => (
                    <article className={`feed-thread-item${comment.replyTo ? " feed-thread-reply-item" : ""}`} key={`${comment.handle}-${commentIndex}`}>
                      <div className="feed-thread-line" aria-hidden="true" />
                      <div className="feed-thread-copy">
                        <div className="feed-thread-head">
                          <strong>{comment.author}</strong>
                          <span>{comment.handle}</span>
                          <small>{comment.time}</small>
                        </div>
                        {comment.replyTo ? <span className="feed-thread-context">Replying to {comment.replyTo}</span> : null}
                        <p>{comment.text}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="feed-thread-reply">
                  <textarea
                    className="status-compose-input feed-thread-input"
                    onChange={(event) => setChapterReplyDrafts((current) => ({ ...current, [activeChapter.id]: event.target.value }))}
                    placeholder="Reply in thread..."
                    value={chapterReplyDrafts[activeChapter.id] ?? ""}
                  />
                  <button className="primary-action" onClick={() => submitChapterComment(activeChapter.id)} type="button">
                    Post reply
                  </button>
                </div>
              </footer>
            </div>
          </article>
        ) : null}
      </section>

      <section className="feed-reader-footer-grid">
        <article className="rail-panel card story-reader-footer-card">
          <div className="story-reader-footer-inner">
            <div className="chapter-section-head">
              <div>
                <SectionLabel>RELATED_CHAPTERS</SectionLabel>
                <h3>Continue through this story</h3>
              </div>
              <span>{relatedChapters.length} more chapters</span>
            </div>
            <div className="feed-reader-related-list">
              {relatedChapters.map((chapter) => (
                <button className="feed-reader-related-card" key={chapter.id} onClick={() => setActiveChapterId(chapter.id)} type="button">
                  <span className="story-tag">{`Chapter ${story.chapters.findIndex((item) => item.id === chapter.id) + 1}`}</span>
                  <strong>{chapter.title}</strong>
                  <p>{chapter.summary}</p>
                  <small>{chapter.comments.length} thread replies</small>
                </button>
              ))}
            </div>
          </div>
        </article>

        <article className="rail-panel card story-reader-footer-card">
          <div className="story-reader-footer-inner story-reader-meta-card">
            <SectionLabel>STORY_FOOTER</SectionLabel>
            <div className="rail-stack">
              <div className="rail-row">
                <strong>Visibility</strong>
                <span>{story.visibility}</span>
              </div>
              <div className="rail-row">
                <strong>Published chapters</strong>
                <span>{story.chapters.length}</span>
              </div>
              <div className="rail-row">
                <strong>Comments</strong>
                <span>{totalChapterComments}</span>
              </div>
              <div className="rail-row">
                <strong>Contains</strong>
                <span>Summary, body, memory images, voice notes, timeline moments, thread replies</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      {helpTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>CONSENT_FEE</SectionLabel>
                <h3>Render help for this anonymous story</h3>
              </div>
              <button aria-label="Close render help dialog" className="icon-chip" onClick={() => setHelpTarget(null)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>
            <p>
              To protect privacy, you must pay a consent fee of ${helpTarget.helpFee ?? 8} before you are allowed to reach,
              message, or follow the person behind this anonymous post.
            </p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for rendering help on this anonymous post.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setHelpTarget(null)} type="button">Cancel</button>
              <button className="primary-action" onClick={confirmHelpRequest} type="button">Pay consent fee</button>
            </div>
          </article>
        </div>
      ) : null}
      {shareSheet ? <ShareSheet onClose={() => setShareSheet(null)} onFeedback={setShareFeedback} share={shareSheet} /> : null}
    </main>
  );
}

function StudioPage({
  accessToken,
  currentUser
}: {
  accessToken: string;
  currentUser: ProfileDashboard["user"];
}) {
  const navigate = useNavigate();
  const normalizeChapterTitle = (title: string) => title.replace(/^Chapter\s+\d+:\s*/i, "").trim();
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const timelineYearOptions = Array.from({ length: currentYear - 1949 }, (_, index) => String(currentYear + 5 - index));
  const chapterCompletionThreshold = 80;
  const getDaysInMonth = (year: string, month: string) => {
    const safeYear = Number.parseInt(year, 10) || currentYear;
    const safeMonth = Number.parseInt(month, 10);
    if (!safeMonth) {
      return 31;
    }
    return new Date(safeYear, safeMonth, 0).getDate();
  };
  const getTimelineMonthLabel = (month: string) => {
    const monthIndex = Number.parseInt(month, 10);
    if (!monthIndex || monthIndex < 1 || monthIndex > 12) {
      return "Month";
    }
    return monthLabels[monthIndex - 1];
  };
  const getPlainTextFromHtml = (html: string) => {
    if (typeof document === "undefined") {
      return html.replace(/<[^>]+>/g, " ");
    }

    const parser = document.createElement("div");
    parser.innerHTML = html;
    return parser.textContent ?? "";
  };
  const getChapterWordCount = (html: string) => {
    const plainText = getPlainTextFromHtml(html).trim();
    return plainText.length === 0 ? 0 : plainText.split(/\s+/).length;
  };
  const isChapterComplete = (chapter: { title: string; body: string }) =>
    chapter.title.trim().length > 0 && getChapterWordCount(chapter.body) >= chapterCompletionThreshold;
  const transcriptionLanguages = [
    { label: "English (US)", value: "en-US" },
    { label: "English (UK)", value: "en-GB" },
    { label: "French", value: "fr-FR" },
    { label: "Spanish", value: "es-ES" },
    { label: "German", value: "de-DE" },
    { label: "Portuguese (Brazil)", value: "pt-BR" },
    { label: "Arabic", value: "ar-SA" }
  ];
  const supportedTranscriptionLanguageValues = new Set([
    "en-US",
    "en-GB",
    "fr-FR",
    "es-ES",
    "de-DE",
    "pt-BR",
    "ar-SA"
  ]);
  const supportedTranscriptionLanguages = transcriptionLanguages.filter((language) =>
    supportedTranscriptionLanguageValues.has(language.value)
  );
  const initialChapterContent = {
    "Chapter 1: Before the city":
      "<p>I learned early that memory is rarely one clean scene. It is a room, then a sound, then a name I did not understand until years later.</p>",
    "Chapter 2: The year everything changed":
      "<p>I stopped trying to tell the story in one clean arc and started preserving the truth in fragments: one move, one loss, one new job, one proof that I was still here.</p>",
    "Advice post: Should I reconnect?":
      "<p>I do not know if reopening this relationship will heal anything or only restart a wound I barely closed.</p>"
  } as const;
  const [isEnteringStudio, setIsEnteringStudio] = useState(true);
  const [activeChapter, setActiveChapter] = useState(normalizeChapterTitle(chapterDrafts[1]?.title ?? "Chapter 2"));
  const [isPremium, setIsPremium] = useState(currentUser.subscriptionTier === "premium");
  const [visibility, setVisibility] = useState("selected");
  const [anonymous, setAnonymous] = useState(true);
  const [storyTitle, setStoryTitle] = useState("From borrowed rooms to my own front door");
  const [storySummary, setStorySummary] = useState(
    "A chaptered life story about movement, rebuilding, and finally feeling at home in my own voice."
  );
  const [chapterType, setChapterType] = useState("milestone");
  const [allowComments, setAllowComments] = useState(true);
  const [chapters, setChapters] = useState<StudioChapter[]>(
    chapterDrafts.map((chapter) => ({
      ...chapter,
      title: normalizeChapterTitle(chapter.title),
      body: initialChapterContent[chapter.title as keyof typeof initialChapterContent] ?? ""
    }))
  );
  const [studioMessage, setStudioMessage] = useState("Studio synced locally.");
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false);
  const [isDraftHistoryVisible, setIsDraftHistoryVisible] = useState(false);
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [draftHistory, setDraftHistory] = useState<string[]>(["Studio opened."]);
  const [studioNotice, setStudioNotice] = useState<null | { title: string; body: string }>(null);
  const [timelineEntries, setTimelineEntries] = useState(
    timelineMoments.map((moment) => ({
      year: moment.year,
      month: "01",
      day: "01",
      title: moment.title,
      body: moment.body
    }))
  );
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    quote: false,
    checklist: false,
    timeline: false,
    comment: false
  });
  const [imageAttachments, setImageAttachments] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [voiceNotes, setVoiceNotes] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isVoiceRecordingPaused, setIsVoiceRecordingPaused] = useState(false);
  const [voiceRecordingStatus, setVoiceRecordingStatus] = useState("Voice note idle");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranscriptionPanelVisible, setIsTranscriptionPanelVisible] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("Voice transcription idle");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("en-US");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const chapterBodyRef = useRef<HTMLDivElement | null>(null);
  const chapterEditorSectionRef = useRef<HTMLElement | null>(null);
  const mediaSectionRef = useRef<HTMLElement | null>(null);
  const publishSectionRef = useRef<HTMLElement | null>(null);
  const timelineSectionRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageAttachmentsRef = useRef<Array<{ name: string; url: string; source: string }>>([]);
  const voiceNotesRef = useRef<Array<{ name: string; url: string; source: string }>>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptionRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptionStreamRef = useRef<MediaStream | null>(null);
  const transcriptionQueueRef = useRef(Promise.resolve());
  const transcriptionPendingBlobRef = useRef<Blob | null>(null);
  const transcriptionRequestInFlightRef = useRef(false);
  const transcriptionSocketRef = useRef<WebSocket | null>(null);
  const transcriptionAudioContextRef = useRef<AudioContext | null>(null);
  const transcriptionProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionManualStopRef = useRef(false);
  const transcriptionCommittedTurnsRef = useRef<Set<number>>(new Set());
  const transcriptionFallbackTriggeredRef = useRef(false);
  const noticeAudioContextRef = useRef<AudioContext | null>(null);
  const hasLoadedStudioDraftRef = useRef(false);

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
  const studioStorageKey = "histora-studio-local-draft-v1";
  const imageLimit = isPremium ? 12 : 2;
  const voiceLimit = isPremium ? 6 : 1;
  const chapterLimit = isPremium ? 8 : 2;
  const activeChapterIndex = chapters.findIndex((chapter) => chapter.title === activeChapter);
  const activeChapterEntry = chapters[activeChapterIndex] ?? chapters[0];
  const activeChapterLabel = activeChapterEntry?.title ?? activeChapter;
  const chapterBody = activeChapterEntry?.body ?? "";
  const plainChapterText = getPlainTextFromHtml(chapterBody);
  const wordCount = getChapterWordCount(chapterBody);
  const chapterMetrics = chapters.map((chapter) => ({
    ...chapter,
    words: getChapterWordCount(chapter.body),
    isComplete: isChapterComplete(chapter)
  }));
  const readyChapters = chapterMetrics.filter((chapter) => chapter.isComplete);
  const startedIncompleteChapters = chapterMetrics.filter((chapter) => !chapter.isComplete && chapter.words > 0);
  const activeChapterReady = chapterMetrics[activeChapterIndex >= 0 ? activeChapterIndex : 0];
  const activeChapterNumber = Math.max(activeChapterIndex + 1, 1);
  const activeChapterNumberLabel = `Chapter ${activeChapterNumber}`;
  const currentChapterRequiredItems = [
    activeChapterLabel.trim().length > 0 ? null : "add a chapter title",
    plainChapterText.trim().length > 0 ? null : "write the chapter body",
    wordCount >= chapterCompletionThreshold ? null : `reach at least ${chapterCompletionThreshold} words`
  ].filter(Boolean) as string[];
  const currentChapterOptionalItems = [
    imageAttachments.length > 0 ? null : "attach an image",
    voiceNotes.length > 0 ? null : "record a voice note",
    timelineEntries.some(
      (entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0 || entry.year || entry.month || entry.day
    )
      ? null
      : "add a timeline moment"
  ].filter(Boolean) as string[];
  const chapterSlots = Array.from({ length: 6 }).map((_, index) => {
    const existingChapter = chapters[index];
    const isLocked = index >= chapterLimit;
    const chapterLabel = `Chapter ${index + 1}`;

    return existingChapter
      ? { ...existingChapter, isLocked, chapterLabel }
      : {
          title: "Premium chapter",
          chapterLabel,
          status: "PREMIUM",
          type: "PREMIUM",
          words: 0,
          moments: 0,
          body: "",
          isLocked: true
        };
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setIsEnteringStudio(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ApiStory[]>("/stories/mine", { accessToken })
      .then((stories) => {
        if (cancelled || stories.length === 0) {
          return;
        }

        const draft = stories.find((story) => story.status === "draft") ?? stories[0];
        setCurrentStoryId(draft.id);
        setStoryTitle(draft.title);
        setStorySummary(draft.summary);
        setVisibility(draft.visibility);
        setAnonymous(draft.anonymous);
        setChapters(
          draft.chapters.map((chapter) => ({
            title: chapter.title,
            type: chapter.type.toUpperCase(),
            words: getChapterWordCount(chapter.body),
            status: draft.status === "published" ? "Published" : "Draft saved",
            moments: chapter.moments.length,
            body: chapter.body
          }))
        );
        setTimelineEntries(
          draft.chapters.flatMap((chapter) =>
            chapter.moments.map((moment) => {
              const momentDate = new Date(moment.happenedAt);
              return {
                year: String(momentDate.getFullYear()),
                month: String(momentDate.getMonth() + 1).padStart(2, "0"),
                day: String(momentDate.getDate()).padStart(2, "0"),
                title: moment.title,
                body: moment.description
              };
            })
          )
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("histora-studio-reviewed") === "true") {
      setHasReviewedPreview(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(studioStorageKey);
      if (!rawDraft) {
        return;
      }

      const savedDraft = JSON.parse(rawDraft) as Partial<{
        activeChapter: string;
        isPremium: boolean;
        visibility: string;
        anonymous: boolean;
        storyTitle: string;
        storySummary: string;
        chapterType: string;
        chapters: typeof chapters;
        timelineEntries: typeof timelineEntries;
        draftHistory: string[];
        transcriptionLanguage: string;
        allowComments: boolean;
      }>;

      if (savedDraft.activeChapter) {
        setActiveChapter(savedDraft.activeChapter);
      }
      if (typeof savedDraft.isPremium === "boolean") {
        setIsPremium(savedDraft.isPremium);
      }
      if (savedDraft.visibility) {
        setVisibility(savedDraft.visibility);
      }
      if (typeof savedDraft.anonymous === "boolean") {
        setAnonymous(savedDraft.anonymous);
      }
      if (savedDraft.storyTitle) {
        setStoryTitle(savedDraft.storyTitle);
      }
      if (savedDraft.storySummary) {
        setStorySummary(savedDraft.storySummary);
      }
      if (savedDraft.chapterType) {
        setChapterType(savedDraft.chapterType);
      }
      if (typeof savedDraft.allowComments === "boolean") {
        setAllowComments(savedDraft.allowComments);
      }
      if (Array.isArray(savedDraft.chapters) && savedDraft.chapters.length > 0) {
        setChapters(savedDraft.chapters);
      }
      if (Array.isArray(savedDraft.timelineEntries)) {
        setTimelineEntries(savedDraft.timelineEntries);
      }
      if (Array.isArray(savedDraft.draftHistory) && savedDraft.draftHistory.length > 0) {
        setDraftHistory(savedDraft.draftHistory);
      }
      if (savedDraft.transcriptionLanguage) {
        setTranscriptionLanguage(savedDraft.transcriptionLanguage);
      }

      setStudioMessage("Local studio draft restored.");
    } catch {
      setStudioMessage("Could not restore the last local studio draft.");
    } finally {
      hasLoadedStudioDraftRef.current = true;
    }
  }, [studioStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedStudioDraftRef.current) {
      return;
    }

    const draftPayload = {
      activeChapter,
      isPremium,
      visibility,
      anonymous,
      storyTitle,
      storySummary,
      chapterType,
      allowComments,
      chapters,
      timelineEntries,
      draftHistory,
      transcriptionLanguage
    };

    window.localStorage.setItem(studioStorageKey, JSON.stringify(draftPayload));
  }, [
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    draftHistory,
    isPremium,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    studioStorageKey
  ]);

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  useEffect(() => {
    voiceNotesRef.current = voiceNotes;
  }, [voiceNotes]);

  useEffect(() => {
    const editor = chapterBodyRef.current;
    if (editor && editor.innerHTML !== chapterBody) {
      editor.innerHTML = chapterBody;
    }
  }, [chapterBody, activeChapter]);

  useEffect(() => {
    return () => {
      imageAttachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
      voiceNotesRef.current.forEach((voice) => URL.revokeObjectURL(voice.url));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      transcriptionRecorderRef.current?.stop();
      transcriptionStreamRef.current?.getTracks().forEach((track) => track.stop());
      transcriptionProcessorRef.current?.disconnect();
      transcriptionSourceNodeRef.current?.disconnect();
      transcriptionSocketRef.current?.close();
      const audioContext = transcriptionAudioContextRef.current;
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
      const noticeAudioContext = noticeAudioContextRef.current;
      if (noticeAudioContext) {
        void noticeAudioContext.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!studioNotice || typeof window === "undefined") {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = noticeAudioContextRef.current ?? new AudioContextConstructor();
    noticeAudioContextRef.current = audioContext;

    void audioContext.resume().then(() => {
      const startAt = audioContext.currentTime;
      const playWarningPulse = (offset: number, frequency: number, duration: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const pulseStart = startAt + offset;

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, pulseStart);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.88, pulseStart + duration);

        gainNode.gain.setValueAtTime(0.0001, pulseStart);
        gainNode.gain.exponentialRampToValueAtTime(0.09, pulseStart + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, pulseStart + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(pulseStart);
        oscillator.stop(pulseStart + duration);

        oscillator.onended = () => {
          oscillator.disconnect();
          gainNode.disconnect();
        };
      };

      playWarningPulse(0, 720, 0.16);
      playWarningPulse(0.2, 620, 0.22);
    }).catch(() => undefined);
  }, [studioNotice]);

  const appendImages = (files: FileList | null, source: string) => {
    if (!files?.length) {
      return;
    }

    setMediaError(null);

    const remainingSlots = imageLimit - imageAttachments.length;

    if (remainingSlots <= 0) {
      setMediaError("Image attachment limit reached. Upgrade to premium for more slots.");
      return;
    }

    const nextImages = Array.from(files)
      .slice(0, remainingSlots)
      .map((file) => ({
        name: file.name || `${source} image`,
        url: URL.createObjectURL(file),
        source
      }));

    setImageAttachments((current) => [...current, ...nextImages]);

    if (files.length > remainingSlots) {
      setMediaError("Some images were skipped because the current plan limit was reached.");
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    appendImages(event.target.files, "Upload");
    event.target.value = "";
  };

  const startVoiceRecording = async () => {
    if (voiceNotes.length >= voiceLimit) {
      setMediaError("Voice note limit reached. Upgrade to premium for more recordings.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      setMediaError(null);
      setVoiceRecordingStatus("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);

        setVoiceNotes((current) => [
          ...current,
          {
            name: `Voice note ${current.length + 1}`,
            url,
            source: "Recorded in studio"
          }
        ]);

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingVoice(false);
        setIsVoiceRecordingPaused(false);
        setVoiceRecordingStatus("Recording stopped. Voice note saved.");
      };

      recorder.start();
      setIsRecordingVoice(true);
      setIsVoiceRecordingPaused(false);
      setVoiceRecordingStatus("Recording active...");
    } catch {
      setMediaError("Microphone permission was denied or unavailable.");
      setVoiceRecordingStatus("Voice recording unavailable");
    }
  };

  const stopVoiceRecording = () => {
    setVoiceRecordingStatus("Stopping recording...");
    mediaRecorderRef.current?.stop();
  };

  const pauseVoiceRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
      return;
    }

    mediaRecorderRef.current.pause();
    setIsVoiceRecordingPaused(true);
    setVoiceRecordingStatus("Recording paused.");
  };

  const resumeVoiceRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "paused") {
      return;
    }

    mediaRecorderRef.current.resume();
    setIsVoiceRecordingPaused(false);
    setVoiceRecordingStatus("Recording active...");
  };

  const removeImageAttachment = (url: string) => {
    setImageAttachments((current) => {
      const target = current.find((attachment) => attachment.url === url);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((attachment) => attachment.url !== url);
    });
  };

  const openImageSlot = () => {
    imageInputRef.current?.click();
  };

  const openVoiceSlot = () => {
    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording();
  };

  const removeVoiceNote = (url: string) => {
    setVoiceNotes((current) => {
      const target = current.find((voice) => voice.url === url);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((voice) => voice.url !== url);
    });
  };

  const updateChapter = (updater: (chapter: StudioChapter) => StudioChapter) => {
    setChapters((current) =>
      current.map((chapter, index) => (index === (activeChapterIndex >= 0 ? activeChapterIndex : 0) ? updater(chapter) : chapter))
    );
  };

  const updateActiveChapterTitle = (nextTitle: string) => {
    const normalizedTitle = normalizeChapterTitle(nextTitle) || "Untitled chapter";
    updateChapter((chapter) => ({
      ...chapter,
      title: normalizedTitle
    }));
    setActiveChapter(normalizedTitle);
    invalidatePreviewReview();
  };

  const submitActiveChapterTitle = () => {
    setIsEditingChapterTitle(false);
  };

  const refreshEditorState = () => {
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    const anchor = selection?.anchorNode?.parentElement ?? null;
    const insideEditor = anchor && chapterBodyRef.current?.contains(anchor);

    setActiveFormats({
      bold: typeof document !== "undefined" ? document.queryCommandState("bold") : false,
      italic: typeof document !== "undefined" ? document.queryCommandState("italic") : false,
      quote: insideEditor ? Boolean(anchor?.closest("blockquote")) : false,
      checklist: insideEditor ? Boolean(anchor?.closest("ul")) : false,
      timeline: insideEditor ? Boolean(anchor?.closest("[data-tool='timeline']")) : false,
      comment: insideEditor ? Boolean(anchor?.closest("[data-tool='comment']")) : false
    });
  };

  useEffect(() => {
    const onSelectionChange = () => refreshEditorState();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const syncEditorContent = () => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = editor.innerHTML;
    const nextText = editor.textContent ?? "";
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
    updateChapter((chapter) => ({
      ...chapter,
      body: nextHtml,
      words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length
    }));
    refreshEditorState();
  };

  const invalidatePreviewReview = () => {
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
  };

  const commitTranscript = (text: string) => {
    const editor = chapterBodyRef.current;
    if (!editor || !text.trim()) {
      return;
    }

    const baseText = editor.textContent?.trim() ?? "";
    editor.appendChild(document.createTextNode(`${baseText.length > 0 ? " " : ""}${text}`));

    syncEditorContent();
  };

  const applyEditorTool = (tool: "bold" | "italic" | "quote" | "checklist" | "timeline" | "comment") => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    editor.focus();

    if (tool === "bold") {
      document.execCommand("bold");
    } else if (tool === "italic") {
      document.execCommand("italic");
    } else if (tool === "quote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else if (tool === "checklist") {
      document.execCommand("insertUnorderedList");
    } else {
      const selectedText = window.getSelection()?.toString() || (tool === "timeline" ? "2024 turning point" : "Comment for collaborators");
      document.execCommand("insertHTML", false, `<span data-tool="${tool}" class="${tool}-chip-inline">${selectedText}</span>&nbsp;`);
    }

    syncEditorContent();
    setStudioMessage(`${tool} applied in ${activeChapterLabel}.`);
    setDraftHistory((current) => [`${tool} tool used on ${activeChapterLabel}.`, ...current].slice(0, 6));
  };

  const transcribeAudioChunk = (audioBlob: Blob) => {
    transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
      if (audioBlob.size === 0) {
        return;
      }

      if (transcriptionRequestInFlightRef.current) {
        transcriptionPendingBlobRef.current = transcriptionPendingBlobRef.current
          ? new Blob([transcriptionPendingBlobRef.current, audioBlob], { type: audioBlob.type || "audio/webm" })
          : audioBlob;
        setTranscriptionStatus("Buffering recent speech...");
        return;
      }

      transcriptionRequestInFlightRef.current = true;
      setTranscriptionStatus("Transcribing recent speech...");

      try {
        const response = await fetch(
          `${apiBaseUrl}/transcriptions?language=${encodeURIComponent(transcriptionLanguage)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": audioBlob.type || "audio/webm",
              Authorization: `Bearer ${accessToken}`,
              "X-Requested-With": "XMLHttpRequest"
            },
            body: audioBlob
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Transcription request failed.");
        }

        const payload = (await response.json()) as { text?: string };
        const transcript = payload.text?.trim();

        if (transcript) {
          commitTranscript(transcript);
          setStudioMessage("Voice transcription updated the chapter body.");
          setTranscriptionStatus(`Captured: ${transcript}`);
        } else {
          setTranscriptionStatus("No clear speech detected in the last audio chunk.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription request failed.";
        if (message.includes("429")) {
          setStudioMessage("Transcription is being rate limited. Slowing audio uploads and buffering speech.");
          setTranscriptionStatus("Transcription busy. Waiting for the next upload window...");
        } else {
          throw error;
        }
      } finally {
        transcriptionRequestInFlightRef.current = false;
        const pendingBlob = transcriptionPendingBlobRef.current;
        transcriptionPendingBlobRef.current = null;

        if (pendingBlob && pendingBlob.size > 0 && isTranscribing) {
          void transcribeAudioChunk(pendingBlob);
        }
      }
    }).catch(() => {
      transcriptionRequestInFlightRef.current = false;
      setIsTranscribing(false);
      setStudioMessage("Server transcription failed. Check API configuration and try again.");
      setTranscriptionStatus("Voice transcription failed");
    });
  };

  const cleanupStreamingTranscription = ({
    nextStatus = "Voice transcription stopped",
    notifyServer = false,
    markManual = true
  }: {
    nextStatus?: string;
    notifyServer?: boolean;
    markManual?: boolean;
  } = {}) => {
    transcriptionManualStopRef.current = markManual;
    const socket = transcriptionSocketRef.current;

    if (socket?.readyState === WebSocket.OPEN && notifyServer) {
      socket.send(JSON.stringify({ type: "Terminate" }));
    }

    transcriptionProcessorRef.current?.disconnect();
    transcriptionProcessorRef.current = null;
    transcriptionSourceNodeRef.current?.disconnect();
    transcriptionSourceNodeRef.current = null;
    transcriptionStreamRef.current?.getTracks().forEach((track) => track.stop());
    transcriptionStreamRef.current = null;
    transcriptionRecorderRef.current = null;
    transcriptionPendingBlobRef.current = null;
    transcriptionRequestInFlightRef.current = false;
    transcriptionCommittedTurnsRef.current.clear();

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      transcriptionSocketRef.current = null;
    }

    if (transcriptionAudioContextRef.current) {
      const audioContext = transcriptionAudioContextRef.current;
      void audioContext.close().catch(() => undefined);
      transcriptionAudioContextRef.current = null;
    }

    setIsTranscribing(false);
    setTranscriptionStatus(nextStatus);
  };

  const stopStreamingTranscription = (nextStatus = "Voice transcription stopped") => {
    cleanupStreamingTranscription({ nextStatus, notifyServer: true, markManual: true });
  };

  const downsampleAudioBuffer = (input: Float32Array, sourceRate: number, targetRate: number) => {
    if (sourceRate === targetRate) {
      return input;
    }

    const sampleRateRatio = sourceRate / targetRate;
    const targetLength = Math.round(input.length / sampleRateRatio);
    const output = new Float32Array(targetLength);
    let outputIndex = 0;
    let inputIndex = 0;

    while (outputIndex < targetLength) {
      const nextInputIndex = Math.round((outputIndex + 1) * sampleRateRatio);
      let sum = 0;
      let count = 0;

      for (let index = inputIndex; index < nextInputIndex && index < input.length; index += 1) {
        sum += input[index] as number;
        count += 1;
      }

      output[outputIndex] = count > 0 ? sum / count : 0;
      outputIndex += 1;
      inputIndex = nextInputIndex;
    }

    return output;
  };

  const encodePcm16 = (input: Float32Array) => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);

    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return buffer;
  };

  const getAssemblyStreamingConfig = (language: string) => {
    if (language === "en-US" || language === "en-GB") {
      return {
        speechModel: "universal-streaming-english",
        languageDetection: false
      };
    }

    if (language === "fr-FR" || language === "es-ES" || language === "de-DE" || language === "pt-BR") {
      return {
        speechModel: "universal-streaming-multilingual",
        languageDetection: true
      };
    }

    if (language === "ar-SA") {
      return {
        speechModel: "whisper-rt",
        languageDetection: true
      };
    }

    return null;
  };

  const getRelaySocketUrl = (language: string) => {
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const relayUrl = new URL(`${protocol}//${apiUrl.host}/ws/transcription`);
    relayUrl.searchParams.set("language", language);
    relayUrl.searchParams.set("token", accessToken);
    return relayUrl;
  };

  const startChunkTranscription = () => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      transcriptionStreamRef.current = stream;
      transcriptionRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        void transcribeAudioChunk(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        transcriptionStreamRef.current = null;
        transcriptionRecorderRef.current = null;
        setIsTranscribing(false);
        setTranscriptionStatus("Voice transcription stopped");
      };

      recorder.start(7000);
      setIsTranscribing(true);
      const selectedLanguageLabel =
        transcriptionLanguages.find((language) => language.value === transcriptionLanguage)?.label ?? transcriptionLanguage;
      setStudioMessage(`Server transcription started in ${selectedLanguageLabel}. Speak to update the chapter body.`);
      setTranscriptionStatus(`Listening in ${selectedLanguageLabel}...`);
    }).catch(() => {
      setStudioMessage("Microphone permission was denied or unavailable.");
      setTranscriptionStatus("Voice transcription unavailable");
    });
  };

  const startRelayTranscription = (
    AudioContextConstructor: typeof AudioContext,
    mode: "mobile" | "desktop" = "mobile"
  ) => {
    setTranscriptionStatus("Preparing live transcription...");
    setStudioMessage(
      mode === "mobile" ? "Starting Histora mobile transcription relay..." : "Starting Histora transcription relay..."
    );
    transcriptionManualStopRef.current = false;
    transcriptionCommittedTurnsRef.current.clear();
    transcriptionFallbackTriggeredRef.current = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        const audioContext = new AudioContextConstructor();
        await audioContext.resume();

        const sourceNode = audioContext.createMediaStreamSource(stream);
        const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        const relaySocket = new WebSocket(getRelaySocketUrl(transcriptionLanguage));
        relaySocket.binaryType = "arraybuffer";

        transcriptionStreamRef.current = stream;
        transcriptionAudioContextRef.current = audioContext;
        transcriptionSourceNodeRef.current = sourceNode;
        transcriptionProcessorRef.current = processorNode;
        transcriptionSocketRef.current = relaySocket;

        processorNode.onaudioprocess = (event) => {
          if (relaySocket.readyState !== WebSocket.OPEN) {
            return;
          }

          const inputData = event.inputBuffer.getChannelData(0);
          const downsampled = downsampleAudioBuffer(inputData, audioContext.sampleRate, 16000);

          if (downsampled.length === 0) {
            return;
          }

          relaySocket.send(encodePcm16(downsampled));
        };

        relaySocket.onopen = () => {
          sourceNode.connect(processorNode);
          processorNode.connect(audioContext.destination);
          setIsTranscribing(true);
          const selectedLanguageLabel =
            transcriptionLanguages.find((language) => language.value === transcriptionLanguage)?.label ?? transcriptionLanguage;
          setStudioMessage(
            `${mode === "mobile" ? "Histora mobile relay" : "Histora relay"} transcription started in ${selectedLanguageLabel}.`
          );
          setTranscriptionStatus(`Listening live in ${selectedLanguageLabel}...`);
        };

        relaySocket.onmessage = (event) => {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            transcript?: string;
            end_of_turn?: boolean;
            turn_order?: number;
            error?: string;
            message?: string;
          };

          if (payload.type === "RelayReady") {
            setTranscriptionStatus("Mobile transcription relay connected");
            return;
          }

          if (payload.type === "Error") {
          cleanupStreamingTranscription({ nextStatus: "Voice transcription connection failed", markManual: false });
          setStudioMessage(payload.error || `The ${mode} transcription relay failed.`);
          return;
        }

          if (payload.type === "Begin") {
            setTranscriptionStatus("Live transcription connected");
            return;
          }

          if (payload.type === "Termination") {
            cleanupStreamingTranscription({ nextStatus: "Voice transcription ended", markManual: false });
            setStudioMessage(payload.message || "The transcription session ended.");
            return;
          }

          if (payload.type !== "Turn") {
            return;
          }

          const transcript = payload.transcript?.trim();

          if (!transcript) {
            return;
          }

          if (payload.end_of_turn && typeof payload.turn_order === "number") {
            if (!transcriptionCommittedTurnsRef.current.has(payload.turn_order)) {
              transcriptionCommittedTurnsRef.current.add(payload.turn_order);
              commitTranscript(transcript);
              setStudioMessage("Voice transcription updated the chapter body.");
            }

            setTranscriptionStatus(`Captured: ${transcript}`);
            return;
          }

          setTranscriptionStatus(`Hearing: ${transcript}`);
        };

        relaySocket.onerror = () => {
          if (transcriptionManualStopRef.current) {
            return;
          }

          cleanupStreamingTranscription({ nextStatus: "Voice transcription connection failed", markManual: false });
          setStudioMessage(`The ${mode} transcription relay connection failed.`);
        };

        relaySocket.onclose = (event) => {
          if (transcriptionManualStopRef.current) {
            transcriptionManualStopRef.current = false;
            setIsTranscribing(false);
            return;
          }

          cleanupStreamingTranscription({ nextStatus: "Voice transcription disconnected", markManual: false });
          setStudioMessage(`The ${mode} transcription relay disconnected (code ${event.code}).`);
        };
      } catch {
        if (typeof MediaRecorder === "undefined") {
          setStudioMessage("Voice transcription could not be started.");
          setTranscriptionStatus("Voice transcription unavailable");
          return;
        }

        setStudioMessage(`The ${mode} relay was unavailable. Falling back to chunk transcription.`);
        startChunkTranscription();
      }
    })();
  };

  const startVoiceTranscription = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStudioMessage("Live transcription recording is not supported in this browser.");
      return;
    }

    if (!supportedTranscriptionLanguageValues.has(transcriptionLanguage)) {
      openStudioNotice(
        "Transcription language unsupported",
        `The selected language is not supported by the current AssemblyAI setup. Supported now: ${supportedTranscriptionLanguages
          .map((language) => language.label)
          .join(", ")}. Igbo is not currently confirmed in AssemblyAI's supported-language docs for this setup.`
      );
      setStudioMessage("Unsupported transcription language selected.");
      setTranscriptionStatus("Voice transcription unavailable");
      return;
    }

    const streamingConfig = getAssemblyStreamingConfig(transcriptionLanguage);
    const streamingSupported = Boolean(streamingConfig);
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.maxTouchPoints > 1 && /Macintosh/i.test(window.navigator.userAgent));
    transcriptionFallbackTriggeredRef.current = false;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (isMobileBrowser) {
      if (!AudioContextConstructor) {
        if (typeof MediaRecorder === "undefined") {
          setStudioMessage("Voice transcription is not supported in this browser.");
          return;
        }

        startChunkTranscription();
        return;
      }

      startRelayTranscription(AudioContextConstructor, "mobile");
      return;
    }

    if (!streamingSupported) {
      if (typeof MediaRecorder === "undefined") {
        setStudioMessage("Voice transcription is not supported in this browser.");
        return;
      }

      startChunkTranscription();
      return;
    }

    if (!AudioContextConstructor) {
      if (typeof MediaRecorder === "undefined") {
        setStudioMessage("Voice transcription is not supported in this browser.");
        return;
      }

      startChunkTranscription();
      return;
    }

    startRelayTranscription(AudioContextConstructor, "desktop");
  };

  const openVoiceTranscriptionPanel = () => {
    setIsTranscriptionPanelVisible(true);
    setTranscriptionStatus("Choose a language, then start voice transcription");
    setStudioMessage("Voice transcription panel opened. Select a language, then start.");
  };

  const stopVoiceTranscription = () => {
    setIsTranscriptionPanelVisible(false);
    if (transcriptionSocketRef.current || transcriptionAudioContextRef.current) {
      stopStreamingTranscription();
      return;
    }

    transcriptionPendingBlobRef.current = null;
    transcriptionRecorderRef.current?.stop();
    setIsTranscribing(false);
    setTranscriptionStatus("Voice transcription stopped");
  };

  const openStudioNotice = (title: string, body: string) => {
    setStudioNotice({ title, body });
  };

  useEffect(() => {
    if (supportedTranscriptionLanguageValues.has(transcriptionLanguage)) {
      return;
    }

    const fallbackLanguage = supportedTranscriptionLanguages[0]?.value ?? "en-US";
    setTranscriptionLanguage(fallbackLanguage);
    setStudioMessage("Unsupported transcription language reset to a supported option.");
    openStudioNotice(
      "Transcription language unsupported",
      `The saved language "${transcriptionLanguage}" is not supported by the current voice transcription setup. Supported languages: ${supportedTranscriptionLanguages
        .map((language) => language.label)
        .join(", ")}.`
    );
  }, [supportedTranscriptionLanguages, transcriptionLanguage]);

  const scrollToSectionTop = (ref: RefObject<HTMLElement | null>) => {
    if (typeof window === "undefined" || !ref.current) {
      return;
    }

    const sectionTop = ref.current.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({
      top: Math.max(sectionTop, 0),
      behavior: "smooth"
    });
  };

  const guideToSection = (ref: RefObject<HTMLElement | null>, message: string) => {
    setStudioMessage(message);
    openStudioNotice("Action needed", message);
    scrollToSectionTop(ref);
  };

  const scrollToCurrentChapterIssue = () => {
    if (currentChapterRequiredItems.length > 0) {
      scrollToSectionTop(chapterEditorSectionRef);
      return;
    }

    if (currentChapterOptionalItems.includes("attach an image") || currentChapterOptionalItems.includes("record a voice note")) {
      scrollToSectionTop(mediaSectionRef);
      return;
    }

    if (currentChapterOptionalItems.includes("add a timeline moment")) {
      scrollToSectionTop(timelineSectionRef);
    }
  };

  const saveCurrentDraft = () => {
    const storyPayload = buildStoryPayload("draft");

    setChapters((current) =>
      current.map((chapter) =>
        chapter.title === activeChapter ? { ...chapter, status: "Draft saved", words: wordCount } : chapter
      )
    );
    void persistStory(storyPayload, "Draft saved to API.");
    if (currentChapterRequiredItems.length > 0 || currentChapterOptionalItems.length > 0) {
      const missingRequiredText = currentChapterRequiredItems.length
        ? `Still required: ${currentChapterRequiredItems.join(", ")}.`
        : "";
      const optionalText = currentChapterOptionalItems.length
        ? ` Optional extras you can still add: ${currentChapterOptionalItems.join(", ")}.`
        : "";
      const noticeBody = `${activeChapterNumberLabel} saved locally. ${missingRequiredText}${optionalText}`.trim();
      setStudioMessage(`${activeChapterNumberLabel} saved with pending work.`);
      openStudioNotice("Chapter saved with pending items", noticeBody);
      scrollToCurrentChapterIssue();
      setDraftHistory((current) => [`${activeChapterNumberLabel} saved with pending items.`, ...current].slice(0, 6));
      return;
    }

    setStudioMessage(`${activeChapterNumberLabel} is saved and ready for preview.`);
    setDraftHistory((current) => [`${activeChapterNumberLabel} saved as draft.`, ...current].slice(0, 6));
  };

  const publishWholeStory = () => {
    if (readyChapters.length === 0) {
      guideToSection(
        chapterEditorSectionRef,
        `Finish at least one chapter before publishing. Chapters need a title and at least ${chapterCompletionThreshold} words.`
      );
      return;
    }

    if (!hasReviewedPreview) {
      openStudioNotice(
        "Review before publish",
        startedIncompleteChapters.length > 0
          ? `After preview review, these chapters will go live: ${readyChapters.map((chapter) => chapter.title).join(", ")}. Unfinished chapters will stay as drafts: ${startedIncompleteChapters.map((chapter) => chapter.title).join(", ")}.`
          : `After preview review, these chapters will go live: ${readyChapters.map((chapter) => chapter.title).join(", ")}.`
      );
      scrollToSectionTop(publishSectionRef);
      handlePreviewToggle();
      return;
    }

    setChapters((current) =>
      current.map((chapter) =>
        readyChapters.some((readyChapter) => readyChapter.title === chapter.title)
          ? { ...chapter, status: "Published", words: getChapterWordCount(chapter.body) }
          : chapter
      )
    );
    void persistStory(buildStoryPayload("published"), "Story published to API.");
    setStudioMessage(
      startedIncompleteChapters.length > 0
        ? `Publishing ${readyChapters.map((chapter) => chapter.title).join(", ")}. Unfinished chapters stay in draft.`
        : `Publishing ${readyChapters.map((chapter) => chapter.title).join(", ")} as ${anonymous ? "anonymous" : visibility}.`
    );
    setDraftHistory((current) => [
      startedIncompleteChapters.length > 0
        ? `Published: ${readyChapters.map((chapter) => chapter.title).join(", ")}. Drafts kept: ${startedIncompleteChapters.map((chapter) => chapter.title).join(", ")}.`
        : `Story published with chapters: ${readyChapters.map((chapter) => chapter.title).join(", ")}.`,
      ...current
    ].slice(0, 6));
  };

  const buildStoryPayload = (status: "draft" | "published") => ({
    title: storyTitle,
    summary: storySummary,
    coverImageUrl: imageAttachments[0]?.url,
    visibility: anonymous ? "public" : visibility,
    anonymous,
    allowedViewerIds: [],
    tags: [],
    status,
    chapters: chapters.map((chapter, index) => ({
      title: chapter.title,
      body: chapter.body,
      type:
        chapter.type.toLowerCase() === "anon"
          ? "anonymous"
          : (chapter.type.toLowerCase() as "memory" | "reflection" | "milestone"),
      order: index + 1,
      imageUrls: imageAttachments.map((attachment) => attachment.url),
      voiceNoteUrl: voiceNotes[0]?.url,
      moments: timelineEntries
        .filter((entry) => entry.title.trim() || entry.body.trim())
        .map((entry) => ({
          title: entry.title,
          description: entry.body,
          happenedAt: new Date(
            `${entry.year || currentYear}-${entry.month || "01"}-${entry.day || "01"}T00:00:00.000Z`
          ).toISOString(),
          imageUrls: [],
          voiceNoteUrl: undefined
        }))
    }))
  });

  const persistStory = async (payload: ReturnType<typeof buildStoryPayload>, successMessage: string) => {
    try {
      const story = currentStoryId
        ? await apiRequest<ApiStory>(`/stories/${currentStoryId}`, {
            method: "PATCH",
            accessToken,
            body: payload
          })
        : await apiRequest<ApiStory>("/stories", {
            method: "POST",
            accessToken,
            body: payload
          });

      setCurrentStoryId(story.id);
      setStudioMessage(successMessage);
      setDraftHistory((current) => [successMessage, ...current].slice(0, 6));
    } catch (error) {
      setStudioMessage(getErrorMessage(error, "Could not save story to API."));
    }
  };

  const updateTimelineEntry = (index: number, field: "title" | "body", value: string) => {
    setTimelineEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry))
    );
    invalidatePreviewReview();
  };

  const addTimelineEntry = () => {
    setTimelineEntries((current) => [
      ...current,
      {
        year: "",
        month: "",
        day: "",
        title: "",
        body: ""
      }
    ]);
    setStudioMessage("New timeline moment added.");
    setDraftHistory((current) => ["Timeline moment added.", ...current].slice(0, 6));
  };

  const removeTimelineEntry = (index: number) => {
    setTimelineEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setStudioMessage("Timeline moment removed.");
    setDraftHistory((current) => ["Timeline moment removed.", ...current].slice(0, 6));
    invalidatePreviewReview();
  };

  const updateTimelineDatePart = (index: number, field: "year" | "month" | "day", value: string) => {
    setTimelineEntries((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        const nextEntry = {
          ...entry,
          [field]: value
        };
        const maxDay = getDaysInMonth(nextEntry.year, nextEntry.month);

        if (nextEntry.day && Number.parseInt(nextEntry.day, 10) > maxDay) {
          nextEntry.day = String(maxDay).padStart(2, "0");
        }

        return nextEntry;
      })
    );
    invalidatePreviewReview();
  };

  const handlePreviewToggle = () => {
    const previewTimeline = timelineEntries.filter(
      (entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0 || entry.year || entry.month || entry.day
    );
    const previewPayload = {
      storyTitle,
      storySummary,
      activeChapterNumberLabel,
      activeChapter: activeChapterLabel,
      chapterType,
      visibility: anonymous ? "anonymous" : visibility,
      chapterBody,
      wordCount,
      imageAttachments,
      voiceNotes,
      timelineEntries: previewTimeline,
      allowComments,
      chapterStatus: activeChapterEntry?.status ?? "Draft",
      chapterChecklist: {
        required: currentChapterRequiredItems,
        optional: currentChapterOptionalItems
      }
    };

    window.sessionStorage.setItem("histora-studio-preview", JSON.stringify(previewPayload));
    window.sessionStorage.setItem("histora-studio-reviewed", "true");
    setHasReviewedPreview(true);
    setStudioMessage(`Preview opened for ${activeChapterLabel}. Review it before publishing.`);
    navigate("/studio/preview");
  };

  const handleChapterSwitch = (chapterTitle: string, isLocked: boolean) => {
    if (isLocked) {
      setStudioMessage("This chapter slot is premium. Subscribe to unlock more than 2 chapters.");
      setDraftHistory((current) => ["Premium chapter slot tapped.", ...current].slice(0, 6));
      return;
    }

    setActiveChapter(chapterTitle);
  };

  const insertStructureBlock = (kind: "opening" | "conflict" | "reflection" | "closing") => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    editor.focus();

    const blocks = {
      opening: "<h3>Opening moment</h3><p>Start with the scene, place, or feeling that opens this chapter.</p>",
      conflict: "<h3>Conflict or shift</h3><p>Describe what changed, broke, or forced the story forward.</p>",
      reflection: "<h3>Reflection</h3><p>Explain what this chapter means now that you can look back on it.</p>",
      closing: "<h3>Closing beat</h3><p>End with the lesson, question, or transition into the next chapter.</p>"
    } as const;

    document.execCommand("insertHTML", false, blocks[kind]);
    syncEditorContent();
    setStudioMessage(`${kind} structure inserted into ${activeChapterLabel}.`);
    setDraftHistory((current) => [`${kind} structure added to ${activeChapterLabel}.`, ...current].slice(0, 6));
  };

  const exitStudioMode = () => {
    saveCurrentDraft();
    setStudioMessage("Draft saved. Exiting studio mode...");
    window.setTimeout(() => navigate("/feed"), 180);
  };

  if (isEnteringStudio) {
    return (
      <main className="page-shell">
        <section className="studio-loader card">
          <span className="loader-orb" />
          <SectionLabel>STUDIO_BOOT</SectionLabel>
          <h1>Entering studio mode</h1>
          <p>Loading chapters, drafts, media tools, contributor access, and publishing controls.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="studio-header card">
        <div>
          <SectionLabel>WRITING_STUDIO</SectionLabel>
          <h1>DRAFT LIKE AN EDITOR. PUBLISH LIKE A PLATFORM.</h1>
          <p>Build chapters, attach images and voice notes, and control how every finished draft gets published.</p>
        </div>
        <div className="hero-actions">
          <button className="ghost-action" onClick={exitStudioMode} type="button">EXIT STUDIO</button>
        </div>
      </section>
      <section className="studio-status-bar card">
        <strong>{studioMessage}</strong>
        <span>{wordCount} words in active chapter</span>
      </section>
      {studioNotice ? (
        <section className="studio-notice card studio-notice-live" role="status">
          <span className="studio-notice-badge" aria-hidden="true">
            <Icon className="button-icon" name="bolt" />
          </span>
          <div className="studio-notice-copy">
            <span className="studio-notice-label">Action needed</span>
            <strong>{studioNotice.title}</strong>
            <p>{studioNotice.body}</p>
          </div>
          <button className="ghost-action" onClick={() => setStudioNotice(null)} type="button">DISMISS</button>
        </section>
      ) : null}

      <section className="studio-layout">
        <div className="studio-main">
          <article className="studio-panel card" ref={chapterEditorSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabel>CHAPTER_SWITCHER</SectionLabel>
                <h2>Slide through your chapters</h2>
              </div>
              <span className="story-tag">{chapterSlots.length} chapters</span>
            </div>
            <div className="chapter-tab-row">
              {chapterSlots.map((chapter) => (
                <button
                  className={
                    chapter.isLocked
                      ? "chapter-pill chapter-pill-locked"
                      : activeChapter === chapter.title
                        ? "chapter-pill active-chapter-pill"
                        : "chapter-pill"
                  }
                  key={chapter.title}
                  onClick={() => handleChapterSwitch(chapter.title, chapter.isLocked)}
                  type="button"
                >
                  <small>{chapter.chapterLabel}</small>
                  <strong>{chapter.title}</strong>
                  <span>{chapter.isLocked ? "PREMIUM" : chapters.find((entry) => entry.title === chapter.title)?.status ?? chapter.status}</span>
                </button>
              ))}
            </div>
            {!isPremium ? <span className="section-meta">Free users can write in the first 2 chapters only.</span> : null}
          </article>

          <article className="studio-panel card" ref={mediaSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabel>STORY_SETUP</SectionLabel>
                <h2>Story identity</h2>
              </div>
              <span className="story-tag">FREE_PLAN // 2500_WORDS</span>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input onChange={(event) => {
                  setStoryTitle(event.target.value);
                  invalidatePreviewReview();
                }} value={storyTitle} />
              </label>
              <label>
                Summary
                <textarea onChange={(event) => {
                  setStorySummary(event.target.value);
                  invalidatePreviewReview();
                }} value={storySummary} />
              </label>
            </div>
          </article>

          <article className="studio-panel card" ref={publishSectionRef}>
            <div className="section-head">
              <div className="chapter-heading-block">
                <SectionLabel>CURRENT_CHAPTER</SectionLabel>
                <span className="current-chapter-kicker">
                  Working on {chapterSlots.find((chapter) => chapter.title === activeChapter)?.chapterLabel ?? "Current chapter"}
                </span>
                <div className="chapter-heading-row">
                  {isEditingChapterTitle ? (
                    <input
                      className="chapter-title-input"
                      onBlur={submitActiveChapterTitle}
                      onChange={(event) => updateActiveChapterTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitActiveChapterTitle();
                        }
                      }}
                      value={activeChapterLabel}
                    />
                  ) : (
                    <h2>{activeChapterLabel}</h2>
                  )}
                  <button
                    aria-label="Edit chapter title"
                    className="chapter-edit-button"
                    onClick={() => setIsEditingChapterTitle(true)}
                    type="button"
                  >
                    <Icon className="button-icon" name="write" />
                  </button>
                </div>
              </div>
              <span className="story-tag">{wordCount}_WORDS</span>
            </div>
            <div className="form-grid">
              <label>
                Chapter type
                <select onChange={(event) => {
                  setChapterType(event.target.value);
                  invalidatePreviewReview();
                }} value={chapterType}>
                  <option value="memory">Memory</option>
                  <option value="reflection">Reflection</option>
                  <option value="milestone">Milestone</option>
                  <option value="anonymous">Anonymous advice</option>
                </select>
              </label>
              <div>
                <span>Body</span>
                <div className="editor-field-shell">
                  <div
                    className="editor-surface"
                    contentEditable
                    onInput={syncEditorContent}
                    ref={chapterBodyRef}
                    suppressContentEditableWarning
                  />
                  {!isTranscriptionPanelVisible ? (
                    <button
                      aria-label="Start voice transcription"
                      className="editor-mic-button"
                      onClick={openVoiceTranscriptionPanel}
                      type="button"
                    >
                      <Icon className="button-icon" name="mic" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {isTranscriptionPanelVisible ? (
              <>
                <div className={isTranscribing ? "transcription-indicator transcription-live" : "transcription-indicator"}>
                  <span className="transcription-dot" />
                  <div className="transcription-signal" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="transcription-copy">
                    <strong>{isTranscribing ? "Voice capture live" : "Voice capture idle"}</strong>
                    <span>{isTranscribing ? "Amplifier blinking means speech is being captured." : "Preparing voice capture."}</span>
                    <small>{transcriptionStatus}</small>
                  </div>
                  <button
                    className={isTranscribing ? "primary-action" : "ghost-action"}
                    onClick={isTranscribing ? stopVoiceTranscription : startVoiceTranscription}
                    type="button"
                  >
                    {isTranscribing ? "STOP TRANSCRIBING" : "START VOICE TO TEXT"}
                  </button>
                </div>
                <div className="transcription-language-row">
                  <label>
                    Transcription language
                    <select
                      onChange={(event) => setTranscriptionLanguage(event.target.value)}
                      value={transcriptionLanguage}
                    >
                      {supportedTranscriptionLanguages.map((language) => (
                        <option key={language.value} value={language.value}>
                          {language.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="transcription-supported-copy">
                    Supported now: {supportedTranscriptionLanguages.map((language) => language.label).join(", ")}
                  </span>
                  <span className="transcription-supported-copy">
                    Not currently confirmed here: Igbo
                  </span>
                </div>
              </>
            ) : null}
            <div className="writing-toolbar">
              <button className={activeFormats.bold ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("bold")} type="button">
                <Icon className="button-icon" name="bold" />
                <span className="toolbar-label">Bold</span>
              </button>
              <button className={activeFormats.italic ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("italic")} type="button">
                <Icon className="button-icon" name="italic" />
                <span className="toolbar-label">Italic</span>
              </button>
              <button className={activeFormats.quote ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("quote")} type="button">
                <Icon className="button-icon" name="quote" />
                <span className="toolbar-label">Quote</span>
              </button>
              <button className={activeFormats.checklist ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("checklist")} type="button">
                <Icon className="button-icon" name="checklist" />
                <span className="toolbar-label">Checklist</span>
              </button>
              <button className={activeFormats.timeline ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("timeline")} type="button">
                <Icon className="button-icon" name="timeline" />
                <span className="toolbar-label">Timeline tag</span>
              </button>
              <button className={activeFormats.comment ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("comment")} type="button">
                <Icon className="button-icon" name="note" />
                <span className="toolbar-label">Comment note</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("opening")} type="button">
                <Icon className="button-icon" name="write" />
                <span className="toolbar-label">Add opening</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("conflict")} type="button">
                <Icon className="button-icon" name="bolt" />
                <span className="toolbar-label">Add conflict</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("reflection")} type="button">
                <Icon className="button-icon" name="bookmark" />
                <span className="toolbar-label">Add reflection</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("closing")} type="button">
                <Icon className="button-icon" name="arrow" />
                <span className="toolbar-label">Add closing</span>
              </button>
            </div>
            <div className="chapter-controls">
              <button className="ghost-action" onClick={handlePreviewToggle} type="button">PREVIEW CHAPTER</button>
              <button className="ghost-action" onClick={() => setIsDraftHistoryVisible((current) => !current)} type="button">
                {isDraftHistoryVisible ? "HIDE DRAFT HISTORY" : "VIEW DRAFT HISTORY"}
              </button>
              <button className="primary-action" onClick={saveCurrentDraft} type="button">SAVE CHAPTER</button>
            </div>
            {isDraftHistoryVisible ? (
              <div className="draft-history-panel">
                {draftHistory.map((entry) => (
                  <div className="draft-history-row" key={entry}>
                    <strong>{entry}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="studio-panel card">
            <div className="section-head">
              <div>
                <SectionLabel>MEDIA_ATTACHMENTS</SectionLabel>
                <h2>Tap a slot to attach images and voice notes</h2>
              </div>
              <span className="story-tag">{isPremium ? "PREMIUM_ACTIVE" : "FREE_LIMITS_ACTIVE"}</span>
            </div>
            <div className={isRecordingVoice ? "recording-indicator recording-live" : "recording-indicator"}>
              <span className="recording-dot" />
              <strong>{isRecordingVoice ? (isVoiceRecordingPaused ? "Recording paused" : "Recording live") : "Recorder idle"}</strong>
              <span>{voiceRecordingStatus}</span>
            </div>
            <input
              accept="image/*"
              className="hidden-media-input"
              multiple={isPremium}
              onChange={handleImageUpload}
              ref={imageInputRef}
              type="file"
            />
            <div className="media-action-row">
              <button className="ghost-action" onClick={() => setIsPremium((current) => !current)} type="button">
                {isPremium ? "SWITCH TO FREE VIEW" : "SIMULATE PREMIUM"}
              </button>
            </div>
            {mediaError ? <div className="media-error-banner">{mediaError}</div> : null}
            <div className="media-grid">
              {imageAttachments.map((attachment) => (
                <article className="media-card" key={attachment.url}>
                  <button
                    aria-label={`Remove ${attachment.name}`}
                    className="media-remove-button"
                    onClick={() => removeImageAttachment(attachment.url)}
                    type="button"
                  >
                    <Icon className="button-icon" name="close" />
                  </button>
                  <div className="media-preview-frame">
                    <img alt={attachment.name} className="media-preview-image" src={attachment.url} />
                  </div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.source}</span>
                  <div className="media-card-footer">
                    <small>Tap a free slot to replace or add more.</small>
                  </div>
                </article>
              ))}
              {Array.from({ length: Math.max(imageLimit - imageAttachments.length, 0) }).map((_, index) => (
                <button className="media-card media-card-empty media-slot-button" key={`image-slot-${index}`} onClick={openImageSlot} type="button">
                  <div className="media-slot-placeholder" aria-hidden="true">
                    <Icon className="button-icon" name="bookmark" />
                  </div>
                  <strong>Image slot {imageAttachments.length + index + 1}</strong>
                  <span>Tap to attach an image</span>
                  <small>{isPremium ? "Available slot" : "Free plan image slot"}</small>
                </button>
              ))}
              {voiceNotes.map((voice) => (
                <article className="media-card" key={voice.url}>
                  <button
                    aria-label={`Remove ${voice.name}`}
                    className="media-remove-button"
                    onClick={() => removeVoiceNote(voice.url)}
                    type="button"
                  >
                    <Icon className="button-icon" name="close" />
                  </button>
                  <strong>{voice.name}</strong>
                  <span>{voice.source}</span>
                  <audio className="voice-player" controls src={voice.url} />
                  <div className="media-card-footer">
                    <small>Tap an open speaker slot to add another note.</small>
                  </div>
                </article>
              ))}
              {Array.from({ length: Math.max(voiceLimit - voiceNotes.length, 0) }).map((_, index) => (
                <button className="media-card media-card-empty media-slot-button" key={`voice-slot-${index}`} onClick={openVoiceSlot} type="button">
                  <div className="media-slot-placeholder media-slot-placeholder-voice" aria-hidden="true">
                    <Icon className="button-icon" name="mic" />
                  </div>
                  <strong>Voice slot {voiceNotes.length + index + 1}</strong>
                  <span>{isRecordingVoice ? "Use pause or stop above" : "Tap microphone slot to record"}</span>
                  <small>{isPremium ? "Available voice slot" : "Free plan voice slot"}</small>
                </button>
              ))}
            </div>
            {isRecordingVoice ? (
              <div className="voice-recording-alert">
                <div className="voice-recording-alert-copy">
                  <strong>{isVoiceRecordingPaused ? "Voice note paused" : "Voice note recording"}</strong>
                  <span>{voiceRecordingStatus}</span>
                </div>
                <div className="voice-recording-alert-actions">
                  <button className="ghost-action" onClick={isVoiceRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording} type="button">
                    <Icon className="button-icon" name="pause" />
                    {isVoiceRecordingPaused ? "RESUME" : "PAUSE"}
                  </button>
                  <button className="primary-action" onClick={stopVoiceRecording} type="button">
                    <Icon className="button-icon" name="close" />
                    STOP
                  </button>
                </div>
              </div>
            ) : null}
            {!isPremium ? (
              <div className="premium-limit-banner">
                <strong>Free users can add 2 images and 1 voice note.</strong>
                <span>Upgrade to premium for multiple image attachments and expanded voice entries.</span>
              </div>
            ) : null}
          </article>

        </div>

        <aside className="right-rail">
          <article className="rail-panel card">
            <SectionLabel>PRIVACY_CONTROL</SectionLabel>
            <div className="choice-stack">
              {["private", "selected", "public"].map((option) => (
                <button
                  key={option}
                  className={visibility === option ? "choice-button active-choice" : "choice-button"}
                  onClick={() => setVisibility(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="toggle-row">
              <input checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} type="checkbox" />
              <span>Post this chapter anonymously for advice</span>
            </label>
            <label className="toggle-row">
              <input checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} type="checkbox" />
              <span>Allow comments on published chapters</span>
            </label>
          </article>
          <article className="rail-panel card">
            <SectionLabel>PUBLISH_CONTROL</SectionLabel>
            <div className="publish-stack">
              <div className="publish-row">
                <strong>Current mode</strong>
                <span>{anonymous ? "Anonymous advice" : visibility}</span>
              </div>
              <div className="publish-row">
                <strong>Active chapter</strong>
                <span>{activeChapterReady?.isComplete ? "Ready to publish" : `Needs ${chapterCompletionThreshold} words`}</span>
              </div>
              <div className="publish-row">
                <strong>Story readiness</strong>
                <span>{readyChapters.length > 0 ? "Ready chapters can go live" : "No finished chapters yet"}</span>
              </div>
            </div>
            <div className="publish-summary-block">
              <strong>Chapters going live</strong>
              {readyChapters.length ? (
                <div className="publish-chip-list">
                  {readyChapters.map((chapter) => (
                    <span className="publish-chip" key={chapter.title}>{chapter.title}</span>
                  ))}
                </div>
              ) : (
                <p>No finished chapters yet.</p>
              )}
            </div>
            {startedIncompleteChapters.length ? (
              <div className="publish-summary-block publish-warning-block">
                <strong>Stays in draft for now</strong>
                <div className="publish-chip-list">
                  {startedIncompleteChapters.map((chapter) => (
                    <span className="publish-chip publish-chip-warning" key={chapter.title}>{chapter.title}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="chapter-controls">
              <button className="ghost-action" onClick={saveCurrentDraft} type="button">SAVE AS DRAFT</button>
              <button className="primary-action" onClick={publishWholeStory} type="button">PUBLISH STORY</button>
            </div>
          </article>
        </aside>
      </section>

      <section className="timeline-stage">
        <article className="studio-panel card timeline-panel-full" ref={timelineSectionRef}>
          <div className="section-head">
            <div>
              <SectionLabel>TIMELINE_MOMENTS</SectionLabel>
              <h2>Anchor the chapter to real time</h2>
            </div>
            <button className="ghost-action" onClick={addTimelineEntry} type="button">ADD MOMENT</button>
          </div>
          <div className="timeline-list">
            {timelineEntries.map((moment, index) => (
              <div key={`${moment.year}-${moment.month}-${moment.day}-${index}`} className="timeline-row timeline-editor-row">
                <label>
                  Date
                  <div className="timeline-date-grid">
                    <label className="timeline-date-field">
                      <span>Month</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.month ? " is-filled" : ""}`}>
                          {getTimelineMonthLabel(moment.month)}
                        </span>
                        <select
                          aria-label="Timeline month"
                          onChange={(event) => updateTimelineDatePart(index, "month", event.target.value)}
                          value={moment.month}
                        >
                          <option value="">Month</option>
                          {monthLabels.map((label, monthIndex) => (
                            <option key={label} value={String(monthIndex + 1).padStart(2, "0")}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="timeline-date-field">
                      <span>Day</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.day ? " is-filled" : ""}`}>
                          {moment.day ? String(Number.parseInt(moment.day, 10)) : "Day"}
                        </span>
                        <select
                          aria-label="Timeline day"
                          onChange={(event) => updateTimelineDatePart(index, "day", event.target.value)}
                          value={moment.day}
                        >
                          <option value="">Day</option>
                          {Array.from({ length: getDaysInMonth(moment.year, moment.month) }, (_, dayIndex) => (
                            <option key={dayIndex + 1} value={String(dayIndex + 1).padStart(2, "0")}>
                              {dayIndex + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="timeline-date-field">
                      <span>Year</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.year ? " is-filled" : ""}`}>
                          {moment.year || "Year"}
                        </span>
                        <select
                          aria-label="Timeline year"
                          onChange={(event) => updateTimelineDatePart(index, "year", event.target.value)}
                          value={moment.year}
                        >
                          <option value="">Year</option>
                          {timelineYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>
                </label>
                <div className="timeline-editor-copy">
                  <label>
                    Title
                    <input
                      onChange={(event) => updateTimelineEntry(index, "title", event.target.value)}
                      placeholder="What happened?"
                      value={moment.title}
                    />
                  </label>
                  <label>
                    What happened
                    <textarea
                      onChange={(event) => updateTimelineEntry(index, "body", event.target.value)}
                      placeholder="Write what happened at this point in your story."
                      value={moment.body}
                    />
                  </label>
                  <div className="timeline-editor-actions">
                    <button className="composer-chip" onClick={() => removeTimelineEntry(index)} type="button">Remove moment</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function StudioPreviewPage() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<null | {
    storyTitle: string;
    storySummary: string;
    activeChapterNumberLabel: string;
    activeChapter: string;
    chapterType: string;
    visibility: string;
    chapterBody: string;
    wordCount: number;
    imageAttachments: Array<{ name: string; url: string; source: string }>;
    voiceNotes: Array<{ name: string; url: string; source: string }>;
    timelineEntries: Array<{ year: string; month: string; day: string; title: string; body: string }>;
    allowComments: boolean;
    chapterStatus: string;
    chapterChecklist: {
      required: string[];
      optional: string[];
    };
  }>(null);

  useEffect(() => {
    const rawPreview = window.sessionStorage.getItem("histora-studio-preview");
    if (!rawPreview) {
      return;
    }

    try {
      setPreview(JSON.parse(rawPreview));
    } catch {
      setPreview(null);
    }
  }, []);

  return (
    <main className="studio-preview-page">
      <section className="studio-preview-topbar">
        <button className="ghost-action" onClick={() => navigate("/studio")} type="button">Back To Edit</button>
        <button className="primary-action" onClick={() => navigate("/studio")} type="button">Looks Good</button>
      </section>

      <article className="studio-preview-reader card">
        <span className="story-tag">{preview?.visibility ?? "draft"}</span>
        <h1>{preview?.storyTitle ?? "Preview unavailable"}</h1>
        <p className="preview-summary">{preview?.storySummary ?? "Open preview from the studio to see the reader view."}</p>

        {preview?.imageAttachments?.length ? (
          <div className="preview-gallery">
            {preview.imageAttachments.map((attachment) => (
              <div className="preview-gallery-frame" key={attachment.url}>
                <img alt={attachment.name} className="media-preview-image" src={attachment.url} />
              </div>
            ))}
          </div>
        ) : null}

        <div className="preview-meta-strip">
          <span>{preview?.activeChapterNumberLabel ?? "No chapter selected"}</span>
          <span>{preview?.activeChapter ?? "Untitled chapter"}</span>
          <span>{preview?.chapterStatus ?? "Draft"}</span>
          <span>{preview?.chapterType ?? "story"}</span>
          <span>{preview?.wordCount ?? 0} words</span>
          <span>{preview?.allowComments ? "Comments on" : "Comments off"}</span>
        </div>

        {preview?.chapterChecklist?.required?.length || preview?.chapterChecklist?.optional?.length ? (
          <section className="preview-chapter-block">
            <h2>Current chapter progress</h2>
            {preview.chapterChecklist.required.length ? (
              <div className="preview-checklist-group">
                <strong>Still needed</strong>
                <ul className="preview-checklist-list">
                  {preview.chapterChecklist.required.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="preview-checklist-group">
                <strong>Required items complete</strong>
              </div>
            )}
            {preview.chapterChecklist.optional.length ? (
              <div className="preview-checklist-group">
                <strong>Optional enrichments</strong>
                <ul className="preview-checklist-list">
                  {preview.chapterChecklist.optional.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {preview?.voiceNotes?.length ? (
          <section className="preview-chapter-block">
            <h2>Voice notes</h2>
            <div className="preview-voice-list">
              {preview.voiceNotes.map((voice) => (
                <article className="preview-voice-card" key={voice.url}>
                  <strong>{voice.name}</strong>
                  <span>{voice.source}</span>
                  <audio className="voice-player" controls src={voice.url} />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {preview?.timelineEntries?.length ? (
          <section className="preview-chapter-block">
            <h2>Timeline moments</h2>
            <div className="preview-timeline-list">
              {preview.timelineEntries.map((entry, index) => (
                <article className="preview-timeline-row" key={`${entry.year}-${entry.month}-${entry.day}-${index}`}>
                  <strong>
                    {[entry.month, entry.day, entry.year].filter(Boolean).join(" / ") || "Undated moment"}
                  </strong>
                  <h3>{entry.title || "Untitled moment"}</h3>
                  <p>{entry.body || "No timeline notes added yet."}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="preview-chapter-block">
          <div className="preview-chapter-heading">
            <h2>{preview?.activeChapter ?? "Story preview"}</h2>
            <span className="story-tag">{preview?.wordCount ?? 0} words</span>
          </div>
          <div
            className="preview-rich-text"
            dangerouslySetInnerHTML={{
              __html: preview?.chapterBody ?? "<p>Open a preview from the studio to render the story reader view.</p>"
            }}
          />
        </section>
      </article>
    </main>
  );
}

function PricingPage() {
  return (
    <main className="page-shell">
      <section className="pricing-hero">
        <article className="pricing-panel card">
          <SectionLabel>SUBSCRIPTION_PLAN</SectionLabel>
          <h1>CHOOSE YOUR ARCHIVE CONTROL</h1>
          <p>Select the writing depth and media capacity you need to manage your personal history.</p>
          <div className="plan-stack">
            {pricingPlans.map((plan, index) => (
              <article className={index === 1 ? "plan-card plan-card-featured" : "plan-card"} key={plan.name}>
                <span className="story-tag">{plan.name.toUpperCase()}</span>
                <h2>{plan.price}</h2>
                <p>{plan.description}</p>
                <ul className="plan-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Icon className="inline-icon" name="check" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button className={index === 1 ? "primary-action block-action" : "ghost-action block-action"} type="button">
                  {index === 1 ? "UPGRADE NOW" : "CURRENT REALITY"}
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="pricing-panel card">
          <SectionLabel>SUBSCRIPTION_MANAGEMENT</SectionLabel>
          <h2>PRO PLAN</h2>
          <div className="management-metrics">
            <div className="metric-box">
              <strong>$12.00 / MONTH</strong>
              <span>ACTIVE</span>
            </div>
            <div className="metric-box">
              <strong>CHAPTERS: 14 / inf</strong>
              <span>ARCHIVE_VOLUME</span>
            </div>
            <div className="metric-box">
              <strong>STORAGE: 2.4GB / inf</strong>
              <span>DATA_CAPACITY</span>
            </div>
          </div>
          <button className="primary-action block-action" type="button">
            CHANGE_PLAN
            <Icon className="button-icon" name="arrow" />
          </button>
          <button className="ghost-action block-action" type="button">
            CANCEL_SUBSCRIPTION
          </button>
        </article>
      </section>
    </main>
  );
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const session = await apiRequest<AuthSession>("/auth/refresh", { method: "POST" });
        if (!cancelled) {
          setAuthSession(session);
        }
      } catch {
        if (!cancelled) {
          setAuthSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsAuthReady(true);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = (session: AuthSession) => {
    setAuthSession(session);
  };

  const isLoggedIn = Boolean(authSession?.accessToken && authSession.user);

  if (!isAuthReady) {
    return (
      <AppShell isLoggedIn={false}>
        <main className="feed-reader-shell">
          <article className="story-reader-stage card">
            <SectionLabel>AUTH_LOADING</SectionLabel>
            <h1>Restoring your session...</h1>
          </article>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell isLoggedIn={isLoggedIn}>
      <Routes>
        <Route
          element={isLoggedIn && authSession ? <FeedPage accessToken={authSession.accessToken} /> : <OnboardingPage />}
          path="/"
        />
        <Route
          element={authSession ? <FeedPage accessToken={authSession.accessToken} /> : <OnboardingPage />}
          path="/feed"
        />
        <Route
          element={authSession ? <FeedStoryPage accessToken={authSession.accessToken} /> : <RequireCurrentLocationSignInRedirect />}
          path="/feed/story/:storySlug"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? <AnonymousHubPage accessToken={authSession.accessToken} currentUser={authSession.user} />
              : <RequireSignInRedirect redirectTo="/anonymous" />
          }
          path="/anonymous"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? <AnonymousInboxComposePage accessToken={authSession.accessToken} />
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/anonymous/write/:recipientSlug"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? <AnonymousStoryPage accessToken={authSession.accessToken} />
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/anonymous/:shareSlug"
        />
        <Route
          element={authSession ? <ProfilePage accessToken={authSession.accessToken} /> : <RequireCurrentLocationSignInRedirect />}
          path="/profile"
        />
        <Route
          element={authSession ? <EditProfilePage accessToken={authSession.accessToken} /> : <RequireCurrentLocationSignInRedirect />}
          path="/profile/edit"
        />
        <Route element={<StudioPreviewPage />} path="/studio/preview" />
        <Route
          element={
            authSession
              ? <StudioPage accessToken={authSession.accessToken} currentUser={authSession.user as ProfileDashboard["user"]} />
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/studio"
        />
        <Route element={<PricingPage />} path="/pricing" />
        <Route element={<AuthPage mode="signin" onAuthenticated={handleAuthenticated} />} path="/signin" />
        <Route element={<Navigate replace to="/signin" />} path="/login" />
        <Route element={<AuthPage mode="signup" onAuthenticated={handleAuthenticated} />} path="/signup" />
        <Route element={<AuthPage mode="forgot" onAuthenticated={handleAuthenticated} />} path="/forgot-password" />
        <Route element={<AuthPage mode="reset" onAuthenticated={handleAuthenticated} />} path="/reset-password" />
      </Routes>
    </AppShell>
  );
}
