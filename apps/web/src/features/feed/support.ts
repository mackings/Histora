import type { ApiAnonymousMessage, ApiStatus, ApiStory } from "../../lib/api-client";

export type StatusEntry = {
  id: string;
  name: string;
  authorKey?: string;
  verified?: boolean;
  meta: string;
  tone: "orange" | "ink" | "add" | "blue";
  label: string;
  contentTitle: string;
  contentBody: string;
  anonymous?: boolean;
  shareSlug?: string;
  imageUrl?: string | null;
  owned?: boolean;
  comments?: Array<{ author: string; text: string }>;
  helpFee?: number;
};

export type StoredAnonymousStatus = {
  id: string;
  title: string;
  body: string;
  meta: string;
  shareSlug: string;
  imageUrl?: string | null;
  comments: Array<{ author: string; text: string }>;
  helpFee: number;
  distribution: "app" | "external";
  source: "posted" | "received";
  kind?: "message" | "status" | "story";
  helperContact?: {
    name: string;
    phone: string;
  } | null;
};

export type AnonymousFeedSource = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  imageUrl?: string | null;
  meta: string;
  comments: Array<{ author: string; text: string }>;
  helpFee: number;
  fromQuickMemory: boolean;
  sourceType: "status" | "story" | "message";
  targetType: "status" | "storyChapter" | "anonymousMessage";
  owned?: boolean;
};

export const anonymousStatusStorageKey = "histora-anonymous-feed-v1";
export const anonymousStatusUpdateEvent = "histora-anonymous-status-updated";
export const statusUpdateEvent = "histora-status-updated";

export const formatAnonymousMeta = (createdAt: string) => {
  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return createdAt;
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - createdTime);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return diffMinutes < 5 ? "Few mins ago" : `${diffMinutes} mins ago`;
  }

  const createdDate = new Date(createdTime);
  const nowDate = new Date(now);
  const isSameDay =
    createdDate.getFullYear() === nowDate.getFullYear() &&
    createdDate.getMonth() === nowDate.getMonth() &&
    createdDate.getDate() === nowDate.getDate();

  if (isSameDay) {
    return diffHours < 6 ? (diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`) : "Today";
  }

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return createdDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
};

export const toStoredAnonymousStatus = (
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
  kind: "message",
  helperContact: message.helperContact ?? null
});

export const toStoredAnonymousStatusEntry = (status: ApiStatus): StoredAnonymousStatus => ({
  id: status.id,
  title: status.body.slice(0, 72),
  body: status.body,
  meta: formatAnonymousMeta(status.createdAt),
  shareSlug: status.shareSlug ?? status.id,
  imageUrl: status.imageUrl ?? null,
  comments: [],
  helpFee: 8,
  distribution: "app",
  source: "posted",
  kind: "status",
  helperContact: null
});

export const toStoredAnonymousStoryEntry = (story: ApiStory): StoredAnonymousStatus => ({
  id: story.id,
  title: story.title,
  body: story.summary,
  meta: `${story.chapters.length} chapter${story.chapters.length === 1 ? "" : "s"} // ${formatAnonymousMeta(story.updatedAt)}`,
  shareSlug: story.slug,
  imageUrl: story.coverImageUrl ?? null,
  comments: [],
  helpFee: 8,
  distribution: "app",
  source: "posted",
  kind: "story",
  helperContact: null
});

export const toAnonymousPublicFeedSource = (message: {
  id: string;
  shareSlug: string;
  body: string;
  commentsCount?: number;
  createdAt: string;
}): AnonymousFeedSource => ({
  id: message.id,
  slug: message.shareSlug,
  title: "Anonymous message",
  excerpt: message.body,
  imageUrl: null,
  meta: formatAnonymousMeta(message.createdAt),
  comments: [],
  helpFee: 8,
  fromQuickMemory: false,
  sourceType: "message",
  targetType: "anonymousMessage"
});

export const bumpStorySaveCount = (value: string, delta: number) =>
  String(Math.max(0, Number.parseInt(value, 10) + delta || 0));

export const readStoredAnonymousStatuses = (): StoredAnonymousStatus[] => {
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

    return parsedStatuses
      .filter(
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
      )
      .map((entry) => ({
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

export const writeStoredAnonymousStatuses = (entries: StoredAnonymousStatus[]) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(anonymousStatusStorageKey, JSON.stringify(entries));
  window.dispatchEvent(new CustomEvent(anonymousStatusUpdateEvent));
};

export const storedAnonymousStatusToEntry = (entry: StoredAnonymousStatus): StatusEntry => ({
  id: entry.id,
  name: "Anonymous",
  meta: entry.meta,
  tone: "ink",
  label: "Advice status",
  contentTitle: entry.title,
  contentBody: entry.body,
  anonymous: true,
  shareSlug: entry.shareSlug,
  imageUrl: entry.imageUrl ?? null,
  comments: entry.comments,
  helpFee: entry.helpFee
});

export const addStatusEntry: StatusEntry = {
  id: "add-status",
  name: "Add",
  meta: "New",
  tone: "add",
  label: "Create status",
  contentTitle: "",
  contentBody: ""
};

export const toStatusEntry = (status: ApiStatus, options?: { owned?: boolean }): StatusEntry => ({
  id: status.id,
  name: status.anonymous ? "Anonymous" : `@${status.authorUsername}`,
  authorKey: status.anonymous ? undefined : status.authorUsername,
  verified: status.anonymous ? false : Boolean(status.authorVerified),
  meta: formatAnonymousMeta(status.createdAt),
  tone: status.anonymous ? "ink" : "blue",
  label: status.anonymous ? "Advice status" : "Memory status",
  contentTitle: status.anonymous ? "Anonymous advice status" : "Memory status",
  contentBody: status.body,
  anonymous: status.anonymous,
  shareSlug: status.shareSlug ?? undefined,
  imageUrl: status.imageUrl ?? null,
  owned: options?.owned ?? false,
  comments: [],
  helpFee: status.anonymous ? 8 : undefined
});

export const upsertStatusEntry = (entries: StatusEntry[], entry: StatusEntry) => {
  const existingEntry = entries.find((current) => current.id === entry.id);
  const nextEntry: StatusEntry = {
    ...existingEntry,
    ...entry,
    owned: entry.owned ?? existingEntry?.owned ?? false,
    comments: entry.comments ?? existingEntry?.comments ?? []
  };
  const rest = entries.filter((current) => current.id !== entry.id);
  return [nextEntry, ...rest];
};

export const removeStatusEntry = (entries: StatusEntry[], statusId: string) => {
  return entries.filter((current) => current.id !== statusId);
};

export type StatusBubbleGroup = {
  key: string;
  primaryEntry: StatusEntry;
  count: number;
  statusIds: string[];
};

export const groupStatusEntries = (entries: StatusEntry[]): StatusBubbleGroup[] => {
  const groups: StatusBubbleGroup[] = [];
  const grouped = new Map<string, StatusBubbleGroup>();

  for (const entry of entries) {
    if (entry.tone === "add") {
      groups.push({
        key: entry.id,
        primaryEntry: entry,
        count: 0,
        statusIds: [entry.id]
      });
      continue;
    }

    const groupKey = entry.anonymous ? `status:${entry.id}` : `user:${entry.authorKey ?? entry.name}`;
    const existingGroup = grouped.get(groupKey);

    if (existingGroup) {
      existingGroup.count += 1;
      existingGroup.statusIds.push(entry.id);
      continue;
    }

    const nextGroup: StatusBubbleGroup = {
      key: groupKey,
      primaryEntry: entry,
      count: 1,
      statusIds: [entry.id]
    };
    grouped.set(groupKey, nextGroup);
    groups.push(nextGroup);
  }

  return groups;
};

export const roundRect = (
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

export const wrapCanvasText = (
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
