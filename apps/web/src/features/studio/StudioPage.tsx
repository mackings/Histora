import { Fragment, useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { type ApiStory, type ProfileDashboard, type SignedReadResponse, apiRequest, createAppEventsConnection, uploadMediaAsset } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { sanitizeStudioRichText } from "../../lib/safe-content";
import type { FeedIconComponent, FeedSectionLabelComponent } from "../feed/ui-types";
import {
  createEmptyTimelineEntry,
  createInitialStudioChapter,
  type StudioChapter,
  type StudioExternalLink,
  type StudioMediaAttachment,
  type StudioPreviewPayload,
  type StudioPublishPayload,
  type StudioTimelineEntry
} from "./types";

const isBlobUrl = (value: string) => value.startsWith("blob:");
const isOwnedStorageObjectKey = (value: string) => /^users\/[^/]+\/.+/.test(value);
const extractStudioOwnedObjectKey = (value?: string | null) => {
  if (!value) {
    return null;
  }

  if (isOwnedStorageObjectKey(value)) {
    return value;
  }

  try {
    const normalizedPath = new URL(value).pathname.replace(/^\/+/, "");
    const usersPathIndex = normalizedPath.indexOf("users/");
    if (usersPathIndex >= 0) {
      const candidate = normalizedPath.slice(usersPathIndex);
      return isOwnedStorageObjectKey(candidate) ? candidate : null;
    }
  } catch {
    return null;
  }

  return null;
};
const createEmptyStoryLink = (): StudioExternalLink => ({
  label: "",
  url: "",
  kind: "website"
});

const getStudioAttachmentStorageUrl = (attachment: { url: string; objectKey?: string }) =>
  attachment.objectKey || extractStudioOwnedObjectKey(attachment.url) || (attachment.url && !isBlobUrl(attachment.url) ? attachment.url : "");

const normalizeStudioMediaReference = (value?: string | null) =>
  extractStudioOwnedObjectKey(value) ?? value ?? undefined;

const toComparableStoryPayload = (
  payload: StudioPublishPayload["payload"]
): Omit<StudioPublishPayload["payload"], "expectedRevision"> => ({
  title: payload.title,
  summary: payload.summary,
  coverImageUrl: normalizeStudioMediaReference(payload.coverImageUrl),
  visibility: payload.visibility,
  anonymous: payload.anonymous,
  allowedViewerIds: [...payload.allowedViewerIds].map(String).sort(),
  tags: [...payload.tags],
  links: payload.links.map((link) => ({
    label: link.label,
    url: link.url,
    kind: link.kind
  })),
  status: payload.status,
  chapters: payload.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    body: sanitizeStudioRichText(chapter.body),
    type: chapter.type,
    order: chapter.order,
    imageUrls: chapter.imageUrls.map((imageUrl) => normalizeStudioMediaReference(imageUrl) ?? imageUrl).filter(Boolean),
    voiceNoteUrl: normalizeStudioMediaReference(chapter.voiceNoteUrl),
    moments: chapter.moments.map((moment) => ({
      id: moment.id,
      title: moment.title,
      description: moment.description,
      happenedAt: new Date(moment.happenedAt).toISOString(),
      imageUrls: moment.imageUrls.map((imageUrl) => normalizeStudioMediaReference(imageUrl) ?? imageUrl).filter(Boolean),
      voiceNoteUrl: normalizeStudioMediaReference(moment.voiceNoteUrl)
    }))
  }))
});

const serializeComparableStoryPayload = (payload: Omit<StudioPublishPayload["payload"], "expectedRevision">) =>
  JSON.stringify(payload);

const buildComparableApiStoryPayload = (
  story: ApiStory
): Omit<StudioPublishPayload["payload"], "expectedRevision"> => ({
  title: story.title,
  summary: story.summary,
  coverImageUrl: normalizeStudioMediaReference(story.coverImageKey ?? story.coverImageUrl ?? undefined),
  visibility: story.visibility,
  anonymous: story.anonymous,
  allowedViewerIds: [],
  tags: [...story.tags],
  links: (story.links ?? []).map((link) => ({
    label: link.label,
    url: link.url,
    kind: link.kind
  })),
  status: story.status,
  chapters: story.chapters.map((chapter, index) => ({
    id: chapter.id,
    title: chapter.title,
    body: sanitizeStudioRichText(chapter.body),
    type: chapter.type,
    order: chapter.order ?? index + 1,
    imageUrls: (chapter.imageKeys ?? chapter.imageUrls ?? [])
      .map((imageUrl) => normalizeStudioMediaReference(imageUrl) ?? imageUrl)
      .filter(Boolean),
    voiceNoteUrl: normalizeStudioMediaReference(chapter.voiceNoteKey ?? chapter.voiceNoteUrl ?? undefined),
    moments: (chapter.moments ?? []).map((moment) => ({
      id: moment.id,
      title: moment.title,
      description: moment.description,
      happenedAt: new Date(moment.happenedAt).toISOString(),
      imageUrls: (moment.imageKeys ?? moment.imageUrls ?? [])
        .map((imageUrl) => normalizeStudioMediaReference(imageUrl) ?? imageUrl)
        .filter(Boolean),
      voiceNoteUrl: normalizeStudioMediaReference(moment.voiceNoteKey ?? moment.voiceNoteUrl ?? undefined)
    }))
  }))
});

async function resolveStudioAttachmentUrl(
  accessToken: string,
  attachment: StudioMediaAttachment,
  options?: { storyId?: string | null }
) {
  const storageKey =
    (attachment.objectKey && isOwnedStorageObjectKey(attachment.objectKey) ? attachment.objectKey : null) ||
    extractStudioOwnedObjectKey(attachment.url);
  if (!storageKey) {
    return attachment;
  }

  const query = new URLSearchParams({ objectKey: storageKey });
  if (options?.storyId) {
    query.set("storyId", options.storyId);
  }

  const signedRead = await apiRequest<SignedReadResponse>(
    `/media/signed-read?${query.toString()}`,
    { accessToken }
  );

  return {
    ...attachment,
    objectKey: storageKey,
    url: signedRead.readUrl,
    source:
      attachment.source?.trim() && !/uploading/i.test(attachment.source)
        ? attachment.source
        : "Saved story"
  };
}

async function hydrateStudioChaptersForMedia(
  accessToken: string,
  chapters: StudioChapter[],
  options?: { storyId?: string | null }
) {
  return Promise.all(
    chapters.map(async (chapter) => ({
      ...chapter,
      imageAttachments: await Promise.all(
        chapter.imageAttachments.map((attachment) =>
          resolveStudioAttachmentUrl(accessToken, attachment, options).catch(() => attachment)
        )
      ),
      voiceNotes: await Promise.all(
        chapter.voiceNotes.map((voice) =>
          resolveStudioAttachmentUrl(accessToken, voice, options).catch(() => voice)
        )
      )
    }))
  );
}

const hasPendingStudioAttachmentHydration = (attachment: StudioMediaAttachment) => {
  const storageKey =
    (attachment.objectKey && isOwnedStorageObjectKey(attachment.objectKey) ? attachment.objectKey : null) ||
    extractStudioOwnedObjectKey(attachment.url);

  return Boolean(storageKey && attachment.url === storageKey);
};

async function hydrateStudioChapterMediaWithRetry(
  accessToken: string,
  chapter: StudioChapter,
  options?: { storyId?: string | null; attempts?: number; delayMs?: number }
) {
  let nextChapter = chapter;
  const attempts = options?.attempts ?? 4;
  const delayMs = options?.delayMs ?? 700;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const [hydratedChapter] = await hydrateStudioChaptersForMedia(accessToken, [nextChapter], options);
    nextChapter = hydratedChapter ?? nextChapter;

    const hasPendingHydration = [...nextChapter.imageAttachments, ...nextChapter.voiceNotes].some(
      (attachment) => hasPendingStudioAttachmentHydration(attachment)
    );

    if (!hasPendingHydration) {
      return nextChapter;
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }

  return nextChapter;
}

const isRestorableStudioAttachment = (attachment: { url: string; objectKey?: string }) =>
  Boolean(
    (attachment.objectKey && isOwnedStorageObjectKey(attachment.objectKey)) ||
    extractStudioOwnedObjectKey(attachment.url) ||
    isBlobUrl(attachment.url)
  );

const playStudioNoticeTone = (audioContextRef: { current: AudioContext | null }) => {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return;
  }

  const audioContext = audioContextRef.current ?? new AudioContextConstructor();
  audioContextRef.current = audioContext;

  void audioContext.resume().then(() => {
    const startAt = audioContext.currentTime;
    const pulse = (offset: number, frequency: number, duration: number) => {
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

    pulse(0, 720, 0.16);
    pulse(0.2, 620, 0.22);
  }).catch(() => undefined);
};

const getStoryAudienceLabel = (visibility: "private" | "selected" | "public") => {
  if (visibility === "private") {
    return "Only you";
  }
  if (visibility === "selected") {
    return "Selected readers";
  }
  return "Public";
};

const getStoryAudienceHelp = (visibility: "private" | "selected" | "public") => {
  if (visibility === "private") {
    return "Only you can open this story.";
  }
  if (visibility === "selected") {
    return "Only selected readers and you can open this story.";
  }
  return "Anyone can discover and open this story.";
};

const formatStudioEditMeta = (name?: string | null, username?: string | null, editedAt?: string | Date | null) => {
  if (!name || !username || !editedAt) {
    return "";
  }

  return `Last edited by ${name} (@${username}) // ${new Date(editedAt).toLocaleString()}`;
};

type StudioGuideTarget =
  | "chapters"
  | "storySetup"
  | "currentChapter"
  | "media"
  | "timeline"
  | "links"
  | "privacy"
  | "publish";

type StudioNoticeState = {
  title: string;
  body: string;
  target?: StudioGuideTarget;
};

export function StudioPage({
  accessToken,
  currentUser,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  currentUser: ProfileDashboard["user"];
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyStudioStorageKey = "histora-studio-local-draft-v1";
  const studioStoragePrefix = "histora-studio-local-draft-v2";
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
  const getUniqueChapterTitle = (
    desiredTitle: string,
    sourceChapters: StudioChapter[],
    options?: { excludeIndex?: number }
  ) => {
    const normalizedTitle = normalizeChapterTitle(desiredTitle) || "Untitled chapter";
    const takenTitles = new Set(
      sourceChapters
        .map((chapter, index) => (index === options?.excludeIndex ? null : normalizeChapterTitle(chapter.title).toLowerCase()))
        .filter((title): title is string => Boolean(title))
    );

    if (!takenTitles.has(normalizedTitle.toLowerCase())) {
      return normalizedTitle;
    }

    const chapterNumberMatch = normalizedTitle.match(/^chapter\s+(\d+)$/i);
    if (chapterNumberMatch) {
      let nextNumber = Number.parseInt(chapterNumberMatch[1], 10);
      while (takenTitles.has(`chapter ${nextNumber}`)) {
        nextNumber += 1;
      }
      return `Chapter ${nextNumber}`;
    }

    let suffix = 2;
    let candidate = `${normalizedTitle} (${suffix})`;
    while (takenTitles.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${normalizedTitle} (${suffix})`;
    }
    return candidate;
  };
  const ensureUniqueStudioChapterTitles = (sourceChapters: StudioChapter[]) => {
    const assignedTitles = new Set<string>();

    return sourceChapters.map((chapter, index) => {
      let nextTitle = normalizeChapterTitle(chapter.title) || `Chapter ${index + 1}`;
      if (assignedTitles.has(nextTitle.toLowerCase())) {
        nextTitle = getUniqueChapterTitle(nextTitle, sourceChapters, { excludeIndex: index });
        while (assignedTitles.has(nextTitle.toLowerCase())) {
          nextTitle = getUniqueChapterTitle(nextTitle, sourceChapters, { excludeIndex: index });
        }
      }
      assignedTitles.add(nextTitle.toLowerCase());
      return {
        ...chapter,
        title: nextTitle
      };
    });
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
  const getStudioStorageKey = (storyId?: string | null) =>
    storyId ? `${studioStoragePrefix}:story:${storyId}` : `${studioStoragePrefix}:local`;
  const buildSerializableStudioChapters = (sourceChapters: StudioChapter[]) =>
    sourceChapters.map((chapter) => ({
      ...chapter,
      imageAttachments: chapter.imageAttachments
        .map((attachment) => ({
          name: attachment.name,
          url: getStudioAttachmentStorageUrl(attachment),
          source: attachment.source,
          objectKey: attachment.objectKey
        }))
        .filter((attachment) => attachment.url),
      voiceNotes: chapter.voiceNotes
        .map((voice) => ({
          name: voice.name,
          url: getStudioAttachmentStorageUrl(voice),
          source: voice.source,
          objectKey: voice.objectKey
        }))
        .filter((voice) => voice.url)
    }));
  const parseStoredStudioDraft = (
    rawDraft: string | null,
    options?: {
      expectedStoryId?: string | null;
      allowUnsavedLocal?: boolean;
    }
  ): StoredStudioDraft | null => {
    if (!rawDraft) {
      return null;
    }

    try {
      const savedDraft = JSON.parse(rawDraft) as Partial<StoredStudioDraft>;

      if (options?.expectedStoryId) {
        if (savedDraft.currentStoryId !== options.expectedStoryId) {
          return null;
        }
      } else if (!options?.allowUnsavedLocal || savedDraft.currentStoryId) {
        return null;
      }

      const storyLinks = Array.isArray(savedDraft.storyLinks)
        ? savedDraft.storyLinks.filter(
            (link): link is StudioExternalLink =>
              Boolean(
                link &&
                  typeof link === "object" &&
                  typeof link.label === "string" &&
                  typeof link.url === "string" &&
                  (link.kind === "website" || link.kind === "social" || link.kind === "drive" || link.kind === "photos")
              )
          )
        : [];

      const chapters = Array.isArray(savedDraft.chapters)
        ? savedDraft.chapters
            .map((chapter) => ({
              ...chapter,
              body: sanitizeStudioRichText(chapter.body),
              imageAttachments: sanitizeStudioAttachments(
                (chapter.imageAttachments ?? []).filter((attachment) => isRestorableStudioAttachment(attachment))
              ),
              voiceNotes: sanitizeStudioAttachments(
                (chapter.voiceNotes ?? []).filter((voice) => isRestorableStudioAttachment(voice))
              ),
              timelineEntries: chapter.timelineEntries?.length ? chapter.timelineEntries : [createEmptyTimelineEntry()]
            }))
            .filter((chapter) => !isLegacySeedChapter(chapter))
        : [];

      return {
        currentStoryId: typeof savedDraft.currentStoryId === "string" ? savedDraft.currentStoryId : null,
        currentStoryStatus: savedDraft.currentStoryStatus === "published" ? "published" : "draft",
        liveChapterIndexes: Array.isArray(savedDraft.liveChapterIndexes)
          ? savedDraft.liveChapterIndexes.filter((value) => Number.isInteger(value) && value >= 0)
          : [],
        activeChapter: typeof savedDraft.activeChapter === "string" ? savedDraft.activeChapter : "",
        isPremium: typeof savedDraft.isPremium === "boolean" ? savedDraft.isPremium : false,
        visibility:
          savedDraft.visibility === "private" || savedDraft.visibility === "public" || savedDraft.visibility === "selected"
            ? savedDraft.visibility
            : "selected",
        anonymous: typeof savedDraft.anonymous === "boolean" ? savedDraft.anonymous : false,
        storyTitle: typeof savedDraft.storyTitle === "string" ? savedDraft.storyTitle : "",
        storySummary: typeof savedDraft.storySummary === "string" ? savedDraft.storySummary : "",
        storyLinks,
        chapterType: typeof savedDraft.chapterType === "string" ? savedDraft.chapterType : "memory",
        allowComments: typeof savedDraft.allowComments === "boolean" ? savedDraft.allowComments : currentUser.allowCommentsByDefault,
        chapters,
        timelineEntries: Array.isArray(savedDraft.timelineEntries) ? savedDraft.timelineEntries : [createEmptyTimelineEntry()],
        draftHistory: Array.isArray(savedDraft.draftHistory) ? savedDraft.draftHistory : [],
        transcriptionLanguage: typeof savedDraft.transcriptionLanguage === "string" ? savedDraft.transcriptionLanguage : "en-US"
      };
    } catch {
      return null;
    }
  };
  const readStoredStudioDraft = (options?: {
    storyId?: string | null;
    allowUnsavedLocal?: boolean;
  }) => {
    if (typeof window === "undefined") {
      return null;
    }

    const storyId = options?.storyId ?? null;
    const expectedStoryId = storyId || null;
    const nextDraft = parseStoredStudioDraft(window.localStorage.getItem(getStudioStorageKey(storyId)), {
      expectedStoryId,
      allowUnsavedLocal: options?.allowUnsavedLocal
    });

    if (nextDraft) {
      return nextDraft;
    }

    return parseStoredStudioDraft(window.localStorage.getItem(legacyStudioStorageKey), {
      expectedStoryId,
      allowUnsavedLocal: options?.allowUnsavedLocal
    });
  };
  const buildStoredStudioDraftPayload = (sourceChapters: StudioChapter[]): StoredStudioDraft => ({
    currentStoryId,
    currentStoryStatus,
    liveChapterIndexes,
    activeChapter,
    isPremium,
    visibility,
    anonymous,
    storyTitle,
    storySummary,
    storyLinks,
    chapterType,
    allowComments,
    chapters: buildSerializableStudioChapters(sourceChapters),
    timelineEntries,
    draftHistory,
    transcriptionLanguage
  });
  const persistStudioDraftToStorage = (sourceChapters: StudioChapter[]) => {
    if (typeof window === "undefined" || !hasLoadedStudioDraftRef.current) {
      return;
    }

    const draftPayload = buildStoredStudioDraftPayload(sourceChapters);
    window.localStorage.setItem(getStudioStorageKey(draftPayload.currentStoryId), JSON.stringify(draftPayload));

    if (draftPayload.currentStoryId) {
      window.localStorage.removeItem(getStudioStorageKey(null));
    }

    window.localStorage.removeItem(legacyStudioStorageKey);
  };
  const hasTimelineContent = (entries: StudioTimelineEntry[]) =>
    entries.some((entry) => entry.title.trim() || entry.body.trim() || entry.year || entry.month || entry.day);
  type StudioStorySnapshot = {
    status: "draft" | "published";
    title: string;
    summary: string;
    links: StudioExternalLink[];
    visibility: "private" | "selected" | "public";
    anonymous: boolean;
    chapters: StudioChapter[];
  };
  type StudioCollaborativeDraftSnapshot = {
    status: "draft" | "published";
    title: string;
    summary: string;
    links: StudioExternalLink[];
    visibility: "private" | "selected" | "public";
    anonymous: boolean;
    activeChapterId?: string;
    activeChapterTitle: string;
    activeChapterIndex: number;
    chapter: StudioChapter;
  };
  type StoredStudioDraft = {
    currentStoryId: string | null;
    currentStoryStatus: "draft" | "published";
    liveChapterIndexes: number[];
    activeChapter: string;
    isPremium: boolean;
    visibility: "private" | "selected" | "public";
    anonymous: boolean;
    storyTitle: string;
    storySummary: string;
    storyLinks: StudioExternalLink[];
    chapterType: string;
    allowComments: boolean;
    chapters: StudioChapter[];
    timelineEntries: StudioTimelineEntry[];
    draftHistory: string[];
    transcriptionLanguage: string;
  };
  const isUploadingAttachmentSource = (source?: string | null) => /uploading/i.test(source ?? "");
  const isFinalizedStudioAttachment = (attachment: Pick<StudioMediaAttachment, "url" | "objectKey" | "blob" | "source">) =>
    Boolean((attachment.objectKey && isOwnedStorageObjectKey(attachment.objectKey)) || (!attachment.blob && !isBlobUrl(attachment.url)));
  const getStudioAttachmentIdentity = (attachment: Pick<StudioMediaAttachment, "name" | "url" | "objectKey" | "localId">) =>
    attachment.objectKey ||
    extractStudioOwnedObjectKey(attachment.url) ||
    (!isBlobUrl(attachment.url) ? attachment.url : "") ||
    attachment.localId ||
    attachment.name;
  const getStudioAttachmentFileToken = (attachment: Pick<StudioMediaAttachment, "name" | "url" | "objectKey">) => {
    const normalizedName = attachment.name.trim().toLowerCase();
    if (normalizedName) {
      return normalizedName;
    }

    const storageReference = attachment.objectKey || extractStudioOwnedObjectKey(attachment.url) || attachment.url;
    if (!storageReference) {
      return "";
    }

    try {
      const normalizedPath = storageReference.startsWith("http")
        ? new URL(storageReference).pathname
        : storageReference;
      return normalizedPath.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    } catch {
      return storageReference.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
    }
  };
  const attachmentsRepresentSameUpload = (left: StudioMediaAttachment, right: StudioMediaAttachment) => {
    if (getStudioAttachmentIdentity(left) === getStudioAttachmentIdentity(right)) {
      return true;
    }

    if (!isUploadingAttachmentSource(left.source) && !isUploadingAttachmentSource(right.source)) {
      return false;
    }

    if (!isFinalizedStudioAttachment(left) && !isFinalizedStudioAttachment(right)) {
      return false;
    }

    const leftToken = getStudioAttachmentFileToken(left);
    const rightToken = getStudioAttachmentFileToken(right);
    return Boolean(leftToken && rightToken && leftToken === rightToken);
  };
  const finalizeStudioAttachment = (
    attachment: StudioMediaAttachment,
    overrides: Partial<StudioMediaAttachment> = {},
    fallbackSource = "Saved story"
  ): StudioMediaAttachment => {
    const nextSource =
      overrides.source?.trim() ||
      (!isUploadingAttachmentSource(attachment.source) && attachment.source?.trim()
        ? attachment.source
        : fallbackSource);

    return {
      ...attachment,
      ...overrides,
      blob: undefined,
      source: nextSource
    };
  };
  const sanitizeStudioAttachment = (
    attachment: StudioMediaAttachment,
    fallbackSource = "Saved story"
  ): StudioMediaAttachment => ({
    ...attachment,
    source:
      isUploadingAttachmentSource(attachment.source) && !attachment.blob
        ? fallbackSource
        : attachment.source?.trim() || fallbackSource
  });
  const sanitizeStudioAttachments = (attachments: StudioMediaAttachment[], fallbackSource = "Saved story") =>
    attachments.map((attachment) => sanitizeStudioAttachment(attachment, fallbackSource));
  const normalizeAttachmentCollectionForCompare = (attachments: StudioMediaAttachment[]) =>
    attachments.map((attachment) => ({
      key: getStudioAttachmentIdentity(attachment),
      name: attachment.name
    }));
  const attachmentCollectionsMatch = (left: StudioMediaAttachment[], right: StudioMediaAttachment[]) =>
    JSON.stringify(normalizeAttachmentCollectionForCompare(left)) === JSON.stringify(normalizeAttachmentCollectionForCompare(right));
  const mergeAttachmentCollections = (
    base: StudioMediaAttachment[],
    local: StudioMediaAttachment[],
    remote: StudioMediaAttachment[]
  ) => {
    const sanitizedLocal = sanitizeStudioAttachments(local);
    const sanitizedRemote = sanitizeStudioAttachments(remote);

    if (attachmentCollectionsMatch(sanitizedLocal, base)) {
      return sanitizedRemote;
    }

    if (attachmentCollectionsMatch(sanitizedRemote, base)) {
      return sanitizedLocal;
    }

    if (attachmentCollectionsMatch(sanitizedLocal, sanitizedRemote)) {
      return sanitizedRemote;
    }

    const merged = [...sanitizedRemote];

    for (const attachment of sanitizedLocal) {
      const existingIndex = merged.findIndex((existingAttachment) => attachmentsRepresentSameUpload(existingAttachment, attachment));
      if (existingIndex >= 0) {
        const existingAttachment = merged[existingIndex];
        merged[existingIndex] =
          isFinalizedStudioAttachment(existingAttachment) && !isUploadingAttachmentSource(existingAttachment.source)
            ? existingAttachment
            : isFinalizedStudioAttachment(attachment) && !isUploadingAttachmentSource(attachment.source)
              ? attachment
              : sanitizeStudioAttachment(existingAttachment);
        continue;
      }

      merged.push(attachment);
    }

    return merged;
  };
  const normalizeTimelineEntriesForCompare = (entries: StudioTimelineEntry[]) =>
    entries
      .filter((entry) => entry.title.trim() || entry.body.trim() || entry.year || entry.month || entry.day)
      .map((entry) => ({
        id: entry.id ?? null,
        year: entry.year,
        month: entry.month,
        day: entry.day,
        title: entry.title,
        body: entry.body
      }));
  const timelineCollectionsMatch = (left: StudioTimelineEntry[], right: StudioTimelineEntry[]) =>
    JSON.stringify(normalizeTimelineEntriesForCompare(left)) === JSON.stringify(normalizeTimelineEntriesForCompare(right));
  const getTimelineEntryIdentity = (entry: StudioTimelineEntry) =>
    entry.id || `${entry.year}-${entry.month}-${entry.day}-${entry.title}-${entry.body}`;
  const mergeTimelineCollections = (
    base: StudioTimelineEntry[],
    local: StudioTimelineEntry[],
    remote: StudioTimelineEntry[]
  ) => {
    if (timelineCollectionsMatch(local, base)) {
      return remote.length ? remote : [createEmptyTimelineEntry()];
    }

    if (timelineCollectionsMatch(remote, base)) {
      return local.length ? local : [createEmptyTimelineEntry()];
    }

    if (timelineCollectionsMatch(local, remote)) {
      return remote.length ? remote : [createEmptyTimelineEntry()];
    }

    const normalizedRemote = remote.filter((entry) => entry.title.trim() || entry.body.trim() || entry.year || entry.month || entry.day);
    const normalizedLocal = local.filter((entry) => entry.title.trim() || entry.body.trim() || entry.year || entry.month || entry.day);
    const merged = [...normalizedRemote];
    const seenTimelineIds = new Set(merged.map((entry) => getTimelineEntryIdentity(entry)));

    for (const entry of normalizedLocal) {
      const entryId = getTimelineEntryIdentity(entry);
      if (seenTimelineIds.has(entryId)) {
        continue;
      }

      merged.push(entry);
      seenTimelineIds.add(entryId);
    }

    return merged.length ? merged : [createEmptyTimelineEntry()];
  };
  const pickMergedScalarValue = <T,>(base: T, local: T, remote: T) => {
    if (JSON.stringify(local) === JSON.stringify(base)) {
      return remote;
    }

    if (JSON.stringify(remote) === JSON.stringify(base)) {
      return local;
    }

    return local;
  };
  const getStudioChapterIdentity = (chapter: Pick<StudioChapter, "id" | "title">) => chapter.id || chapter.title;
  const mergeStudioChapterCollections = (
    baseChapters: StudioChapter[],
    localChapters: StudioChapter[],
    remoteChapters: StudioChapter[]
  ) => {
    const baseById = new Map(baseChapters.map((chapter) => [getStudioChapterIdentity(chapter), chapter]));
    const localById = new Map(localChapters.map((chapter) => [getStudioChapterIdentity(chapter), chapter]));
    const remoteById = new Map(remoteChapters.map((chapter) => [getStudioChapterIdentity(chapter), chapter]));
    const orderedChapterIds = [
      ...remoteChapters.map((chapter) => getStudioChapterIdentity(chapter)),
      ...localChapters
        .map((chapter) => getStudioChapterIdentity(chapter))
        .filter((chapterId) => !remoteById.has(chapterId))
    ];

    return orderedChapterIds.map((chapterId, index) => {
      const baseChapter = baseById.get(chapterId);
      const localChapter = localById.get(chapterId);
      const remoteChapter = remoteById.get(chapterId);

      if (!localChapter && remoteChapter) {
        return {
          ...remoteChapter,
          imageAttachments: sanitizeStudioAttachments(remoteChapter.imageAttachments),
          voiceNotes: sanitizeStudioAttachments(remoteChapter.voiceNotes),
          timelineEntries: remoteChapter.timelineEntries.length ? remoteChapter.timelineEntries : [createEmptyTimelineEntry()]
        };
      }

      if (localChapter && !remoteChapter) {
        return {
          ...localChapter,
          words: getChapterWordCount(localChapter.body),
          moments: normalizeTimelineEntriesForCompare(localChapter.timelineEntries).length,
          imageAttachments: sanitizeStudioAttachments(localChapter.imageAttachments),
          voiceNotes: sanitizeStudioAttachments(localChapter.voiceNotes),
          timelineEntries: localChapter.timelineEntries.length ? localChapter.timelineEntries : [createEmptyTimelineEntry()]
        };
      }

      if (!localChapter || !remoteChapter) {
        return createInitialStudioChapter(index);
      }

      const mergedTitle = baseChapter
        ? pickMergedScalarValue(baseChapter.title, localChapter.title, remoteChapter.title)
        : localChapter.title || remoteChapter.title;
      const mergedBody = baseChapter
        ? pickMergedScalarValue(baseChapter.body, localChapter.body, remoteChapter.body)
        : localChapter.body || remoteChapter.body;
      const mergedType = baseChapter
        ? pickMergedScalarValue(baseChapter.type, localChapter.type, remoteChapter.type)
        : localChapter.type || remoteChapter.type;
      const mergedImageAttachments = mergeAttachmentCollections(
        baseChapter?.imageAttachments ?? [],
        localChapter.imageAttachments,
        remoteChapter.imageAttachments
      );
      const mergedVoiceNotes = mergeAttachmentCollections(
        baseChapter?.voiceNotes ?? [],
        localChapter.voiceNotes,
        remoteChapter.voiceNotes
      );
      const mergedTimelineEntries = mergeTimelineCollections(
        baseChapter?.timelineEntries ?? [],
        localChapter.timelineEntries,
        remoteChapter.timelineEntries
      );

      return {
        ...remoteChapter,
        title: mergedTitle,
        body: mergedBody,
        type: mergedType,
        words: getChapterWordCount(mergedBody),
        moments: normalizeTimelineEntriesForCompare(mergedTimelineEntries).length,
        imageAttachments: mergedImageAttachments,
        voiceNotes: mergedVoiceNotes,
        timelineEntries: mergedTimelineEntries
      };
    });
  };
  const createStudioStorySnapshotFromStory = (story: ApiStory): StudioStorySnapshot => {
    const fetchedChapters = story.chapters
      .map((chapter) => normalizeFetchedStoryChapter(chapter, story.status))
      .filter((chapter) => !isLegacySeedChapter(chapter))
      .map((chapter) => ({
        ...chapter,
        imageAttachments: sanitizeStudioAttachments(chapter.imageAttachments),
        voiceNotes: sanitizeStudioAttachments(chapter.voiceNotes),
        timelineEntries: chapter.timelineEntries.length ? chapter.timelineEntries : [createEmptyTimelineEntry()]
      }));

    return {
      status: story.status,
      title: story.title,
      summary: story.summary,
      links: story.links ?? [],
      visibility: story.visibility as "private" | "selected" | "public",
      anonymous: story.anonymous,
      chapters: fetchedChapters
    };
  };
  const createCurrentStudioStorySnapshot = (): StudioStorySnapshot => ({
    status: currentStoryStatusRef.current,
    title: storyTitle,
    summary: storySummary,
    links: storyLinks,
    visibility,
    anonymous,
    chapters: getLiveChaptersSnapshot().map((chapter) => ({
      ...chapter,
      imageAttachments: sanitizeStudioAttachments(chapter.imageAttachments),
      voiceNotes: sanitizeStudioAttachments(chapter.voiceNotes),
      timelineEntries: chapter.timelineEntries.length ? chapter.timelineEntries : [createEmptyTimelineEntry()]
    }))
  });
  const mergeRemoteStoryWithLocalDraft = (
    baseSnapshot: StudioStorySnapshot | null,
    localSnapshot: StudioStorySnapshot,
    remoteSnapshot: StudioStorySnapshot
  ): StudioStorySnapshot => ({
    status: remoteSnapshot.status,
    title: baseSnapshot ? pickMergedScalarValue(baseSnapshot.title, localSnapshot.title, remoteSnapshot.title) : localSnapshot.title || remoteSnapshot.title,
    summary: baseSnapshot ? pickMergedScalarValue(baseSnapshot.summary, localSnapshot.summary, remoteSnapshot.summary) : localSnapshot.summary || remoteSnapshot.summary,
    links: baseSnapshot ? pickMergedScalarValue(baseSnapshot.links, localSnapshot.links, remoteSnapshot.links) : localSnapshot.links.length ? localSnapshot.links : remoteSnapshot.links,
    visibility: remoteSnapshot.visibility,
    anonymous: remoteSnapshot.anonymous,
    chapters: mergeStudioChapterCollections(baseSnapshot?.chapters ?? [], localSnapshot.chapters, remoteSnapshot.chapters)
  });
  const buildComparableStudioStorySnapshotPayload = (
    snapshot: StudioStorySnapshot
  ): Omit<StudioPublishPayload["payload"], "expectedRevision"> => ({
    title: snapshot.title,
    summary: snapshot.summary,
    coverImageUrl:
      snapshot.chapters
        .flatMap((chapter) => chapter.imageAttachments)
        .map((attachment) => normalizeStudioMediaReference(attachment.objectKey ?? attachment.url))
        .find(Boolean) ?? undefined,
    visibility: snapshot.visibility,
    anonymous: snapshot.anonymous,
    allowedViewerIds: [],
    tags: [],
    links: snapshot.links.map((link) => ({
      label: link.label,
      url: link.url,
      kind: link.kind
    })),
    status: snapshot.status,
    chapters: snapshot.chapters.map((chapter, index) => ({
      id: chapter.id,
      title: chapter.title,
      body: sanitizeStudioRichText(chapter.body),
      type:
        chapter.type.toLowerCase() === "anon"
          ? "anonymous"
          : (chapter.type.toLowerCase() as "memory" | "reflection" | "milestone" | "anonymous"),
      order: index + 1,
      imageUrls: chapter.imageAttachments
        .map((attachment) => normalizeStudioMediaReference(attachment.objectKey ?? attachment.url))
        .filter(Boolean) as string[],
      voiceNoteUrl:
        chapter.voiceNotes[0]
          ? normalizeStudioMediaReference(chapter.voiceNotes[0].objectKey ?? chapter.voiceNotes[0].url)
          : undefined,
      moments: chapter.timelineEntries
        .filter((entry) => entry.title.trim() || entry.body.trim())
        .map((entry) => ({
          id: entry.id,
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
  const serializeComparableStudioStorySnapshot = (snapshot: StudioStorySnapshot) =>
    serializeComparableStoryPayload(buildComparableStudioStorySnapshotPayload(snapshot));
  const getCurrentVsSyncedComparableState = () => {
    if (!currentStoryIdRef.current || !lastSyncedStudioSnapshotRef.current) {
      return null;
    }

    const currentSnapshot = currentStudioSnapshotRef.current ?? createCurrentStudioStorySnapshot();
    return {
      currentPayload: buildComparableStudioStorySnapshotPayload(currentSnapshot),
      syncedPayload: buildComparableStudioStorySnapshotPayload(lastSyncedStudioSnapshotRef.current)
    };
  };
  const currentStudioMatchesLastSyncedStory = () => {
    const comparableState = getCurrentVsSyncedComparableState();
    if (!comparableState) {
      return false;
    }

    return serializeComparableStoryPayload(comparableState.currentPayload) ===
      serializeComparableStoryPayload(comparableState.syncedPayload);
  };
  const hasRemoteStudioBaselineLoaded = () =>
    !currentStoryIdRef.current || Boolean(lastSyncedStudioSnapshotRef.current);
  const shouldLogStudioCollaboration = () =>
    typeof window !== "undefined" &&
    (
      window.localStorage.getItem("histora-debug-collab") === "true" ||
      import.meta.env.DEV
    );
  const logStudioCollaboration = (event: string, detail?: unknown) => {
    if (!shouldLogStudioCollaboration()) {
      return;
    }

    const serializedDetail =
      typeof detail === "string"
        ? detail
        : detail === undefined
          ? ""
          : JSON.stringify(detail);
    console.info(`[studio-collab] ${event}${serializedDetail ? ` ${serializedDetail}` : ""}`);
  };
  const serializeStudioAttachmentForDraftSync = (
    attachment: StudioMediaAttachment,
    fallbackSource = "Saved story"
  ): StudioMediaAttachment | null => {
    const storageUrl = getStudioAttachmentStorageUrl(attachment);
    if (!storageUrl) {
      return null;
    }

    return {
      ...sanitizeStudioAttachment(attachment, fallbackSource),
      url: storageUrl,
      blob: undefined
    };
  };
  const serializeStudioChapterForDraftSync = (chapter: StudioChapter): StudioChapter => ({
    ...chapter,
    imageAttachments: chapter.imageAttachments
      .map((attachment) => serializeStudioAttachmentForDraftSync(attachment, "Saved story"))
      .filter(Boolean) as StudioMediaAttachment[],
    voiceNotes: chapter.voiceNotes
      .map((voice) => serializeStudioAttachmentForDraftSync(voice, "Recorded in studio"))
      .filter(Boolean) as StudioMediaAttachment[],
    timelineEntries: chapter.timelineEntries.length ? chapter.timelineEntries : [createEmptyTimelineEntry()]
  });
  const findCollaborativeChapterIndex = (
    sourceChapters: StudioChapter[],
    snapshot: Pick<StudioCollaborativeDraftSnapshot, "activeChapterId" | "activeChapterTitle" | "activeChapterIndex">
  ) => {
    const byId = snapshot.activeChapterId
      ? sourceChapters.findIndex((chapter) => chapter.id && chapter.id === snapshot.activeChapterId)
      : -1;
    if (byId >= 0) {
      return byId;
    }

    const byTitle = sourceChapters.findIndex((chapter) => chapter.title === snapshot.activeChapterTitle);
    if (byTitle >= 0) {
      return byTitle;
    }

    if (snapshot.activeChapterIndex >= 0 && snapshot.activeChapterIndex < sourceChapters.length) {
      return snapshot.activeChapterIndex;
    }

    return -1;
  };
  const buildCollaborativeDraftSnapshot = (): StudioCollaborativeDraftSnapshot | null => {
    const storyId = currentStoryIdRef.current;
    if (!storyId) {
      return null;
    }

    const latestBody = getLatestChapterBody();
    const targetIndex = Math.max(
      chaptersRef.current.findIndex((chapter) => chapter.title === activeChapterRef.current),
      0
    );
    const currentSnapshot: StudioStorySnapshot = {
      status: currentStoryStatusRef.current,
      title: storyTitle,
      summary: storySummary,
      links: storyLinks,
      visibility,
      anonymous,
      chapters: chaptersRef.current.map((chapter, index) =>
        index === targetIndex
          ? {
              ...chapter,
              body: latestBody,
              words: getChapterWordCount(latestBody),
              imageAttachments: sanitizeStudioAttachments([...imageAttachmentsRef.current]),
              voiceNotes: sanitizeStudioAttachments([...voiceNotesRef.current], "Recorded in studio"),
              timelineEntries: [...timelineEntriesRef.current].length ? [...timelineEntriesRef.current] : [createEmptyTimelineEntry()]
            }
          : chapter
      )
    };
    const activeChapterIndex = findCollaborativeChapterIndex(currentSnapshot.chapters, {
      activeChapterId: undefined,
      activeChapterTitle: activeChapterRef.current,
      activeChapterIndex: currentSnapshot.chapters.findIndex((chapter) => chapter.title === activeChapterRef.current)
    });
    const safeChapterIndex = activeChapterIndex >= 0 ? activeChapterIndex : 0;
    const activeChapterSnapshot = currentSnapshot.chapters[safeChapterIndex];

    if (!activeChapterSnapshot) {
      return null;
    }

    return {
      status: currentSnapshot.status,
      title: currentSnapshot.title,
      summary: currentSnapshot.summary,
      links: currentSnapshot.links,
      visibility: currentSnapshot.visibility,
      anonymous: currentSnapshot.anonymous,
      activeChapterId: activeChapterSnapshot.id,
      activeChapterTitle: activeChapterSnapshot.title,
      activeChapterIndex: safeChapterIndex,
      chapter: serializeStudioChapterForDraftSync(activeChapterSnapshot)
    };
  };
  const isLegacySeedChapter = (chapter: Pick<StudioChapter, "title" | "body" | "imageAttachments" | "voiceNotes" | "timelineEntries">) => {
    const normalizedTitle = normalizeChapterTitle(chapter.title);
    const expectedBody = legacySeedChapterBodies[normalizedTitle as keyof typeof legacySeedChapterBodies];

    if (!expectedBody) {
      return false;
    }

    return (
      getPlainTextFromHtml(chapter.body).trim() === expectedBody.trim() &&
      chapter.imageAttachments.length === 0 &&
      chapter.voiceNotes.length === 0 &&
      !hasTimelineContent(chapter.timelineEntries)
    );
  };
  const isPersistableStudioChapter = (chapter: StudioChapter) =>
    getChapterWordCount(chapter.body) > 0 ||
    chapter.imageAttachments.length > 0 ||
    chapter.voiceNotes.length > 0 ||
    hasTimelineContent(chapter.timelineEntries);
  const normalizeFetchedStoryChapter = (chapter: ApiStory["chapters"][number], storyStatus: ApiStory["status"]): StudioChapter => ({
    id: chapter.id,
    title: chapter.title,
    type: chapter.type.toUpperCase(),
    words: getChapterWordCount(sanitizeStudioRichText(chapter.body)),
    status: storyStatus === "published" ? "Published" : "Draft saved",
    moments: chapter.moments.length,
      body: sanitizeStudioRichText(chapter.body),
    createdByName: chapter.createdByName ?? null,
    createdByUsername: chapter.createdByUsername ?? null,
    createdAt: chapter.createdAt ?? null,
    lastEditedByName: chapter.lastEditedByName ?? null,
    lastEditedByUsername: chapter.lastEditedByUsername ?? null,
    lastEditedAt: chapter.lastEditedAt ?? null,
    imageAttachments: (chapter.imageUrls ?? []).map((imageUrl, index) => ({
      name: `${chapter.title} image ${index + 1}`,
      url: imageUrl,
      source: "Saved story",
      objectKey:
        chapter.imageKeys?.[index] && isOwnedStorageObjectKey(chapter.imageKeys[index])
          ? chapter.imageKeys[index]
          : extractStudioOwnedObjectKey(imageUrl) ?? undefined
    })),
    voiceNotes: chapter.voiceNoteUrl
      ? [{
          name: `Voice note ${chapter.order}`,
          url: chapter.voiceNoteUrl,
          source: "Saved story",
          objectKey:
            chapter.voiceNoteKey && isOwnedStorageObjectKey(chapter.voiceNoteKey)
              ? chapter.voiceNoteKey
              : extractStudioOwnedObjectKey(chapter.voiceNoteUrl) ?? undefined
        }]
      : [],
    timelineEntries:
      chapter.moments.length > 0
        ? chapter.moments.map((moment) => {
            const momentDate = new Date(moment.happenedAt);
            return {
              id: moment.id,
              year: String(momentDate.getFullYear()),
              month: String(momentDate.getMonth() + 1).padStart(2, "0"),
              day: String(momentDate.getDate()).padStart(2, "0"),
              title: moment.title,
              body: moment.description,
              createdByName: moment.createdByName ?? null,
              createdByUsername: moment.createdByUsername ?? null,
              createdAt: moment.createdAt ?? null,
              lastEditedByName: moment.lastEditedByName ?? null,
              lastEditedByUsername: moment.lastEditedByUsername ?? null,
              lastEditedAt: moment.lastEditedAt ?? null
            };
          })
        : [createEmptyTimelineEntry()]
  });
  const mergeFetchedDraftChapters = (localChapters: StudioChapter[], fetchedChapters: StudioChapter[]) => {
    return mergeStudioChapterCollections([], localChapters, fetchedChapters).filter((chapter) =>
      isPersistableStudioChapter(chapter) || fetchedChapters.some((fetchedChapter) => getStudioChapterIdentity(fetchedChapter) === getStudioChapterIdentity(chapter))
    );
  };
  const canPersistStoryRemotely = (sourceChapters: StudioChapter[]) =>
    storyTitle.trim().length >= 3 &&
    storySummary.trim().split(/\s+/).filter(Boolean).length >= 20 &&
    sourceChapters.some((chapter) => isPersistableStudioChapter(chapter));
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
  const legacySeedChapterBodies = {
    "Before the city":
      "I learned early that memory is rarely one clean scene. It is a room, then a sound, then a name I did not understand until years later.",
    "The year everything changed":
      "I stopped trying to tell the story in one clean arc and started preserving the truth in fragments: one move, one loss, one new job, one proof that I was still here.",
    "Advice post: Should I reconnect?":
      "I do not know if reopening this relationship will heal anything or only restart a wound I barely closed."
  } as const;
  const studioOpenEditorOnceKey = "histora-studio-open-editor-once";
  const [isEnteringStudio, setIsEnteringStudio] = useState(true);
  const [isStudioEditorOpen, setIsStudioEditorOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState("Chapter 1");
  const [isPremium, setIsPremium] = useState(currentUser.subscriptionTier === "premium");
  const [visibility, setVisibility] = useState<"private" | "selected" | "public">("selected");
  const [anonymous, setAnonymous] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storySummary, setStorySummary] = useState("");
  const [storyLinks, setStoryLinks] = useState<StudioExternalLink[]>([]);
  const [chapterType, setChapterType] = useState("memory");
  const [allowComments, setAllowComments] = useState(true);
  const [chapters, setChapters] = useState<StudioChapter[]>(
    [createInitialStudioChapter(0)]
  );
  const [studioMessage, setStudioMessage] = useState("Studio ready.");
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [currentStoryStatus, setCurrentStoryStatus] = useState<"draft" | "published">("draft");
  const [liveChapterIndexes, setLiveChapterIndexes] = useState<number[]>([]);
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false);
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [draftHistory, setDraftHistory] = useState<string[]>(["Studio opened."]);
  const [studioNotice, setStudioNotice] = useState<StudioNoticeState | null>(null);
  const [storyLibrary, setStoryLibrary] = useState<ApiStory[]>([]);
  const [collaborationLibrary, setCollaborationLibrary] = useState<ApiStory[]>([]);
  const [isStoryLibraryLoading, setIsStoryLibraryLoading] = useState(false);
  const [currentStoryRevision, setCurrentStoryRevision] = useState(0);
  const [currentStoryCanEdit, setCurrentStoryCanEdit] = useState(true);
  const [currentStoryCollaborators, setCurrentStoryCollaborators] = useState<NonNullable<ApiStory["collaborators"]>>([]);
  const [currentStoryLastEditedByName, setCurrentStoryLastEditedByName] = useState<string | null>(null);
  const [currentStoryLastEditedByUsername, setCurrentStoryLastEditedByUsername] = useState<string | null>(null);
  const [currentStoryLastEditedAt, setCurrentStoryLastEditedAt] = useState<string | null>(null);
  const [currentStoryIsOwner, setCurrentStoryIsOwner] = useState(true);
  const [remoteCollaborationUpdate, setRemoteCollaborationUpdate] = useState<{
    revision: number;
    updatedByName: string;
    updatedByUsername: string;
    updatedAt: string;
  } | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<StudioTimelineEntry[]>([]);
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    quote: false,
    checklist: false,
    timeline: false,
    comment: false
  });
  const [imageAttachments, setImageAttachments] = useState<StudioMediaAttachment[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<StudioMediaAttachment[]>([]);
  const [imageLoadingState, setImageLoadingState] = useState<Record<string, boolean>>({});
  const [imageReplaceTargetUrl, setImageReplaceTargetUrl] = useState<string | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isVoiceRecordingPaused, setIsVoiceRecordingPaused] = useState(false);
  const [isVoiceSheetOpen, setIsVoiceSheetOpen] = useState(false);
  const [isAutoSavingDraft, setIsAutoSavingDraft] = useState(false);
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
  const mediaAttachmentsSectionRef = useRef<HTMLElement | null>(null);
  const storyLinksSectionRef = useRef<HTMLElement | null>(null);
  const privacySectionRef = useRef<HTMLElement | null>(null);
  const publishControlSectionRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageAttachmentsRef = useRef<StudioMediaAttachment[]>([]);
  const imageHydrationRetryInFlightRef = useRef<Record<string, boolean>>({});
  const voiceNotesRef = useRef<StudioMediaAttachment[]>([]);
  const timelineEntriesRef = useRef<StudioTimelineEntry[]>([]);
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
  const [isStudioDraftHydrated, setIsStudioDraftHydrated] = useState(false);
  const lastAutoSavedSignatureRef = useRef("");
  const restoredLocalDraftRef = useRef(false);
  const chaptersRef = useRef<StudioChapter[]>([]);
  const activeChapterRef = useRef("Chapter 1");
  const currentStoryIdRef = useRef<string | null>(null);
  const currentStoryRevisionRef = useRef(0);
  const currentStoryStatusRef = useRef<"draft" | "published">("draft");
  const localComparableStorySignatureRef = useRef<string | null>(null);
  const currentStudioSnapshotRef = useRef<StudioStorySnapshot | null>(null);
  const lastSyncedStudioSnapshotRef = useRef<StudioStorySnapshot | null>(null);
  const collaborativeDraftSessionIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
  const collaborativeDraftBroadcastTimerRef = useRef<number | null>(null);
  const collaborativeDraftBroadcastFrameRef = useRef<number | null>(null);
  const appEventsConnectionRef = useRef<ReturnType<typeof createAppEventsConnection> | null>(null);
  const lastLocalEditorActivityAtRef = useRef(0);
  const lastLocalMediaActivityAtRef = useRef(0);
  const lastLocalStoryMetaActivityAtRef = useRef(0);
  const persistStoryQueueRef = useRef<Promise<ApiStory | null>>(Promise.resolve(null));
  const collaborationRequestHandledRef = useRef(false);
  const suppressAutoSavePassesRef = useRef(0);

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
  const imageLimit = isPremium ? 12 : 2;
  const voiceLimit = isPremium ? 6 : 1;
  const chapterLimit = isPremium ? 8 : 2;
  const activeChapterIndex = chapters.findIndex((chapter) => chapter.title === activeChapter);
  const activeChapterEntry = chapters[activeChapterIndex] ?? chapters[0];
  const activeChapterLabel = activeChapterEntry?.title ?? activeChapter;
  const chapterBody = activeChapterEntry?.body ?? "";
  const getLatestChapterBody = () => {
    const editorHtml = chapterBodyRef.current?.innerHTML;
    if ((editorHtml ?? "") === "" && chapterBody) {
      return chapterBody;
    }

    return editorHtml ?? chapterBody;
  };
  const liveEditorBody = getLatestChapterBody();
  const plainChapterText = getPlainTextFromHtml(liveEditorBody);
  const wordCount = getChapterWordCount(liveEditorBody);
  const summaryWordCount = storySummary.trim().split(/\s+/).filter(Boolean).length;
  const summaryWordsRemaining = Math.max(20 - summaryWordCount, 0);
  const bodyWordsRemaining = Math.max(chapterCompletionThreshold - wordCount, 0);
  const isEditingPublishedStory = currentStoryStatus === "published";
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
  const liveChapterIndexSet = new Set(liveChapterIndexes);
  const activeChapterIsLive = liveChapterIndexSet.has(activeChapterIndex >= 0 ? activeChapterIndex : 0);
  const requestedStudioStoryId = searchParams.get("storyId");
  const isCollaborativeStudio = currentStoryCollaborators.length > 0;
  const storySetupComplete = storyTitle.trim().length >= 3 && summaryWordCount >= 20;
  const hasUnsavedLocalDraft =
    !currentStoryId &&
    (
      storyTitle.trim().length > 0 ||
      storySummary.trim().length > 0 ||
      storyLinks.some((link) => link.label.trim().length > 0 || link.url.trim().length > 0) ||
      chapters.some((chapter, index) =>
        chapter.title.trim() !== `Chapter ${index + 1}` ||
        getPlainTextFromHtml(chapter.body).trim().length > 0 ||
        chapter.imageAttachments.length > 0 ||
        chapter.voiceNotes.length > 0 ||
        chapter.timelineEntries.some(
          (entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0 || entry.year || entry.month || entry.day
        )
      )
    );
  const chapterStepComplete = readyChapters.length > 0;
  const mediaStepComplete = imageAttachments.length > 0 || voiceNotes.length > 0;
  const timelineStepComplete = hasTimelineContent(timelineEntries);
  const storyLinksComplete = storyLinks.some((link) => link.label.trim() && link.url.trim());
  const previewStepComplete = hasReviewedPreview;
  const studioGuideSteps = [
    {
      id: "storySetup" as const,
      number: 1,
      title: "Story setup",
      description: "Add a title and a summary so the story can be previewed.",
      completed: storySetupComplete,
      status: storySetupComplete ? "Ready" : "Start here"
    },
    {
      id: "currentChapter" as const,
      number: 2,
      title: "Write a chapter",
      description: "Give one chapter a title and enough words to make it publishable.",
      completed: chapterStepComplete,
      status: chapterStepComplete ? "Ready" : "Write next"
    },
    {
      id: "media" as const,
      number: 3,
      title: "Add media",
      description: "Attach images or voice notes if they help tell the chapter better.",
      completed: mediaStepComplete,
      status: mediaStepComplete ? "Added" : "Optional"
    },
    {
      id: "timeline" as const,
      number: 4,
      title: "Timeline moments",
      description: "Anchor the chapter to real dates, months, or turning points.",
      completed: timelineStepComplete,
      status: timelineStepComplete ? "Added" : "Optional"
    },
    {
      id: "links" as const,
      number: 5,
      title: "Story links",
      description: "Add supporting links readers can open after they finish the story.",
      completed: storyLinksComplete,
      status: storyLinksComplete ? "Added" : "Optional"
    },
    {
      id: "privacy" as const,
      number: 6,
      title: "Audience",
      description: "Check who should be able to open the story before you publish.",
      completed: true,
      status: anonymous ? "Anonymous" : getStoryAudienceLabel(visibility)
    },
    {
      id: "publish" as const,
      number: 7,
      title: "Preview and publish",
      description: "Review the final reader view, then publish or republish the live version.",
      completed: previewStepComplete,
      status: currentStoryStatus === "published" ? "Live story" : previewStepComplete ? "Previewed" : "Review next"
    }
  ];
  const autoSaveSignature = JSON.stringify({
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    liveEditorBody,
    storyLinks,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    currentStoryStatus,
    liveChapterIndexes
  });

  const updateActiveChapterMedia = (
    field: "imageAttachments" | "voiceNotes" | "timelineEntries",
    value: StudioMediaAttachment[] | StudioTimelineEntry[]
  ) => {
    setChapters((current) =>
      current.map((chapter, index) =>
        index === (activeChapterIndex >= 0 ? activeChapterIndex : 0) ? { ...chapter, [field]: value } : chapter
      )
    );
  };

  const getEditorSelectionCharacterOffset = (root: HTMLElement) => {
    if (typeof window === "undefined") {
      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) {
      return null;
    }

    const preRange = range.cloneRange();
    preRange.selectNodeContents(root);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
  };

  const restoreEditorSelectionCharacterOffset = (root: HTMLElement, offset: number) => {
    if (typeof window === "undefined") {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    let remaining = offset;
    let foundNode: Node | null = null;
    let foundOffset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const textLength = node.textContent?.length ?? 0;

      if (remaining <= textLength) {
        foundNode = node;
        foundOffset = remaining;
        break;
      }

      remaining -= textLength;
    }

    if (!foundNode) {
      range.selectNodeContents(root);
      range.collapse(false);
    } else {
      range.setStart(foundNode, Math.min(foundOffset, foundNode.textContent?.length ?? 0));
      range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const openUnsavedLocalDraft = () => {
    setIsStudioEditorOpen(true);
    setStudioMessage("Local draft reopened.");
    setStudioNotice(null);
  };
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
  const chapterSlots = chapters.map((chapter, index) => {
    const isLocked = index >= chapterLimit;
    const chapterLabel = `Chapter ${index + 1}`;

    return { ...chapter, isLocked, chapterLabel };
  });
  const getChapterStatusLabel = (chapterIndex: number, fallbackStatus?: string) => {
    if (liveChapterIndexSet.has(chapterIndex)) {
      return "LIVE";
    }

    if (fallbackStatus === "Published") {
      return "LIVE";
    }

    return "DRAFT";
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setIsEnteringStudio(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.sessionStorage.getItem(studioOpenEditorOnceKey) === "true") {
      setIsStudioEditorOpen(true);
      window.sessionStorage.removeItem(studioOpenEditorOnceKey);
    }
  }, [studioOpenEditorOnceKey]);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    activeChapterRef.current = activeChapter;
  }, [activeChapter]);

  useEffect(() => {
    currentStoryIdRef.current = currentStoryId;
  }, [currentStoryId]);

  useEffect(() => {
    currentStoryRevisionRef.current = currentStoryRevision;
  }, [currentStoryRevision]);

  useEffect(() => {
    currentStoryStatusRef.current = currentStoryStatus;
  }, [currentStoryStatus]);

  useEffect(() => {
    setImageAttachments(activeChapterEntry?.imageAttachments ?? []);
    setVoiceNotes(activeChapterEntry?.voiceNotes ?? []);
    setTimelineEntries(activeChapterEntry?.timelineEntries?.length ? activeChapterEntry.timelineEntries : [createEmptyTimelineEntry()]);
  }, [activeChapterEntry]);

  useEffect(() => {
    setImageLoadingState((current) =>
      Object.fromEntries(
        imageAttachments.map((attachment) => {
          const attachmentIdentity = getStudioAttachmentIdentity(attachment);
          return [
            attachmentIdentity,
            isUploadingAttachmentSource(attachment.source) ||
              hasPendingStudioAttachmentHydration(attachment) ||
              current[attachmentIdentity] !== false
          ];
        })
      )
    );
  }, [imageAttachments]);

  const refreshImageAttachmentAfterError = (attachment: StudioMediaAttachment) => {
    const storyId = currentStoryIdRef.current;
    const attachmentIdentity = getStudioAttachmentIdentity(attachment);
    const storageKey =
      (attachment.objectKey && isOwnedStorageObjectKey(attachment.objectKey) ? attachment.objectKey : null) ||
      extractStudioOwnedObjectKey(attachment.url);

    if (!storyId || !storageKey || imageHydrationRetryInFlightRef.current[attachmentIdentity]) {
      return;
    }

    imageHydrationRetryInFlightRef.current[attachmentIdentity] = true;
    setImageLoadingState((current) => ({
      ...current,
      [attachmentIdentity]: true
    }));

    void resolveStudioAttachmentUrl(accessToken, attachment, { storyId })
      .then((refreshedAttachment) => {
        const applyRefreshedAttachment = (collection: StudioMediaAttachment[]) =>
          collection.map((existingAttachment) =>
            attachmentsRepresentSameUpload(existingAttachment, attachment)
              ? finalizeStudioAttachment(refreshedAttachment, {
                  localId: existingAttachment.localId
                })
              : existingAttachment
          );

        setChapters((current) =>
          current.map((chapter) => ({
            ...chapter,
            imageAttachments: applyRefreshedAttachment(chapter.imageAttachments)
          }))
        );
        setImageAttachments((current) => applyRefreshedAttachment(current));

        logStudioCollaboration("refreshed broken image attachment", {
          storyId,
          attachment: attachment.name,
          objectKey: storageKey
        });
      })
      .catch((error) => {
        logStudioCollaboration("image attachment refresh failed", {
          storyId,
          attachment: attachment.name,
          objectKey: storageKey,
          error: getErrorMessage(error, "Unknown image hydration failure")
        });
      })
      .finally(() => {
        delete imageHydrationRetryInFlightRef.current[attachmentIdentity];
      });
  };

  const loadStoryIntoStudio = (story: ApiStory, options?: { mergeRestoredDraft?: boolean }) => {
    const remoteSnapshot = createStudioStorySnapshotFromStory(story);
    const fetchedChapters = remoteSnapshot.chapters;
    const storedDraft = readStoredStudioDraft({ storyId: story.id });
    const restoredDraftChapters = storedDraft?.chapters.length ? ensureUniqueStudioChapterTitles(storedDraft.chapters) : null;
    const restoredDraftActiveChapter = storedDraft?.activeChapter?.trim() || "";

    const nextChapters =
      restoredDraftChapters
        ? mergeFetchedDraftChapters(restoredDraftChapters, fetchedChapters)
        : options?.mergeRestoredDraft && restoredLocalDraftRef.current
          ? mergeFetchedDraftChapters(chaptersRef.current, fetchedChapters)
        : fetchedChapters;
    const uniqueChapters = ensureUniqueStudioChapterTitles(nextChapters.length ? nextChapters : [createInitialStudioChapter(0)]);
    const resolvedActiveChapter =
      restoredDraftActiveChapter && uniqueChapters.some((chapter) => chapter.title === restoredDraftActiveChapter)
        ? restoredDraftActiveChapter
        : uniqueChapters[0]?.title ?? "Chapter 1";

    suppressAutoSavePassesRef.current += 4;
    restoredLocalDraftRef.current = Boolean(storedDraft);
    setCurrentStoryId(story.id);
    setCurrentStoryStatus(story.status);
    setCurrentStoryRevision(story.collaborationRevision ?? 0);
    currentStoryRevisionRef.current = story.collaborationRevision ?? 0;
    currentStoryStatusRef.current = story.status;
    lastSyncedStudioSnapshotRef.current = remoteSnapshot;
    setCurrentStoryCanEdit(story.canEdit ?? true);
    setCurrentStoryCollaborators(story.collaborators ?? []);
    setCurrentStoryLastEditedByName(story.lastEditedByName ?? null);
    setCurrentStoryLastEditedByUsername(story.lastEditedByUsername ?? null);
    setCurrentStoryLastEditedAt(story.lastEditedAt ?? null);
    setCurrentStoryIsOwner(Boolean(story.isOwner ?? true));
    setRemoteCollaborationUpdate(null);
    setLiveChapterIndexes(story.status === "published" ? fetchedChapters.map((_, index) => index) : []);
    setStoryTitle(storedDraft?.storyTitle ?? story.title);
    setStorySummary(storedDraft?.storySummary ?? story.summary);
    setStoryLinks(storedDraft?.storyLinks ?? story.links ?? []);
    setVisibility(storedDraft?.visibility ?? (story.visibility as "private" | "selected" | "public"));
    setAnonymous(storedDraft?.anonymous ?? story.anonymous);
    setChapters(uniqueChapters);
    setActiveChapter(resolvedActiveChapter);
    setIsStudioEditorOpen(true);
    setStudioMessage(`Loaded ${story.title}.`);
    setStudioNotice(null);
    invalidatePreviewReview();
    void hydrateStudioChaptersForMedia(accessToken, uniqueChapters, { storyId: story.id })
      .then((hydratedChapters) => {
        suppressAutoSavePassesRef.current += 2;
        setChapters(ensureUniqueStudioChapterTitles(hydratedChapters.length ? hydratedChapters : [createInitialStudioChapter(0)]));
      })
      .catch(() => undefined);
  };

  const startFreshStory = () => {
    const defaultVisibility =
      currentUser.defaultStoryVisibility === "public" ||
      currentUser.defaultStoryVisibility === "private" ||
      currentUser.defaultStoryVisibility === "selected"
        ? currentUser.defaultStoryVisibility
        : "selected";
    const initialChapter = createInitialStudioChapter(0);

    restoredLocalDraftRef.current = false;
    lastAutoSavedSignatureRef.current = "";
    localComparableStorySignatureRef.current = null;
    lastSyncedStudioSnapshotRef.current = null;
    currentStoryRevisionRef.current = 0;
    currentStoryStatusRef.current = "draft";
    currentStoryIdRef.current = null;
    chaptersRef.current = [initialChapter];
    imageAttachmentsRef.current = [];
    voiceNotesRef.current = [];
    if (chapterBodyRef.current) {
      chapterBodyRef.current.innerHTML = "";
    }

    setCurrentStoryId(null);
    setCurrentStoryStatus("draft");
    setCurrentStoryRevision(0);
    setCurrentStoryCanEdit(true);
    setCurrentStoryCollaborators([]);
    setCurrentStoryLastEditedByName(null);
    setCurrentStoryLastEditedByUsername(null);
    setCurrentStoryLastEditedAt(null);
    setCurrentStoryIsOwner(true);
    setRemoteCollaborationUpdate(null);
    setLiveChapterIndexes([]);
    setStoryTitle("");
    setStorySummary("");
    setStoryLinks([]);
    setVisibility(defaultVisibility);
    setAnonymous(currentUser.defaultStoryVisibility === "anonymous");
    setChapterType("memory");
    setAllowComments(currentUser.allowCommentsByDefault);
    setChapters([initialChapter]);
    setActiveChapter("Chapter 1");
    setImageAttachments([]);
    setVoiceNotes([]);
    setTimelineEntries(initialChapter.timelineEntries);
    setMediaError(null);
    setIsEditingChapterTitle(false);
    setChapterTitleDraft("");
    setIsStudioEditorOpen(true);
    setDraftHistory(["New story started."]);
    setStudioMessage("New story ready.");
    setStudioNotice(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(getStudioStorageKey(null));
      window.localStorage.removeItem(legacyStudioStorageKey);
      window.sessionStorage.removeItem("histora-studio-preview");
      window.sessionStorage.removeItem("histora-studio-publish-payload");
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
    if (requestedStudioStoryId) {
      setSearchParams({}, { replace: true });
    }
    invalidatePreviewReview();
  };

  useEffect(() => {
    let cancelled = false;
    setIsStoryLibraryLoading(true);

    void Promise.all([
      apiRequest<ApiStory[]>("/stories/mine", { accessToken }),
      apiRequest<ApiStory[]>("/stories/collaborative", { accessToken }).catch(() => [])
    ])
      .then(([stories, collaborativeStories]) => {
        if (cancelled) {
          return;
        }

        setStoryLibrary(stories);
        setCollaborationLibrary(collaborativeStories);
        setIsStoryLibraryLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsStoryLibraryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (requestedStudioStoryId) {
      collaborationRequestHandledRef.current = false;
    }
  }, [requestedStudioStoryId]);

  useEffect(() => {
    if (!requestedStudioStoryId || collaborationRequestHandledRef.current) {
      return;
    }

    const requestedStory =
      storyLibrary.find((story) => story.id === requestedStudioStoryId) ??
      collaborationLibrary.find((story) => story.id === requestedStudioStoryId);

    if (!requestedStory) {
      return;
    }

    collaborationRequestHandledRef.current = true;
    loadStoryIntoStudio(requestedStory);
    setSearchParams({}, { replace: true });
  }, [requestedStudioStoryId, storyLibrary, collaborationLibrary, setSearchParams]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("histora-studio-reviewed") === "true") {
      setHasReviewedPreview(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let hydrationTimer: number | null = null;

    try {
      const restoredDraft = requestedStudioStoryId
        ? readStoredStudioDraft({ storyId: requestedStudioStoryId })
        : readStoredStudioDraft({ allowUnsavedLocal: true });

      if (!restoredDraft) {
        return;
      }

      if (restoredDraft.activeChapter) {
        setActiveChapter(restoredDraft.activeChapter);
      }
      if (restoredDraft.currentStoryId) {
        setCurrentStoryId(restoredDraft.currentStoryId);
      }
      setCurrentStoryStatus(restoredDraft.currentStoryStatus);
      setLiveChapterIndexes(restoredDraft.liveChapterIndexes);
      setIsPremium(restoredDraft.isPremium);
      setVisibility(restoredDraft.visibility);
      setAnonymous(restoredDraft.anonymous);
      setStoryTitle(restoredDraft.storyTitle);
      setStorySummary(restoredDraft.storySummary);
      setStoryLinks(restoredDraft.storyLinks);
      setChapterType(restoredDraft.chapterType);
      setAllowComments(restoredDraft.allowComments);
      if (restoredDraft.chapters.length > 0) {
        restoredLocalDraftRef.current = true;
        const restoredChapters = restoredDraft.chapters;

        setChapters(ensureUniqueStudioChapterTitles(restoredChapters));
        void hydrateStudioChaptersForMedia(accessToken, restoredChapters, { storyId: restoredDraft.currentStoryId ?? null })
          .then((hydratedChapters) => {
            if (!cancelled) {
              setChapters(ensureUniqueStudioChapterTitles(hydratedChapters));
            }
          })
          .catch(() => undefined);
      }
      if (restoredDraft.timelineEntries.length > 0 && restoredDraft.chapters.length === 0) {
        restoredLocalDraftRef.current = true;
        setTimelineEntries(restoredDraft.timelineEntries);
      }
      if (restoredDraft.draftHistory.length > 0) {
        setDraftHistory(restoredDraft.draftHistory);
      }
      if (restoredDraft.transcriptionLanguage) {
        setTranscriptionLanguage(restoredDraft.transcriptionLanguage);
      }

      setStudioMessage("Autosaved draft restored.");
    } catch {
      setStudioMessage("Could not restore the last local studio draft.");
    } finally {
      hydrationTimer = window.setTimeout(() => {
        hasLoadedStudioDraftRef.current = true;
        setIsStudioDraftHydrated(true);
      }, 0);
    }

    return () => {
      cancelled = true;
      if (hydrationTimer) {
        window.clearTimeout(hydrationTimer);
      }
    };
  }, [accessToken, requestedStudioStoryId]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedStudioDraftRef.current || !isStudioDraftHydrated) {
      return;
    }

    const snapshotChapters = getLiveChaptersSnapshot();
    persistStudioDraftToStorage(snapshotChapters);
  }, [
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    currentStoryStatus,
    draftHistory,
    isPremium,
    currentStoryId,
    liveChapterIndexes,
    liveEditorBody,
    storySummary,
    storyTitle,
    storyLinks,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    isStudioDraftHydrated
  ]);

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  useEffect(() => {
    voiceNotesRef.current = voiceNotes;
  }, [voiceNotes]);

  useEffect(() => {
    timelineEntriesRef.current = timelineEntries;
  }, [timelineEntries]);

  useEffect(() => {
    if (isEnteringStudio) {
      return;
    }

    const editor = chapterBodyRef.current;
    if (editor && editor.innerHTML !== chapterBody) {
      editor.innerHTML = sanitizeStudioRichText(chapterBody);
    }
  }, [chapterBody, activeChapter, isEnteringStudio, isStudioEditorOpen]);

  useEffect(() => {
    return () => {
      imageAttachmentsRef.current.forEach((attachment) => {
        if (isBlobUrl(attachment.url)) {
          URL.revokeObjectURL(attachment.url);
        }
      });
      voiceNotesRef.current.forEach((voice) => {
        if (isBlobUrl(voice.url)) {
          URL.revokeObjectURL(voice.url);
        }
      });
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

  const appendImages = async (files: FileList | null, source: string, options?: { replaceTargetUrl?: string | null }) => {
    if (!files?.length) {
      return;
    }

    setMediaError(null);
    const replaceTargetUrl = options?.replaceTargetUrl ?? null;
    const replacementOriginal = replaceTargetUrl
      ? imageAttachments.find((attachment) => attachment.url === replaceTargetUrl) ?? null
      : null;
    const occupiedSlots = replaceTargetUrl
      ? imageAttachments.filter((attachment) => attachment.url !== replaceTargetUrl).length
      : imageAttachments.length;
    const remainingSlots = imageLimit - occupiedSlots;

    if (remainingSlots <= 0) {
      setMediaError("Image attachment limit reached. Upgrade to premium for more slots.");
      return;
    }

    const nextFiles = Array.from(files).slice(0, replaceTargetUrl ? 1 : remainingSlots);
    setVoiceRecordingStatus(replaceTargetUrl ? "Replacing image attachment..." : "Uploading image attachments...");
    const optimisticImages = nextFiles.map((file, index) => ({
      localId: `${Date.now()}-${index}-${file.name}`,
      replaceTargetUrl: replaceTargetUrl ?? undefined,
      name: file.name || `${source} image`,
      url: URL.createObjectURL(file),
      source: "Uploading image...",
      blob: file
    }));

    const optimisticImageAttachments = replaceTargetUrl
      ? imageAttachmentsRef.current.map((attachment) =>
          attachment.url === replaceTargetUrl ? optimisticImages[0] ?? attachment : attachment
        )
      : [...imageAttachmentsRef.current, ...optimisticImages];
    imageAttachmentsRef.current = optimisticImageAttachments;
    setImageAttachments(optimisticImageAttachments);
    updateActiveChapterMedia("imageAttachments", optimisticImageAttachments);

    void Promise.all(
      optimisticImages.map(async (attachment, index) => {
        const file = nextFiles[index];
        const uploaded = await uploadMediaAsset(accessToken, {
          blob: file,
          fileName: file.name || `${source} image.jpg`,
          contentType: file.type || "image/jpeg"
        });

        return {
          ...finalizeStudioAttachment(
            attachment,
            {
              url: uploaded.readUrl,
              source,
              objectKey: uploaded.objectKey
            },
            source
          ),
          localId: attachment.localId
        };
      })
    )
      .then((uploadedImages) => {
        const updatedImageAttachments = imageAttachmentsRef.current.map((attachment) => {
          const uploaded = uploadedImages.find((item) => item.localId === attachment.localId);
          if (!uploaded) {
            return attachment;
          }
          if (isBlobUrl(attachment.url)) {
            URL.revokeObjectURL(attachment.url);
          }
          return uploaded;
        });
        imageAttachmentsRef.current = updatedImageAttachments;
        setImageAttachments(updatedImageAttachments);
        updateActiveChapterMedia("imageAttachments", updatedImageAttachments);
        lastLocalMediaActivityAtRef.current = Date.now();
        const nextReason = replaceTargetUrl ? "image-replaced" : "image-uploaded";
        if (currentStoryIdRef.current && currentStoryCollaborators.length > 0 && currentStoryCanEdit) {
          void persistCollaborativeMediaDraft({ imageAttachments: updatedImageAttachments })
            .then(() => {
              queueCollaborativeDraftUpdate(nextReason, { immediate: true });
            })
            .catch((error) => {
              setStudioMessage(getErrorMessage(error, "Could not sync collaborative media yet."));
            });
        } else {
          queueCollaborativeDraftUpdate(nextReason, { immediate: true });
        }
        setVoiceRecordingStatus(replaceTargetUrl ? "Image replaced." : "Image attachments saved.");
      })
      .catch((error) => {
        optimisticImages.forEach((attachment) => {
          if (isBlobUrl(attachment.url)) {
            URL.revokeObjectURL(attachment.url);
          }
        });
        const currentImageAttachments = imageAttachmentsRef.current;
        let updatedImageAttachments = currentImageAttachments.filter(
          (attachment) => !optimisticImages.some((item) => item.localId === attachment.localId)
        );
        if (replaceTargetUrl && replacementOriginal) {
          const targetIndex = currentImageAttachments.findIndex((attachment) => attachment.url === replaceTargetUrl);
          if (targetIndex >= 0) {
            updatedImageAttachments = [
              ...updatedImageAttachments.slice(0, targetIndex),
              replacementOriginal,
              ...updatedImageAttachments.slice(targetIndex)
            ];
          } else {
            updatedImageAttachments = [replacementOriginal, ...updatedImageAttachments];
          }
        }
        imageAttachmentsRef.current = updatedImageAttachments;
        setImageAttachments(updatedImageAttachments);
        updateActiveChapterMedia("imageAttachments", updatedImageAttachments);
        setMediaError(getErrorMessage(error, "Could not save the selected images."));
        setVoiceRecordingStatus(replaceTargetUrl ? "Image replacement failed." : "Image upload failed.");
      });

    if (files.length > remainingSlots) {
      setMediaError("Some images were skipped because the current plan limit was reached.");
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const replaceTargetUrl = imageReplaceTargetUrl;
    setImageReplaceTargetUrl(null);
    void appendImages(event.target.files, "Upload", { replaceTargetUrl }).catch((error) => {
      setMediaError(getErrorMessage(error, "Could not save the selected images."));
    });
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
        const nextVoiceName = `Voice note ${voiceNotesRef.current.length + 1}`;
        const localId = `${Date.now()}-${nextVoiceName}`;

        const optimisticVoiceNotes = [
          ...voiceNotesRef.current,
          {
            localId,
            name: nextVoiceName,
            url,
            source: "Uploading voice note...",
            blob
          }
        ];
        voiceNotesRef.current = optimisticVoiceNotes;
        setVoiceNotes(optimisticVoiceNotes);
        updateActiveChapterMedia("voiceNotes", optimisticVoiceNotes);

        setVoiceRecordingStatus("Uploading voice note...");

        void uploadMediaAsset(accessToken, {
          blob,
          fileName: `${nextVoiceName}.webm`,
          contentType: blob.type || "audio/webm"
        })
          .then((uploaded) => {
            const updatedVoiceNotes = voiceNotesRef.current.map((voice) =>
              voice.localId === localId
                ? finalizeStudioAttachment(
                    voice,
                    {
                      url: uploaded.readUrl,
                      source: "Recorded in studio",
                      objectKey: uploaded.objectKey
                    },
                    "Recorded in studio"
                  )
                : voice
            );
            voiceNotesRef.current = updatedVoiceNotes;
            setVoiceNotes(updatedVoiceNotes);
            updateActiveChapterMedia("voiceNotes", updatedVoiceNotes);
            lastLocalMediaActivityAtRef.current = Date.now();
            if (currentStoryIdRef.current && currentStoryCollaborators.length > 0 && currentStoryCanEdit) {
              void persistCollaborativeMediaDraft({ voiceNotes: updatedVoiceNotes })
                .then(() => {
                  queueCollaborativeDraftUpdate("voice-uploaded", { immediate: true });
                })
                .catch((error) => {
                  setStudioMessage(getErrorMessage(error, "Could not sync collaborative media yet."));
                });
            } else {
              queueCollaborativeDraftUpdate("voice-uploaded", { immediate: true });
            }
            setVoiceRecordingStatus("Recording stopped. Voice note saved.");
          })
          .catch((error) => {
            const updatedVoiceNotes = voiceNotesRef.current.filter((voice) => voice.localId !== localId);
            voiceNotesRef.current = updatedVoiceNotes;
            setVoiceNotes(updatedVoiceNotes);
            updateActiveChapterMedia("voiceNotes", updatedVoiceNotes);
            if (isBlobUrl(url)) {
              URL.revokeObjectURL(url);
            }
            const message = getErrorMessage(error, "Could not upload the voice note.");
            setMediaError(`${message} Voice notes only appear after a successful upload.`);
            openStudioNotice("Voice note upload failed", `${message} Record again when your connection is stable.`, {
              target: "media"
            });
            setVoiceRecordingStatus("Voice note upload failed.");
          });

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingVoice(false);
        setIsVoiceRecordingPaused(false);
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
    lastLocalMediaActivityAtRef.current = Date.now();
    setImageAttachments((current) => {
      const target = current.find((attachment) => attachment.url === url);
      if (target && isBlobUrl(target.url)) {
        URL.revokeObjectURL(target.url);
      }
      const updated = current.filter((attachment) => attachment.url !== url);
      imageAttachmentsRef.current = updated;
      updateActiveChapterMedia("imageAttachments", updated);
      return updated;
    });
    queueCollaborativeDraftUpdate("image-removed", { immediate: true });
  };

  const openImageSlot = () => {
    setImageReplaceTargetUrl(null);
    imageInputRef.current?.click();
  };

  const replaceImageAttachment = (url: string) => {
    setImageReplaceTargetUrl(url);
    imageInputRef.current?.click();
  };

  const isMobileStudioViewport = () => typeof window !== "undefined" && window.innerWidth <= 820;

  const openVoiceSlot = () => {
    if (isMobileStudioViewport()) {
      setIsVoiceSheetOpen(true);
      return;
    }

    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }

    void startVoiceRecording();
  };

  const removeVoiceNote = (url: string) => {
    lastLocalMediaActivityAtRef.current = Date.now();
    setVoiceNotes((current) => {
      const target = current.find((voice) => voice.url === url);
      if (target && isBlobUrl(target.url)) {
        URL.revokeObjectURL(target.url);
      }
      const updated = current.filter((voice) => voice.url !== url);
      voiceNotesRef.current = updated;
      updateActiveChapterMedia("voiceNotes", updated);
      return updated;
    });
    queueCollaborativeDraftUpdate("voice-removed", { immediate: true });
  };

  const closeVoiceSheet = () => {
    if (isRecordingVoice) {
      return;
    }

    setIsVoiceSheetOpen(false);
  };

  const updateChapter = (updater: (chapter: StudioChapter) => StudioChapter) => {
    setChapters((current) =>
      current.map((chapter, index) => (index === (activeChapterIndex >= 0 ? activeChapterIndex : 0) ? updater(chapter) : chapter))
    );
  };

  const updateActiveChapterTitle = (nextTitle: string) => {
    lastLocalStoryMetaActivityAtRef.current = Date.now();
    setChapters((current) => {
      const safeIndex = activeChapterIndex >= 0 ? activeChapterIndex : 0;
      const uniqueTitle = getUniqueChapterTitle(nextTitle, current, { excludeIndex: safeIndex });
      const updatedChapters = current.map((chapter, index) =>
        index === safeIndex
          ? {
              ...chapter,
              title: uniqueTitle
            }
          : chapter
      );
      setActiveChapter(uniqueTitle);
      return updatedChapters;
    });
    invalidatePreviewReview();
    queueCollaborativeDraftUpdate("chapter-title");
  };

  const submitActiveChapterTitle = () => {
    updateActiveChapterTitle(chapterTitleDraft);
    setIsEditingChapterTitle(false);
  };

  const buildChaptersSnapshot = () => {
    const latestBody = getLatestChapterBody();
    const latestWords = getChapterWordCount(latestBody);
    const targetIndex = activeChapterIndex >= 0 ? activeChapterIndex : 0;
    const snapshot = chapters.map((chapter, index) =>
      index === targetIndex
        ? {
            ...chapter,
            body: latestBody,
            words: latestWords,
            imageAttachments: [...imageAttachments],
            voiceNotes: [...voiceNotes],
            timelineEntries: [...timelineEntries]
          }
        : chapter
    );
    setChapters(snapshot);
    return snapshot;
  };

  const getChapterMetrics = (sourceChapters: StudioChapter[]) =>
    sourceChapters.map((chapter) => ({
      ...chapter,
      words: getChapterWordCount(chapter.body),
      isComplete: isChapterComplete(chapter)
    }));

  const getLiveChaptersSnapshot = () => {
    const latestBody = getLatestChapterBody();
    const latestWords = getChapterWordCount(latestBody);
    const targetIndex = activeChapterIndex >= 0 ? activeChapterIndex : 0;

    return chapters.map((chapter, index) =>
      index === targetIndex
        ? {
            ...chapter,
            body: latestBody,
            words: latestWords,
            imageAttachments: [...imageAttachments],
            voiceNotes: [...voiceNotes],
            timelineEntries: [...timelineEntries]
          }
        : chapter
    );
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
    const sanitizedHtml = sanitizeStudioRichText(nextHtml);
    const selectionOffset = sanitizedHtml !== nextHtml ? getEditorSelectionCharacterOffset(editor) : null;
    if (editor.innerHTML !== sanitizedHtml) {
      editor.innerHTML = sanitizedHtml;
      if (selectionOffset !== null) {
        restoreEditorSelectionCharacterOffset(editor, selectionOffset);
      }
    }
    const nextText = getPlainTextFromHtml(sanitizedHtml);
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
    const nextSnapshot = chapters.map((chapter, index) =>
      index === (activeChapterIndex >= 0 ? activeChapterIndex : 0)
        ? {
            ...chapter,
            body: sanitizedHtml,
            words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length,
            imageAttachments: [...imageAttachmentsRef.current],
            voiceNotes: [...voiceNotesRef.current],
            timelineEntries: [...timelineEntries]
          }
        : chapter
    );
    updateChapter((chapter) => ({
      ...chapter,
      body: sanitizedHtml,
      words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length
    }));
    lastLocalEditorActivityAtRef.current = Date.now();
    queueCollaborativeDraftUpdate("body-input");
    persistStudioDraftToStorage(nextSnapshot);
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

  const openStudioNotice = (title: string, body: string, options?: { target?: StudioGuideTarget }) => {
    setStudioNotice({ title, body, target: options?.target });
    playStudioNoticeTone(noticeAudioContextRef);
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

  const getGuideTargetRef = (target: StudioGuideTarget) => {
    switch (target) {
      case "chapters":
        return chapterEditorSectionRef;
      case "storySetup":
        return mediaSectionRef;
      case "currentChapter":
        return publishSectionRef;
      case "media":
        return mediaAttachmentsSectionRef;
      case "timeline":
        return timelineSectionRef;
      case "links":
        return storyLinksSectionRef;
      case "privacy":
        return privacySectionRef;
      case "publish":
        return publishControlSectionRef;
      default:
        return chapterEditorSectionRef;
    }
  };

  const takeUserToStudioTarget = (target: StudioGuideTarget) => {
    setStudioNotice(null);
    scrollToSectionTop(getGuideTargetRef(target));
  };

  const guideToSection = (target: StudioGuideTarget, message: string, title = "Finish this step first") => {
    setStudioMessage(message);
    openStudioNotice(title, message, { target });
  };

  const getCurrentChapterIssueTarget = (): StudioGuideTarget => {
    if (currentChapterRequiredItems.length > 0) {
      return "currentChapter";
    }

    if (currentChapterOptionalItems.includes("attach an image") || currentChapterOptionalItems.includes("record a voice note")) {
      return "media";
    }

    if (currentChapterOptionalItems.includes("add a timeline moment")) {
      return "timeline";
    }

    return "currentChapter";
  };

  const saveCurrentDraft = (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    if (!isStudioEditorOpen) {
      if (!quiet) {
        setStudioMessage("Story library ready.");
      }
      return;
    }
    const snapshot = buildChaptersSnapshot();
    setChapters((current) =>
      current.map((chapter) =>
        chapter.title === activeChapter ? { ...chapter, status: "Draft saved", words: wordCount } : chapter
      )
    );

    if (currentStoryIdRef.current && !hasRemoteStudioBaselineLoaded()) {
      lastAutoSavedSignatureRef.current = autoSaveSignature;
      logStudioCollaboration("skip remote autosave until story baseline loads", {
        currentStoryId: currentStoryIdRef.current
      });
      return;
    }

    if (currentStudioMatchesLastSyncedStory()) {
      lastAutoSavedSignatureRef.current = autoSaveSignature;
      if (quiet) {
        setStudioMessage(
          currentStoryStatus === "published"
            ? "Live story is already in sync."
            : "All studio changes auto-saved."
        );
      }
      return;
    }

    if (currentStoryStatus !== "published" && canPersistStoryRemotely(snapshot)) {
      void ensureStoryMediaUploaded(snapshot)
        .then((uploadedChapters) => persistStory(buildStoryPayload("draft", uploadedChapters), "Autosaved."))
        .catch((error) => {
          setStudioMessage(getErrorMessage(error, "Could not upload chapter media."));
        });
    }

    if (quiet) {
      setStudioMessage(
        currentStoryStatus === "published"
          ? "Live story changes saved locally. Preview and republish to update the live version."
          : "All studio changes auto-saved."
      );
      return;
    }
    if (currentChapterRequiredItems.length > 0 || currentChapterOptionalItems.length > 0) {
      const missingRequiredText = currentChapterRequiredItems.length
        ? `Still required: ${currentChapterRequiredItems.join(", ")}.`
        : "";
      const optionalText = currentChapterOptionalItems.length
        ? ` Optional extras you can still add: ${currentChapterOptionalItems.join(", ")}.`
        : "";
      const noticeBody = `${activeChapterNumberLabel} saved locally. ${missingRequiredText}${optionalText}`.trim();
      setStudioMessage(`${activeChapterNumberLabel} saved with pending work.`);
      openStudioNotice("Chapter saved with pending items", noticeBody, {
        target: getCurrentChapterIssueTarget()
      });
      setDraftHistory((current) => [`${activeChapterNumberLabel} saved with pending items.`, ...current].slice(0, 6));
      return;
    }

    setStudioMessage(
      currentStoryStatus === "published"
        ? `${activeChapterNumberLabel} changes are saved locally. Preview and republish to update the live story.`
        : `${activeChapterNumberLabel} is saved and ready for preview.`
    );
    setDraftHistory((current) => [
      currentStoryStatus === "published"
        ? `${activeChapterNumberLabel} changes saved locally for the live story.`
        : `${activeChapterNumberLabel} saved as draft.`,
      ...current
    ].slice(0, 6));
  };

  useEffect(() => {
    if (!hasLoadedStudioDraftRef.current || !isStudioEditorOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (suppressAutoSavePassesRef.current > 0) {
        lastAutoSavedSignatureRef.current = autoSaveSignature;
        suppressAutoSavePassesRef.current -= 1;
        return;
      }

      if (autoSaveSignature === lastAutoSavedSignatureRef.current) {
        return;
      }

      if (!hasRemoteStudioBaselineLoaded()) {
        lastAutoSavedSignatureRef.current = autoSaveSignature;
        logStudioCollaboration("skip autosave timer until story baseline loads", {
          currentStoryId: currentStoryIdRef.current
        });
        return;
      }

      if (currentStudioMatchesLastSyncedStory()) {
        lastAutoSavedSignatureRef.current = autoSaveSignature;
        return;
      }

      if (currentStoryIdRef.current) {
        logStudioCollaboration("autosave mismatch before persist", getCurrentVsSyncedComparableState());
      }

      setIsAutoSavingDraft(true);
      saveCurrentDraft({ quiet: true });
      lastAutoSavedSignatureRef.current = autoSaveSignature;
      window.setTimeout(() => setIsAutoSavingDraft(false), 260);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    currentStoryId,
    imageAttachments,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    autoSaveSignature,
    isStudioEditorOpen
  ]);

  const publishWholeStory = () => {
    const snapshot = buildChaptersSnapshot();
    const metrics = getChapterMetrics(snapshot);
    const readyChaptersSnapshot = metrics.filter((chapter) => chapter.isComplete);
    const startedIncompleteChaptersSnapshot = metrics.filter((chapter) => !chapter.isComplete && chapter.words > 0);

    if (readyChaptersSnapshot.length === 0) {
      guideToSection(
        "currentChapter",
        `Finish at least one chapter before publishing. Chapters need a title and at least ${chapterCompletionThreshold} words.`
      );
      return;
    }

    if (!hasReviewedPreview) {
      openStudioNotice(
        "Review before publish",
        startedIncompleteChaptersSnapshot.length > 0
          ? `After preview review, these chapters will go live: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}. Unfinished chapters will stay as drafts: ${startedIncompleteChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`
          : `After preview review, these chapters will go live: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`,
        { target: "publish" }
      );
      void handlePreviewToggle();
      return;
    }

    setChapters((current) =>
      current.map((chapter) =>
        readyChaptersSnapshot.some((readyChapter) => readyChapter.title === chapter.title)
          ? { ...chapter, status: "Published", words: getChapterWordCount(chapter.body) }
          : chapter
      )
    );
    void ensureStoryMediaUploaded(snapshot)
      .then((uploadedChapters) => persistStory(buildStoryPayload("published", uploadedChapters), "Story published."))
      .catch((error) => {
        setStudioMessage(getErrorMessage(error, "Could not publish story media."));
      });
    setStudioMessage(
      startedIncompleteChaptersSnapshot.length > 0
        ? `Publishing ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}. Unfinished chapters stay in draft.`
        : `Publishing ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")} as ${anonymous ? "anonymous" : visibility}.`
    );
    setDraftHistory((current) => [
      startedIncompleteChaptersSnapshot.length > 0
        ? `Published: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}. Drafts kept: ${startedIncompleteChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`
        : `Story published with chapters: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`,
      ...current
    ].slice(0, 6));
  };

  const ensureStudioAttachmentUploaded = async (
    attachment: StudioMediaAttachment,
    fallbackExtension: string,
    fallbackType: string,
    fallbackSource: string
  ) => {
    if (attachment.objectKey) {
      return finalizeStudioAttachment(attachment, {}, fallbackSource);
    }

    if (!attachment.blob) {
      return sanitizeStudioAttachment(attachment, fallbackSource);
    }

    const contentType = attachment.blob.type || fallbackType;
    const fileName = attachment.name.includes(".") ? attachment.name : `${attachment.name}${fallbackExtension}`;
    const uploaded = await uploadMediaAsset(accessToken, {
      blob: attachment.blob,
      fileName,
      contentType
    });

    return finalizeStudioAttachment(
      attachment,
      {
      objectKey: uploaded.objectKey,
      url: uploaded.readUrl
      },
      fallbackSource
    );
  };

  const ensureStoryMediaUploaded = async (sourceChapters: StudioChapter[]) => {
    const uploadedChapters = await Promise.all(
      sourceChapters.map(async (chapter) => {
        const uploadedImages = await Promise.all(
          chapter.imageAttachments.map((attachment) =>
            ensureStudioAttachmentUploaded(attachment, ".jpg", attachment.blob?.type || "image/jpeg", "Upload")
          )
        );
        const uploadedVoiceNotes = await Promise.all(
          chapter.voiceNotes.map((voice) =>
            ensureStudioAttachmentUploaded(voice, ".webm", voice.blob?.type || "audio/webm", "Recorded in studio")
          )
        );

        return {
          ...chapter,
          imageAttachments: uploadedImages,
          voiceNotes: uploadedVoiceNotes
        };
      })
    );

    setChapters(uploadedChapters);
    return uploadedChapters;
  };

  const sanitizePreviewChaptersForCurrentPlan = (sourceChapters: StudioChapter[]) => {
    const persistableChapters = sourceChapters
      .filter((chapter) => isPersistableStudioChapter(chapter))
      .slice(0, chapterLimit);

    const orderedIndexes = [
      activeChapterIndex >= 0 ? activeChapterIndex : 0,
      ...persistableChapters.map((_, index) => index).filter((index) => index !== (activeChapterIndex >= 0 ? activeChapterIndex : 0))
    ];

    const allowedImageKeys = new Set<string>();
    const allowedVoiceKeys = new Set<string>();
    let remainingImages = imageLimit;
    let remainingVoices = voiceLimit;

    for (const index of orderedIndexes) {
      const chapter = persistableChapters[index];
      if (!chapter) {
        continue;
      }

      for (const attachment of chapter.imageAttachments) {
        const key = attachment.objectKey ?? attachment.url;
        if (!key || allowedImageKeys.has(key) || remainingImages <= 0) {
          continue;
        }
        allowedImageKeys.add(key);
        remainingImages -= 1;
      }

      for (const voice of chapter.voiceNotes) {
        const key = voice.objectKey ?? voice.url;
        if (!key || allowedVoiceKeys.has(key) || remainingVoices <= 0) {
          continue;
        }
        allowedVoiceKeys.add(key);
        remainingVoices -= 1;
      }
    }

    return persistableChapters.map((chapter) => {
      if (isPremium) {
        return chapter;
      }

      return {
        ...chapter,
        imageAttachments: chapter.imageAttachments.filter((attachment) => {
          const key = attachment.objectKey ?? attachment.url;
          return Boolean(key && allowedImageKeys.has(key));
        }),
        voiceNotes: chapter.voiceNotes.filter((voice) => {
          const key = voice.objectKey ?? voice.url;
          return Boolean(key && allowedVoiceKeys.has(key));
        })
      };
    });
  };

  const buildStoryPayload = (
    status: "draft" | "published",
    sourceChapters: StudioChapter[]
  ): StudioPublishPayload["payload"] => {
    const persistedChapters = sourceChapters.filter((chapter) => isPersistableStudioChapter(chapter));

    return {
      title: storyTitle,
      summary: storySummary,
      coverImageUrl: (() => {
        const firstImage = persistedChapters.flatMap((chapter) => chapter.imageAttachments)[0];
        return firstImage?.objectKey ?? extractStudioOwnedObjectKey(firstImage?.url) ?? undefined;
      })(),
      visibility: anonymous ? "public" : visibility,
      anonymous,
      allowedViewerIds: [],
      tags: [],
      links: storyLinks.filter((link) => link.label.trim() && link.url.trim()),
      status,
      expectedRevision: currentStoryId ? currentStoryRevision : undefined,
      chapters: persistedChapters.map((chapter, index) => ({
        id: chapter.id,
        title: chapter.title,
        body: sanitizeStudioRichText(chapter.body),
        type:
          chapter.type.toLowerCase() === "anon"
            ? "anonymous"
            : (chapter.type.toLowerCase() as "memory" | "reflection" | "milestone" | "anonymous"),
        order: index + 1,
        imageUrls: chapter.imageAttachments
          .map((attachment) => attachment.objectKey ?? extractStudioOwnedObjectKey(attachment.url) ?? attachment.url)
          .filter(Boolean),
        voiceNoteUrl: (() => {
          const voice = chapter.voiceNotes[0];
          return voice ? voice.objectKey ?? extractStudioOwnedObjectKey(voice.url) ?? voice.url : undefined;
        })(),
        moments: chapter.timelineEntries
          .filter((entry) => entry.title.trim() || entry.body.trim())
          .map((entry) => ({
            id: entry.id,
            title: entry.title,
            description: entry.body,
            happenedAt: new Date(
              `${entry.year || currentYear}-${entry.month || "01"}-${entry.day || "01"}T00:00:00.000Z`
            ).toISOString(),
            imageUrls: [],
            voiceNoteUrl: undefined
          }))
      }))
    };
  };

  const buildLocalComparableStorySignature = () =>
    serializeComparableStoryPayload(
      toComparableStoryPayload(buildStoryPayload(currentStoryStatusRef.current, getLiveChaptersSnapshot()))
    );

  useEffect(() => {
    if (!currentStoryId) {
      localComparableStorySignatureRef.current = null;
      return;
    }

    localComparableStorySignatureRef.current = buildLocalComparableStorySignature();
  }, [
    activeChapter,
    anonymous,
    chapters,
    currentStoryId,
    currentStoryStatus,
    imageAttachments,
    liveEditorBody,
    storyLinks,
    storySummary,
    storyTitle,
    timelineEntries,
    visibility,
    voiceNotes
  ]);

  useEffect(() => {
    currentStudioSnapshotRef.current = createCurrentStudioStorySnapshot();
  }, [
    activeChapter,
    anonymous,
    chapters,
    currentStoryStatus,
    imageAttachments,
    liveEditorBody,
    storyLinks,
    storySummary,
    storyTitle,
    timelineEntries,
    visibility,
    voiceNotes
  ]);

  const sendCollaborativeDraftUpdate = (reason: string) => {
    const storyId = currentStoryIdRef.current;
    const snapshot = buildCollaborativeDraftSnapshot();
    if (!storyId || !snapshot || !appEventsConnectionRef.current || currentStoryCollaborators.length === 0 || !currentStoryCanEdit) {
      return;
    }

    const payload = {
      type: "story-draft-update" as const,
      storyId,
      draftSessionId: collaborativeDraftSessionIdRef.current,
      reason,
      snapshot
    };
    const serializedSize = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(JSON.stringify(payload)).length
      : JSON.stringify(payload).length;

    if (serializedSize > 60_000) {
      logStudioCollaboration("skip draft update payload too large", {
        storyId,
        reason,
        serializedSize
      });
      return;
    }

    appEventsConnectionRef.current.send(payload);
    logStudioCollaboration("sent draft update", {
      storyId,
      reason,
      activeChapter: snapshot.activeChapterTitle,
      bodyLength: snapshot.chapter.body.length,
      imageCount: snapshot.chapter.imageAttachments.length
    });
  };

  const queueCollaborativeDraftUpdate = (reason: string, options?: { immediate?: boolean }) => {
    if (!currentStoryIdRef.current || currentStoryCollaborators.length === 0 || !currentStoryCanEdit) {
      return;
    }

    if (collaborativeDraftBroadcastTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(collaborativeDraftBroadcastTimerRef.current);
      collaborativeDraftBroadcastTimerRef.current = null;
    }

    if (collaborativeDraftBroadcastFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(collaborativeDraftBroadcastFrameRef.current);
      collaborativeDraftBroadcastFrameRef.current = null;
    }

    if (typeof window === "undefined") {
      sendCollaborativeDraftUpdate(reason);
      return;
    }

    if (options?.immediate) {
      collaborativeDraftBroadcastFrameRef.current = window.requestAnimationFrame(() => {
        collaborativeDraftBroadcastFrameRef.current = null;
        collaborativeDraftBroadcastTimerRef.current = window.setTimeout(() => {
          collaborativeDraftBroadcastTimerRef.current = null;
          sendCollaborativeDraftUpdate(reason);
        }, 0);
      });
      return;
    }

    collaborativeDraftBroadcastTimerRef.current = window.setTimeout(() => {
      collaborativeDraftBroadcastTimerRef.current = null;
      sendCollaborativeDraftUpdate(reason);
    }, 320);
  };

  const applyCollaborativeDraftSnapshot = (
    snapshot: StudioCollaborativeDraftSnapshot,
    options?: { updatedByName?: string; updatedByUsername?: string; reason?: string }
  ) => {
    const receivedAt = Date.now();
    const protectStoryMeta = receivedAt - lastLocalStoryMetaActivityAtRef.current < 1200;
    const protectActiveBody = receivedAt - lastLocalEditorActivityAtRef.current < 1200;
    const protectActiveMedia = receivedAt - lastLocalMediaActivityAtRef.current < 1200;
    const sanitizedRemoteChapter = serializeStudioChapterForDraftSync(snapshot.chapter);

    suppressAutoSavePassesRef.current += 4;

    if (!protectStoryMeta) {
      setStoryTitle(snapshot.title);
      setStorySummary(snapshot.summary);
      setStoryLinks(snapshot.links);
      setVisibility(snapshot.visibility);
      setAnonymous(snapshot.anonymous);
    }

    setChapters((current) => {
      const targetIndex = findCollaborativeChapterIndex(current, snapshot);
      const nextChapters = [...current];
      const existingChapter =
        targetIndex >= 0
          ? nextChapters[targetIndex]
          : createInitialStudioChapter(Math.max(snapshot.activeChapterIndex, 0));
      const targetIsActive = (targetIndex >= 0 ? targetIndex : snapshot.activeChapterIndex) === (activeChapterIndex >= 0 ? activeChapterIndex : 0);
      const mergedChapter: StudioChapter = {
        ...existingChapter,
        ...sanitizedRemoteChapter,
        body: targetIsActive && protectActiveBody ? existingChapter.body : sanitizedRemoteChapter.body,
        words:
          targetIsActive && protectActiveBody
            ? existingChapter.words
            : getChapterWordCount(sanitizedRemoteChapter.body),
        imageAttachments:
          targetIsActive && protectActiveMedia
            ? existingChapter.imageAttachments
            : sanitizedRemoteChapter.imageAttachments,
        voiceNotes:
          targetIsActive && protectActiveMedia
            ? existingChapter.voiceNotes
            : sanitizedRemoteChapter.voiceNotes,
        timelineEntries:
          targetIsActive && protectActiveMedia
            ? existingChapter.timelineEntries
            : sanitizedRemoteChapter.timelineEntries
      };

      if (targetIndex >= 0) {
        nextChapters[targetIndex] = mergedChapter;
      } else {
        nextChapters.splice(Math.max(snapshot.activeChapterIndex, 0), 0, mergedChapter);
      }

      return nextChapters;
    });

    const activeIndex = activeChapterIndex >= 0 ? activeChapterIndex : 0;
    const targetIndex = findCollaborativeChapterIndex(chaptersRef.current, snapshot);
    if ((targetIndex >= 0 ? targetIndex : snapshot.activeChapterIndex) === activeIndex) {
      if (!protectActiveMedia) {
        setImageAttachments(sanitizedRemoteChapter.imageAttachments);
        setVoiceNotes(sanitizedRemoteChapter.voiceNotes);
        setTimelineEntries(sanitizedRemoteChapter.timelineEntries);
      }
    }

    const activeStoryId = currentStoryIdRef.current;
    if (activeStoryId && !protectActiveMedia) {
      void hydrateStudioChapterMediaWithRetry(accessToken, sanitizedRemoteChapter, { storyId: activeStoryId })
        .then((hydratedRemoteChapter) => {
          if (!hydratedRemoteChapter || currentStoryIdRef.current !== activeStoryId) {
            return;
          }

          setChapters((current) => {
            const hydratedTargetIndex = findCollaborativeChapterIndex(current, snapshot);
            if (hydratedTargetIndex < 0) {
              return current;
            }

            const currentChapter = current[hydratedTargetIndex];
            if (!currentChapter) {
              return current;
            }

            const imageCollectionStillPendingHydration = attachmentCollectionsMatch(
              currentChapter.imageAttachments,
              sanitizedRemoteChapter.imageAttachments
            );
            const voiceCollectionStillPendingHydration = attachmentCollectionsMatch(
              currentChapter.voiceNotes,
              sanitizedRemoteChapter.voiceNotes
            );

            if (!imageCollectionStillPendingHydration && !voiceCollectionStillPendingHydration) {
              return current;
            }

            const nextChapters = [...current];
            nextChapters[hydratedTargetIndex] = {
              ...currentChapter,
              imageAttachments: imageCollectionStillPendingHydration
                ? hydratedRemoteChapter.imageAttachments
                : currentChapter.imageAttachments,
              voiceNotes: voiceCollectionStillPendingHydration
                ? hydratedRemoteChapter.voiceNotes
                : currentChapter.voiceNotes
            };
            return nextChapters;
          });

          const latestActiveIndex = Math.max(
            chaptersRef.current.findIndex((chapter) => chapter.title === activeChapterRef.current),
            0
          );
          const latestTargetIndex = findCollaborativeChapterIndex(chaptersRef.current, snapshot);
          if ((latestTargetIndex >= 0 ? latestTargetIndex : snapshot.activeChapterIndex) === latestActiveIndex) {
            setImageAttachments((current) =>
              attachmentCollectionsMatch(current, sanitizedRemoteChapter.imageAttachments)
                ? hydratedRemoteChapter.imageAttachments
                : current
            );
            setVoiceNotes((current) =>
              attachmentCollectionsMatch(current, sanitizedRemoteChapter.voiceNotes)
                ? hydratedRemoteChapter.voiceNotes
                : current
            );
          }

          logStudioCollaboration("hydrated draft media", {
            storyId: activeStoryId,
            updatedByName: options?.updatedByName,
            updatedByUsername: options?.updatedByUsername,
            reason: options?.reason ?? "draft-update",
            imageCount: hydratedRemoteChapter.imageAttachments.length,
            voiceCount: hydratedRemoteChapter.voiceNotes.length
          });
        })
        .catch(() => undefined);
    }

    logStudioCollaboration("applied draft update", {
      storyId: currentStoryIdRef.current,
      updatedByName: options?.updatedByName,
      updatedByUsername: options?.updatedByUsername,
      reason: options?.reason ?? "draft-update",
      activeChapter: snapshot.activeChapterTitle,
      protectStoryMeta,
      protectActiveBody,
      protectActiveMedia,
      imageCount: sanitizedRemoteChapter.imageAttachments.length
    });
  };

  const applyMergedRemoteStoryState = (
    story: ApiStory,
    mergedSnapshot: StudioStorySnapshot,
    message: string
  ) => {
    const mergedChapters = ensureUniqueStudioChapterTitles(
      mergedSnapshot.chapters.length ? mergedSnapshot.chapters : [createInitialStudioChapter(0)]
    );

    suppressAutoSavePassesRef.current += 1;
    setCurrentStoryId(story.id);
    currentStoryIdRef.current = story.id;
    setCurrentStoryStatus(story.status);
    currentStoryStatusRef.current = story.status;
    setCurrentStoryRevision(story.collaborationRevision ?? 0);
    currentStoryRevisionRef.current = story.collaborationRevision ?? 0;
    setCurrentStoryCanEdit(story.canEdit ?? true);
    setCurrentStoryCollaborators(story.collaborators ?? []);
    setCurrentStoryLastEditedByName(story.lastEditedByName ?? null);
    setCurrentStoryLastEditedByUsername(story.lastEditedByUsername ?? null);
    setCurrentStoryLastEditedAt(story.lastEditedAt ?? null);
    setCurrentStoryIsOwner(Boolean(story.isOwner ?? true));
    setRemoteCollaborationUpdate(null);
    setLiveChapterIndexes(story.status === "published" ? story.chapters.map((_, index) => index) : []);
    setStoryTitle(mergedSnapshot.title);
    setStorySummary(mergedSnapshot.summary);
    setStoryLinks(mergedSnapshot.links);
    setVisibility(mergedSnapshot.visibility);
    setAnonymous(mergedSnapshot.anonymous);
    setChapters(mergedChapters);
    setActiveChapter(mergedChapters[0]?.title ?? "Chapter 1");
    setIsStudioEditorOpen(true);
    setStudioMessage(message);
    setStudioNotice(null);
    invalidatePreviewReview();
    lastSyncedStudioSnapshotRef.current = createStudioStorySnapshotFromStory(story);
    void hydrateStudioChaptersForMedia(accessToken, mergedChapters, { storyId: story.id })
      .then((hydratedChapters) => {
        suppressAutoSavePassesRef.current += 2;
        setChapters(
          ensureUniqueStudioChapterTitles(hydratedChapters.length ? hydratedChapters : [createInitialStudioChapter(0)])
        );
      })
      .catch(() => undefined);
  };

  const applyRemoteStoryMetadata = (story: ApiStory, revisionFallback = 0) => {
    setCurrentStoryStatus(story.status);
    currentStoryStatusRef.current = story.status;
    setCurrentStoryRevision(story.collaborationRevision ?? revisionFallback);
    currentStoryRevisionRef.current = story.collaborationRevision ?? revisionFallback;
    lastSyncedStudioSnapshotRef.current = createStudioStorySnapshotFromStory(story);
    setCurrentStoryCanEdit(story.canEdit ?? true);
    setCurrentStoryCollaborators(story.collaborators ?? []);
    setCurrentStoryLastEditedByName(story.lastEditedByName ?? null);
    setCurrentStoryLastEditedByUsername(story.lastEditedByUsername ?? null);
    setCurrentStoryLastEditedAt(story.lastEditedAt ?? null);
    setCurrentStoryIsOwner(Boolean(story.isOwner ?? true));
    setRemoteCollaborationUpdate(null);
  };

  const syncCollaborativeStoryFromRemote = async (
    storyId: string,
    options?: {
      manual?: boolean;
      revisionFallback?: number;
      updatedByName?: string;
      updatedByUsername?: string;
      updatedAt?: string;
    }
  ) => {
    const latestStory = await apiRequest<ApiStory>(`/stories/mine/${storyId}`, { accessToken });
    if (currentStoryIdRef.current !== storyId) {
      return;
    }

    if ((latestStory.collaborationRevision ?? 0) < currentStoryRevisionRef.current) {
      return;
    }

    const remoteComparableSignature = serializeComparableStoryPayload(buildComparableApiStoryPayload(latestStory));
    if (remoteComparableSignature === localComparableStorySignatureRef.current) {
      applyRemoteStoryMetadata(latestStory, options?.revisionFallback ?? 0);
      return;
    }

    const remoteSnapshot = createStudioStorySnapshotFromStory(latestStory);
    const localSnapshot = currentStudioSnapshotRef.current ?? createCurrentStudioStorySnapshot();
    const mergedSnapshot = mergeRemoteStoryWithLocalDraft(
      lastSyncedStudioSnapshotRef.current,
      localSnapshot,
      remoteSnapshot
    );

    applyMergedRemoteStoryState(
      latestStory,
      mergedSnapshot,
      options?.manual
        ? "Loaded the latest collaborative version and merged your local draft."
        : `${options?.updatedByName ?? "A collaborator"} changed this story. Changes synced live.`
    );
    setDraftHistory((current) => [
      options?.manual
        ? "Latest collaborative version merged into local draft."
        : `${options?.updatedByName ?? "A collaborator"} synced a collaborative update.`,
      ...current
    ].slice(0, 6));
  };

  const validateStoryBeforePersist = () => {
    const summaryWords = storySummary.trim().split(/\s+/).filter(Boolean).length;

    if (storyTitle.trim().length < 3) {
      const message = "Add a clearer story title before continuing.";
      setStudioMessage(message);
      openStudioNotice("Story title too short", message, { target: "storySetup" });
      return false;
    }

    if (summaryWords < 20) {
      const message = `Add a fuller story summary with at least 20 words. You currently have ${summaryWords}.`;
      setStudioMessage(message);
      openStudioNotice("Story summary needs more detail", message, { target: "storySetup" });
      return false;
    }

    return true;
  };

  const persistStory = async (payload: ReturnType<typeof buildStoryPayload>, successMessage: string) => {
    const nextPersist = persistStoryQueueRef.current
      .catch(() => null)
      .then(async () => {
        const targetStoryId = currentStoryIdRef.current;

        console.info("[studio] persist story payload", {
          currentStoryId: targetStoryId,
          title: payload.title,
          status: payload.status,
          chapterCount: payload.chapters.length,
          imageCount: payload.chapters.reduce((sum, chapter) => sum + chapter.imageUrls.length, 0),
          voiceCount: payload.chapters.reduce((sum, chapter) => sum + (chapter.voiceNoteUrl ? 1 : 0), 0),
          chapterTitles: payload.chapters.map((chapter) => chapter.title)
        });

        const story = targetStoryId
          ? await apiRequest<ApiStory>(`/stories/${targetStoryId}`, {
              method: "PATCH",
              accessToken,
              body: payload
            })
          : await apiRequest<ApiStory>("/stories", {
              method: "POST",
              accessToken,
              body: payload
            });

        currentStoryIdRef.current = story.id;
        setCurrentStoryId(story.id);
        setCurrentStoryStatus(story.status);
        setCurrentStoryRevision(story.collaborationRevision ?? 0);
        currentStoryRevisionRef.current = story.collaborationRevision ?? 0;
        currentStoryStatusRef.current = story.status;
        lastSyncedStudioSnapshotRef.current = createStudioStorySnapshotFromStory(story);
        setCurrentStoryCanEdit(story.canEdit ?? true);
        setCurrentStoryCollaborators(story.collaborators ?? []);
        setCurrentStoryLastEditedByName(story.lastEditedByName ?? null);
        setCurrentStoryLastEditedByUsername(story.lastEditedByUsername ?? null);
        setCurrentStoryLastEditedAt(story.lastEditedAt ?? null);
        setCurrentStoryIsOwner(Boolean(story.isOwner ?? true));
        setRemoteCollaborationUpdate(null);
        setLiveChapterIndexes(
          story.status === "published"
            ? story.chapters.map((_, index) => index)
            : []
        );
        setStoryLibrary((current) => {
          const next = [story, ...current.filter((entry) => entry.id !== story.id)];
          return next.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
        });
        setStudioMessage(successMessage);
        setDraftHistory((current) => [successMessage, ...current].slice(0, 6));
        return story;
      })
      .catch((error) => {
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "STORY_REVISION_CONFLICT") {
          setStudioMessage("A collaborator saved a newer version. Your local draft is still safe on this device.");
          openStudioNotice(
            "New collaborative version available",
            "A collaborator saved a newer version before this save completed. Load the latest version to continue from their changes, or keep your local draft and merge carefully.",
            { target: "publish" }
          );
        }
        throw error;
      });

    persistStoryQueueRef.current = nextPersist;
    return await nextPersist;
  };

  const persistCollaborativeMediaDraft = async (overrides?: {
    imageAttachments?: StudioMediaAttachment[];
    voiceNotes?: StudioMediaAttachment[];
    timelineEntries?: StudioTimelineEntry[];
    latestBody?: string;
  }) => {
    if (!currentStoryIdRef.current || currentStoryCollaborators.length === 0 || !currentStoryCanEdit) {
      return null;
    }

    if (!hasRemoteStudioBaselineLoaded()) {
      return null;
    }

    const latestBody = overrides?.latestBody ?? getLatestChapterBody();
    const targetIndex = Math.max(
      chaptersRef.current.findIndex((chapter) => chapter.title === activeChapterRef.current),
      0
    );
    const collaborativeSnapshotChapters = chaptersRef.current.map((chapter, index) =>
      index === targetIndex
        ? {
            ...chapter,
            body: latestBody,
            words: getChapterWordCount(latestBody),
            imageAttachments: sanitizeStudioAttachments([...(overrides?.imageAttachments ?? imageAttachmentsRef.current)]),
            voiceNotes: sanitizeStudioAttachments([...(overrides?.voiceNotes ?? voiceNotesRef.current)], "Recorded in studio"),
            timelineEntries:
              [...(overrides?.timelineEntries ?? timelineEntriesRef.current)].length
                ? [...(overrides?.timelineEntries ?? timelineEntriesRef.current)]
                : [createEmptyTimelineEntry()]
          }
        : chapter
    );

    if (!canPersistStoryRemotely(collaborativeSnapshotChapters)) {
      return null;
    }

    return await persistStory(buildStoryPayload("draft", collaborativeSnapshotChapters), "Autosaved.");
  };

  const loadLatestCollaborativeVersion = async () => {
    if (!currentStoryId) {
      return;
    }

    try {
      await syncCollaborativeStoryFromRemote(currentStoryId, { manual: true });
    } catch (error) {
      setStudioMessage(getErrorMessage(error, "Could not load the latest collaborative version."));
    }
  };

  useEffect(() => {
    const connection = createAppEventsConnection(accessToken, {
      onOpen: () => {
        logStudioCollaboration("events socket open", { userId: currentUser.id });
      },
      onClose: () => {
        logStudioCollaboration("events socket close", { userId: currentUser.id });
      },
      onError: () => {
        logStudioCollaboration("events socket error", { userId: currentUser.id });
      },
      onMessage: (rawMessage) => {
      const message = rawMessage as {
        type?: string;
        channel?: string;
        payload?: {
          kind?: string;
          storyId?: string;
          draftSessionId?: string;
          reason?: string;
          snapshot?: StudioCollaborativeDraftSnapshot;
          revision?: number;
          updatedAt?: string;
          updatedByName?: string;
          updatedByUsername?: string;
        };
      };

      if (
        message.type !== "event" ||
        message.channel !== `user:${currentUser.id}` ||
        !message.payload ||
        !currentStoryIdRef.current ||
        message.payload.storyId !== currentStoryIdRef.current
      ) {
        return;
      }

      const payload = message.payload;

      if (
        payload.kind === "story.collaboration.draft.updated" &&
        payload.draftSessionId !== collaborativeDraftSessionIdRef.current &&
        payload.snapshot?.chapter &&
        typeof payload.snapshot.activeChapterTitle === "string"
      ) {
        logStudioCollaboration("received draft update", {
          storyId: payload.storyId,
          updatedByName: payload.updatedByName,
          updatedByUsername: payload.updatedByUsername,
          reason: payload.reason ?? "draft-update",
          draftSessionId: payload.draftSessionId
        });
        applyCollaborativeDraftSnapshot(payload.snapshot, {
          updatedByName: payload.updatedByName,
          updatedByUsername: payload.updatedByUsername,
          reason: payload.reason
        });
        return;
      }

      if (
        payload.kind !== "story.collaboration.updated" ||
        (payload.updatedByUsername ?? "").toLowerCase() === currentUser.username.toLowerCase()
      ) {
        return;
      }

      const nextRevision = payload.revision ?? 0;
      if (nextRevision <= currentStoryRevisionRef.current) {
        return;
      }

      const targetStoryId = currentStoryIdRef.current;
      if (!targetStoryId) {
        return;
      }

      void syncCollaborativeStoryFromRemote(targetStoryId, {
        revisionFallback: nextRevision,
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
        updatedByName: payload.updatedByName ?? "A collaborator",
        updatedByUsername: payload.updatedByUsername ?? "collaborator"
      })
        .catch(() => {
          setRemoteCollaborationUpdate({
            revision: nextRevision,
            updatedAt: payload.updatedAt ?? new Date().toISOString(),
            updatedByName: payload.updatedByName ?? "A collaborator",
            updatedByUsername: payload.updatedByUsername ?? "collaborator"
          });
          setStudioMessage(`${payload.updatedByName ?? "A collaborator"} updated this story. Tap to sync the latest version.`);
        });
      }
    });
    connection.subscribe([`user:${currentUser.id}`]);
    appEventsConnectionRef.current = connection;

    return () => {
      appEventsConnectionRef.current = null;
      if (collaborativeDraftBroadcastFrameRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(collaborativeDraftBroadcastFrameRef.current);
        collaborativeDraftBroadcastFrameRef.current = null;
      }
      if (collaborativeDraftBroadcastTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(collaborativeDraftBroadcastTimerRef.current);
        collaborativeDraftBroadcastTimerRef.current = null;
      }
      connection.close();
    };
  }, [accessToken, currentUser.id, currentUser.username]);

  const updateTimelineEntry = (index: number, field: "title" | "body", value: string) => {
    lastLocalMediaActivityAtRef.current = Date.now();
    setTimelineEntries((current) => {
      const updated = current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry));
      timelineEntriesRef.current = updated;
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    invalidatePreviewReview();
    queueCollaborativeDraftUpdate("timeline-updated");
  };

  const updateStoryLink = (index: number, field: keyof StudioExternalLink, value: string) => {
    setStoryLinks((current) => current.map((link, linkIndex) => (linkIndex === index ? { ...link, [field]: value } : link)));
    invalidatePreviewReview();
  };

  const addChapter = () => {
    if (chapters.length >= chapterLimit) {
      const message = isPremium
        ? "Chapter limit reached for this plan."
        : "Free users can write in the first 2 chapters only.";
      setStudioMessage(message);
      openStudioNotice("Chapter limit reached", message, { target: "chapters" });
      return;
    }

    const nextChapter = {
      ...createInitialStudioChapter(chapters.length),
      title: getUniqueChapterTitle(`Chapter ${chapters.length + 1}`, chapters)
    };
    setChapters((current) => ensureUniqueStudioChapterTitles([...current, nextChapter]));
    setActiveChapter(nextChapter.title);
    setIsStudioEditorOpen(true);
    setStudioMessage(`${nextChapter.title} added.`);
    setDraftHistory((current) => [`${nextChapter.title} added.`, ...current].slice(0, 6));
    invalidatePreviewReview();
  };

  const addStoryLink = () => {
    setStoryLinks((current) => [...current, createEmptyStoryLink()]);
    setStudioMessage("Story link slot added.");
  };

  const removeStoryLink = (index: number) => {
    setStoryLinks((current) => current.filter((_, linkIndex) => linkIndex !== index));
    setStudioMessage("Story link removed.");
    invalidatePreviewReview();
  };

  const addTimelineEntry = () => {
    lastLocalMediaActivityAtRef.current = Date.now();
    setTimelineEntries((current) => {
      const updated = [
        ...current,
        createEmptyTimelineEntry()
      ];
      timelineEntriesRef.current = updated;
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    setStudioMessage("New timeline moment added.");
    setDraftHistory((current) => ["Timeline moment added.", ...current].slice(0, 6));
    queueCollaborativeDraftUpdate("timeline-added", { immediate: true });
  };

  const removeTimelineEntry = (index: number) => {
    lastLocalMediaActivityAtRef.current = Date.now();
    setTimelineEntries((current) => {
      const filtered = current.filter((_, entryIndex) => entryIndex !== index);
      const updated = filtered.length ? filtered : [createEmptyTimelineEntry()];
      timelineEntriesRef.current = updated;
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    setStudioMessage("Timeline moment removed.");
    setDraftHistory((current) => ["Timeline moment removed.", ...current].slice(0, 6));
    invalidatePreviewReview();
    queueCollaborativeDraftUpdate("timeline-removed", { immediate: true });
  };

  const updateTimelineDatePart = (index: number, field: "year" | "month" | "day", value: string) => {
    lastLocalMediaActivityAtRef.current = Date.now();
    setTimelineEntries((current) => {
      const updated = current.map((entry, entryIndex) => {
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
      timelineEntriesRef.current = updated;
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    invalidatePreviewReview();
    queueCollaborativeDraftUpdate("timeline-date");
  };

  const handlePreviewToggle = async () => {
    if (!validateStoryBeforePersist()) {
      return;
    }

    try {
      const snapshot = buildChaptersSnapshot();
      const uploadedChapters = await ensureStoryMediaUploaded(snapshot);
      const previewChapters = sanitizePreviewChaptersForCurrentPlan(uploadedChapters);
      let previewStoryId = currentStoryId;
      let previewRevision = currentStoryRevisionRef.current;
      if (currentStoryStatus !== "published" && canPersistStoryRemotely(previewChapters)) {
        const previewStory = await persistStory(buildStoryPayload("draft", previewChapters), "Autosaved.");
        previewStoryId = previewStory.id;
        previewRevision = previewStory.collaborationRevision ?? previewRevision;
      }
      const uploadedActiveChapter = previewChapters[activeChapterIndex >= 0 ? activeChapterIndex : 0];
      const previewPayload: StudioPreviewPayload = {
        storyId: previewStoryId,
        storyTitle,
        storySummary,
        storyLinks,
        activeChapterNumberLabel,
        activeChapter: uploadedActiveChapter?.title || activeChapterLabel,
        chapterType,
        visibility: anonymous ? "anonymous" : visibility,
        chapterBody: uploadedActiveChapter?.body ?? chapterBody,
        wordCount: getChapterWordCount(uploadedActiveChapter?.body ?? chapterBody),
        imageAttachments: uploadedActiveChapter?.imageAttachments ?? [],
        voiceNotes: uploadedActiveChapter?.voiceNotes ?? [],
        timelineEntries: (uploadedActiveChapter?.timelineEntries ?? []).filter(
          (entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0 || entry.year || entry.month || entry.day
        ),
        allowComments,
        chapterStatus: activeChapterIsLive ? "Live now" : uploadedActiveChapter?.status ?? "Draft saved",
        chapterChecklist: {
          required: currentChapterRequiredItems,
          optional: currentChapterOptionalItems
        }
      };

      const nextPublishPayload = buildStoryPayload("published", previewChapters);
      const publishPayload: StudioPublishPayload = {
        storyId: previewStoryId,
        payload: {
          ...nextPublishPayload,
          expectedRevision: previewStoryId ? previewRevision : undefined
        }
      };

      window.sessionStorage.setItem("histora-studio-preview", JSON.stringify(previewPayload));
      window.sessionStorage.setItem("histora-studio-publish-payload", JSON.stringify(publishPayload));
      window.sessionStorage.setItem("histora-studio-reviewed", "true");
      setHasReviewedPreview(true);
      setStudioMessage(
        currentStoryStatus === "published"
          ? `Preview opened for ${uploadedActiveChapter?.title || activeChapterLabel}. Review the update, then republish the live story.`
          : `Preview opened for ${uploadedActiveChapter?.title || activeChapterLabel}. Review it before publishing.`
      );
      navigate("/studio/preview");
    } catch (error) {
      const message = getErrorMessage(error, "Could not open preview.");
      setStudioMessage(message);
      openStudioNotice("Preview failed", message, { target: "publish" });
    }
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

  const returnToStoryLibrary = () => {
    saveCurrentDraft({ quiet: true });
    setIsStudioEditorOpen(false);
    setStudioMessage("Story library ready.");
  };

  const publishPanel = (
    <article className="studio-panel card" ref={publishControlSectionRef}>
      <SectionLabelComponent>PUBLISH_CONTROL</SectionLabelComponent>
      <span className="studio-section-step">Step 7</span>
      <p className="studio-section-helper">Use preview to check the reader view first, then publish when you are ready to go live.</p>
      {isEditingPublishedStory ? (
        <div className="editor-preview studio-live-story-note">
          <h3>Live story update</h3>
          <p>Chapters tagged LIVE are already published. Edits stay local here until you preview and republish the story.</p>
        </div>
      ) : null}
      <div className="publish-stack">
        <div className="publish-row">
          <strong>Current mode</strong>
          <span>{anonymous ? "Anonymous advice" : getStoryAudienceLabel(visibility)}</span>
        </div>
        {!anonymous ? (
          <div className="publish-row">
            <strong>Who can open it</strong>
            <span>{getStoryAudienceHelp(visibility)}</span>
          </div>
        ) : null}
        <div className="publish-row">
          <strong>Live status</strong>
          <span>{isEditingPublishedStory ? "Already live" : "Not live yet"}</span>
        </div>
        <div className="publish-row">
          <strong>Active chapter</strong>
          <span>
            {activeChapterIsLive
              ? "Live now, update with republish"
              : activeChapterReady?.isComplete
                ? "Ready to publish"
                : `Needs ${chapterCompletionThreshold} words`}
          </span>
        </div>
        <div className="publish-row">
          <strong>Story readiness</strong>
          <span>
            {readyChapters.length > 0
              ? isEditingPublishedStory
                ? "Ready chapters can update the live story"
                : "Ready chapters can go live"
              : "No finished chapters yet"}
          </span>
        </div>
      </div>
      <div className="publish-summary-block">
        <strong>{isEditingPublishedStory ? "Chapters included in the live update" : "Chapters going live"}</strong>
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
          <strong>{isEditingPublishedStory ? "Needs more work before you republish confidently" : "Needs more work before publish"}</strong>
          <div className="publish-chip-list">
            {startedIncompleteChapters.map((chapter) => (
              <span className="publish-chip publish-chip-warning" key={chapter.title}>{chapter.title}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="chapter-controls">
        <button className="primary-action" onClick={() => void handlePreviewToggle()} type="button">FINISH AND PREVIEW</button>
      </div>
    </article>
  );

  const privacyPanel = (
    <article className="rail-panel card" ref={privacySectionRef}>
      <SectionLabelComponent>PRIVACY_CONTROL</SectionLabelComponent>
      <span className="studio-section-step">Step 6</span>
      <p className="studio-section-helper">Choose who can read this story before you publish or republish it.</p>
      <div className="choice-stack">
        {["private", "selected", "public"].map((option) => (
          <button
            key={option}
            className={visibility === option ? "choice-button active-choice" : "choice-button"}
            disabled={!currentStoryIsOwner}
            onClick={() => setVisibility(option as "private" | "selected" | "public")}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
      <label className="toggle-row">
        <input checked={anonymous} disabled={!currentStoryIsOwner} onChange={(event) => setAnonymous(event.target.checked)} type="checkbox" />
        <span>Post this chapter anonymously for advice</span>
      </label>
      <label className="toggle-row">
        <input checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} type="checkbox" />
        <span>Allow comments on published chapters</span>
      </label>
    </article>
  );

  if (isEnteringStudio) {
    return (
      <main className="page-shell">
        <section className="studio-loader card">
          <span className="loader-orb" />
          <SectionLabelComponent>STUDIO_BOOT</SectionLabelComponent>
          <h1>Entering studio mode</h1>
          <p>Loading chapters, drafts, media tools, contributor access, and publishing controls.</p>
        </section>
      </main>
    );
  }

  const storyLibraryPanel = (
    <section className="studio-panel card studio-library-panel">
      <div className="section-head">
        <div>
          <SectionLabelComponent>YOUR_STORIES</SectionLabelComponent>
          <h2>Open a story you are already writing</h2>
        </div>
        <button className="primary-action" onClick={startFreshStory} type="button">NEW STORY</button>
      </div>
      <div className="studio-library-list">
        {isStoryLibraryLoading ? (
          <div className="studio-library-card studio-library-empty">
            <strong>Loading your story library...</strong>
            <span>Checking drafts and published stories linked to this account.</span>
          </div>
        ) : storyLibrary.length || collaborationLibrary.length || hasUnsavedLocalDraft ? (
          <>
            {hasUnsavedLocalDraft ? (
              <button
                className={`studio-library-card${currentStoryId === null ? " studio-library-card-active" : ""}`}
                onClick={openUnsavedLocalDraft}
                type="button"
              >
                <div className="studio-library-head">
                  <strong>{storyTitle.trim() || "Untitled local draft"}</strong>
                  <span className="story-tag">DRAFT</span>
                </div>
                <p>{storySummary.trim() || "This draft is saved locally on this device. Reopen it here and continue writing before you publish."}</p>
                <div className="studio-library-meta">
                  <span>{chapters.length} chapter{chapters.length === 1 ? "" : "s"}</span>
                  <span>Saved on this device</span>
                  <span>{anonymous ? "Anonymous" : getStoryAudienceLabel(visibility)}</span>
                  <span>Continue locally</span>
                </div>
              </button>
            ) : null}
            {storyLibrary.map((story) => (
              <button
                className={`studio-library-card${currentStoryId === story.id ? " studio-library-card-active" : ""}`}
                key={story.id}
                onClick={() =>
                  loadStoryIntoStudio(story, {
                    mergeRestoredDraft: restoredLocalDraftRef.current && currentStoryId === story.id
                  })
                }
                type="button"
              >
                <div className="studio-library-head">
                  <strong>{story.title}</strong>
                  <span className="story-tag">{story.status === "published" ? "LIVE" : "DRAFT"}</span>
                </div>
                <p>{story.summary}</p>
                {story.status === "published" ? (
                  <span className="studio-library-action-chip">CONTINUE STORY</span>
                ) : null}
                <div className="studio-library-meta">
                  <span>{story.chapters.length} chapter{story.chapters.length === 1 ? "" : "s"}</span>
                  <span>{story.status === "published" ? "Live now" : "Not published yet"}</span>
                  <span>{getStoryAudienceLabel(story.visibility)}</span>
                  <span>{new Date(story.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
            {collaborationLibrary.map((story) => (
              <button
                className={`studio-library-card${currentStoryId === story.id ? " studio-library-card-active" : ""}`}
                key={story.id}
                onClick={() => loadStoryIntoStudio(story)}
                type="button"
              >
                <div className="studio-library-head">
                  <strong>{story.title}</strong>
                  <span className="story-tag">COLLAB</span>
                </div>
                <p>{story.summary}</p>
                <span className="studio-library-action-chip">START COLLABORATING</span>
                <div className="studio-library-meta">
                  <span>{story.chapters.length} chapter{story.chapters.length === 1 ? "" : "s"}</span>
                  <span>Revision {story.collaborationRevision ?? 0}</span>
                  <span>{(story.collaborators ?? []).length + 1} editors</span>
                  <span>{new Date(story.updatedAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </>
        ) : (
          <div className="studio-library-card studio-library-empty">
            <strong>No saved stories yet</strong>
            <span>Start a new story here and it will stay available in your library once autosave begins.</span>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <main className="page-shell">
      <section className="studio-header card">
        <div>
          <SectionLabelComponent>{isCollaborativeStudio ? "COLLABORATIVE_STUDIO" : "WRITING_STUDIO"}</SectionLabelComponent>
          <h1>{isCollaborativeStudio ? "WRITE TOGETHER WITHOUT LOSING THE STORY." : "DRAFT LIKE AN EDITOR. PUBLISH LIKE A PLATFORM."}</h1>
          <p>
            {isCollaborativeStudio
              ? "This story is shared with collaborators. Track revisions, see who last edited each section, and reload newer versions safely."
              : "Build chapters, attach images and voice notes, and control how every finished draft gets published."}
          </p>
        </div>
        <div className="hero-actions">
          {isStudioEditorOpen ? (
            <button className="ghost-action" onClick={returnToStoryLibrary} type="button">STORY LIBRARY</button>
          ) : null}
          <button className="ghost-action" onClick={exitStudioMode} type="button">EXIT STUDIO</button>
        </div>
      </section>
      <section className="studio-status-bar card">
        <strong>{studioMessage}</strong>
        <span>
          {isAutoSavingDraft
            ? "Auto-saving..."
            : isStudioEditorOpen
              ? `${wordCount} words in active chapter`
              : `${storyLibrary.length + collaborationLibrary.length} stor${storyLibrary.length + collaborationLibrary.length === 1 ? "y" : "ies"} in your library`}
        </span>
      </section>
      {currentStoryId && currentStoryCollaborators.length > 0 ? (
        <section className="studio-notice card studio-collaboration-panel">
          <div className="studio-notice-copy">
            <span className="studio-notice-label">Collaborative studio</span>
            <strong>
              Revision {currentStoryRevision}
              {currentStoryLastEditedByName && currentStoryLastEditedByUsername
                ? ` // last update by ${currentStoryLastEditedByName} (@${currentStoryLastEditedByUsername})`
                : ""}
            </strong>
            <p>
              {currentStoryIsOwner
                ? "You own this story. Collaborators can help write and edit, but only you control audience and anonymity settings."
                : "You are collaborating on this story. Collaborator saves now sync into this editor live, while your local autosaves stay protected on this device."}
            </p>
            <p>{currentStoryCanEdit ? "Editing access is active for this account." : "This account can view but cannot edit this story."}</p>
          </div>
          <div className="invite-stack">
            {currentStoryCollaborators.map((collaborator) => (
              <span className="story-tag" key={collaborator.id}>
                @{collaborator.username}
              </span>
            ))}
          </div>
          {remoteCollaborationUpdate ? (
            <div className="chapter-controls">
              <button className="primary-action" onClick={() => void loadLatestCollaborativeVersion()} type="button">
                SYNC LATEST NOW
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {!isStudioEditorOpen ? storyLibraryPanel : null}

      {isStudioEditorOpen ? (
        <>
      <section className="studio-flow-guide card">
        <div className="section-head">
          <div className="studio-flow-guide-copy">
            <SectionLabelComponent>GUIDED_STEPS</SectionLabelComponent>
            <h2>Follow the steps in order</h2>
            <p className="studio-flow-guide-note">Finish one block at a time. Each card below can take you straight to the next thing that still needs attention.</p>
          </div>
          <span className="section-meta">
            {studioGuideSteps.filter((step) => step.completed).length}/{studioGuideSteps.length} steps ready
          </span>
        </div>
        <div className="studio-step-grid">
          {studioGuideSteps.map((step) => (
            <button
              className={`studio-step-card${step.completed ? " studio-step-card-complete" : ""}`}
              key={step.id}
              onClick={() => takeUserToStudioTarget(step.id)}
              type="button"
            >
              <span className="studio-step-number">Step {step.number}</span>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
              <span className="studio-step-status">{step.status}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="studio-layout">
        <div className="studio-main">
          <article className="studio-panel card" ref={chapterEditorSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabelComponent>CHAPTER_SWITCHER</SectionLabelComponent>
                <span className="studio-section-step">Choose chapter</span>
                <h2>Slide through your chapters</h2>
                <p className="studio-section-helper">Pick the chapter you want to work on, or add a new one before writing.</p>
              </div>
              <div className="chapter-switcher-actions">
                <span className="story-tag">{chapterSlots.length} chapters</span>
                <button className="ghost-action" onClick={addChapter} type="button">ADD CHAPTER</button>
              </div>
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
                  key={chapter.chapterLabel}
                  onClick={() => handleChapterSwitch(chapter.title, chapter.isLocked)}
                  type="button"
                >
                  <small>{chapter.chapterLabel}</small>
                  <strong>{chapter.title}</strong>
                  <span>
                    {chapter.isLocked
                      ? "PREMIUM"
                      : getChapterStatusLabel(
                          chapters.findIndex((entry) => entry.title === chapter.title),
                          chapters.find((entry) => entry.title === chapter.title)?.status ?? chapter.status
                        )}
                  </span>
                </button>
              ))}
            </div>
            {!isPremium ? <span className="section-meta">Free users can write in the first 2 chapters only.</span> : null}
            {isEditingPublishedStory ? (
              <div className="editor-preview studio-live-story-note">
                <h3>This story is already live</h3>
                <p>Open any LIVE chapter to update it, then preview and republish when the changes are ready to replace the current version.</p>
              </div>
            ) : null}
            {activeChapterEntry?.lastEditedByName && activeChapterEntry?.lastEditedByUsername && activeChapterEntry?.lastEditedAt ? (
              <span className="section-meta studio-collaboration-meta">
                {formatStudioEditMeta(activeChapterEntry.lastEditedByName, activeChapterEntry.lastEditedByUsername, activeChapterEntry.lastEditedAt)}
              </span>
            ) : null}
          </article>

          <article className="studio-panel card" ref={mediaSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabelComponent>STORY_SETUP</SectionLabelComponent>
                <span className="studio-section-step">Step 1</span>
                <h2>Story identity</h2>
                <p className="studio-section-helper">Start with a clear title and summary so the studio can build a good preview.</p>
              </div>
              <span className="story-tag">FREE_PLAN // 2500_WORDS</span>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input onChange={(event) => {
                  lastLocalStoryMetaActivityAtRef.current = Date.now();
                  setStoryTitle(event.target.value);
                  invalidatePreviewReview();
                  queueCollaborativeDraftUpdate("story-title");
                }} value={storyTitle} />
              </label>
              <label>
                Summary
                <textarea onChange={(event) => {
                  lastLocalStoryMetaActivityAtRef.current = Date.now();
                  setStorySummary(event.target.value);
                  invalidatePreviewReview();
                  queueCollaborativeDraftUpdate("story-summary");
                }} value={storySummary} />
                <span className="section-meta studio-word-counter">
                  {summaryWordsRemaining > 0
                    ? `${summaryWordCount} words written. ${summaryWordsRemaining} remaining to reach the 20-word summary minimum.`
                    : `${summaryWordCount} words written. Summary minimum reached.`}
                </span>
              </label>
            </div>
          </article>

          <article className="studio-panel card" ref={publishSectionRef}>
            <div className="section-head">
              <div className="chapter-heading-block">
                <SectionLabelComponent>CURRENT_CHAPTER</SectionLabelComponent>
                <span className="studio-section-step">Step 2</span>
                <span className="current-chapter-kicker">
                  Working on {chapterSlots.find((chapter) => chapter.title === activeChapter)?.chapterLabel ?? "Current chapter"}
                </span>
                <p className="studio-section-helper">Write the chapter body here. Finish one strong chapter before worrying about the rest.</p>
                <div className="chapter-heading-row">
                  {isEditingChapterTitle ? (
                    <input
                      className="chapter-title-input"
                      onBlur={submitActiveChapterTitle}
                      onChange={(event) => setChapterTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitActiveChapterTitle();
                        }
                      }}
                      placeholder="Untitled chapter"
                      value={chapterTitleDraft}
                    />
                  ) : (
                    <h2>{activeChapterLabel}</h2>
                  )}
                  <button
                    aria-label="Edit chapter title"
                    className="chapter-edit-button"
                    onClick={() => {
                      setChapterTitleDraft(activeChapterLabel === "Untitled chapter" ? "" : activeChapterLabel);
                      setIsEditingChapterTitle(true);
                    }}
                    type="button"
                  >
                    <IconComponent className="button-icon" name="write" />
                  </button>
                </div>
                {activeChapterEntry?.createdByName && activeChapterEntry?.createdByUsername ? (
                  <span className="section-meta studio-collaboration-meta">
                    Started by {activeChapterEntry.createdByName} (@{activeChapterEntry.createdByUsername})
                  </span>
                ) : null}
              </div>
              <div className="chapter-heading-statuses">
                <span className="story-tag">{activeChapterIsLive ? "LIVE_CHAPTER" : "DRAFT_CHAPTER"}</span>
                <span className="story-tag">{wordCount}_WORDS</span>
              </div>
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
                      <IconComponent className="button-icon" name="mic" />
                    </button>
                  ) : null}
                </div>
                <span className="section-meta studio-word-counter">
                  {bodyWordsRemaining > 0
                    ? `${wordCount} words written. ${bodyWordsRemaining} remaining to reach chapter readiness.`
                    : `${wordCount} words written. Chapter readiness reached.`}
                </span>
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
                <IconComponent className="button-icon" name="bold" />
                <span className="toolbar-label">Bold</span>
              </button>
              <button className={activeFormats.italic ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("italic")} type="button">
                <IconComponent className="button-icon" name="italic" />
                <span className="toolbar-label">Italic</span>
              </button>
              <button className={activeFormats.quote ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("quote")} type="button">
                <IconComponent className="button-icon" name="quote" />
                <span className="toolbar-label">Quote</span>
              </button>
              <button className={activeFormats.checklist ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("checklist")} type="button">
                <IconComponent className="button-icon" name="checklist" />
                <span className="toolbar-label">Checklist</span>
              </button>
              <button className={activeFormats.timeline ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("timeline")} type="button">
                <IconComponent className="button-icon" name="timeline" />
                <span className="toolbar-label">Timeline tag</span>
              </button>
              <button className={activeFormats.comment ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("comment")} type="button">
                <IconComponent className="button-icon" name="note" />
                <span className="toolbar-label">Comment note</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("opening")} type="button">
                <IconComponent className="button-icon" name="write" />
                <span className="toolbar-label">Add opening</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("conflict")} type="button">
                <IconComponent className="button-icon" name="bolt" />
                <span className="toolbar-label">Add conflict</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("reflection")} type="button">
                <IconComponent className="button-icon" name="bookmark" />
                <span className="toolbar-label">Add reflection</span>
              </button>
              <button className="composer-chip" onClick={() => insertStructureBlock("closing")} type="button">
                <IconComponent className="button-icon" name="arrow" />
                <span className="toolbar-label">Add closing</span>
              </button>
            </div>
            <div className="editor-preview">
              <h3>Auto-save is on</h3>
              <p>Changes in this chapter are saved automatically while you write, attach media, and update timeline moments.</p>
            </div>
          </article>

          <article className="studio-panel card" ref={mediaAttachmentsSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabelComponent>MEDIA_ATTACHMENTS</SectionLabelComponent>
                <span className="studio-section-step">Step 3</span>
                <h2>Tap a slot to attach images and voice notes</h2>
                <p className="studio-section-helper">Use media only when it adds proof, emotion, or context to the chapter.</p>
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
            {mediaError ? <div className="media-error-banner">{mediaError}</div> : null}
            <div className="media-grid">
              {imageAttachments.map((attachment) => {
                const attachmentIdentity = getStudioAttachmentIdentity(attachment);
                const showImageSkeleton = imageLoadingState[attachmentIdentity] ?? isUploadingAttachmentSource(attachment.source);

                return (
                  <article className="media-card" key={attachmentIdentity}>
                  <button
                    aria-label={`Remove ${attachment.name}`}
                    className="media-remove-button"
                    onClick={() => removeImageAttachment(attachment.url)}
                    type="button"
                  >
                    <IconComponent className="button-icon" name="close" />
                  </button>
                  <div className={`media-preview-frame${showImageSkeleton ? " media-preview-frame-loading" : ""}`}>
                    {showImageSkeleton ? <div className="media-preview-skeleton" aria-hidden="true" /> : null}
                    <img
                      alt={attachment.name}
                      className={`media-preview-image${showImageSkeleton ? " media-preview-image-loading" : ""}`}
                      onError={() => {
                        const shouldKeepSkeletonVisible =
                          Boolean(attachment.objectKey) ||
                          hasPendingStudioAttachmentHydration(attachment) ||
                          isUploadingAttachmentSource(attachment.source);

                        setImageLoadingState((current) => ({
                          ...current,
                          [attachmentIdentity]: shouldKeepSkeletonVisible
                        }));

                        if (shouldKeepSkeletonVisible) {
                          refreshImageAttachmentAfterError(attachment);
                        }
                      }}
                      onLoad={() => {
                        setImageLoadingState((current) => ({
                          ...current,
                          [attachmentIdentity]: false
                        }));
                      }}
                      src={attachment.url}
                    />
                  </div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.source}</span>
                  <div className="media-card-footer">
                    <button className="ghost-action slim-action" onClick={() => replaceImageAttachment(attachment.url)} type="button">
                      REPLACE IMAGE
                    </button>
                    <small>Swap this image without using another slot.</small>
                  </div>
                  </article>
                );
              })}
              {Array.from({ length: Math.max(imageLimit - imageAttachments.length, 0) }).map((_, index) => (
                <button className="media-card media-card-empty media-slot-button" key={`image-slot-${index}`} onClick={openImageSlot} type="button">
                  <div className="media-slot-placeholder" aria-hidden="true">
                    <IconComponent className="button-icon" name="image" />
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
                    <IconComponent className="button-icon" name="close" />
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
                    <IconComponent className="button-icon" name="mic" />
                  </div>
                  <strong>Voice slot {voiceNotes.length + index + 1}</strong>
                  <span>{isRecordingVoice ? "Use pause or stop above" : "Tap microphone slot to record"}</span>
                  <small>{isPremium ? "Available voice slot" : "Free plan voice slot"}</small>
                </button>
              ))}
            </div>
            {isRecordingVoice && !isVoiceSheetOpen ? (
              <div className="voice-recording-alert">
                <div className="voice-recording-alert-copy">
                  <strong>{isVoiceRecordingPaused ? "Voice note paused" : "Voice note recording"}</strong>
                  <span>{voiceRecordingStatus}</span>
                </div>
                <div className="voice-recording-alert-actions">
                  <button className="ghost-action" onClick={isVoiceRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording} type="button">
                    <IconComponent className="button-icon" name="pause" />
                    {isVoiceRecordingPaused ? "RESUME" : "PAUSE"}
                  </button>
                  <button className="primary-action" onClick={stopVoiceRecording} type="button">
                    <IconComponent className="button-icon" name="close" />
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

        <aside className="right-rail desktop-only">{privacyPanel}</aside>
      </section>

      <section className="timeline-stage">
        <article className="studio-panel card timeline-panel-full" ref={timelineSectionRef}>
          <div className="section-head">
            <div>
              <SectionLabelComponent>TIMELINE_MOMENTS</SectionLabelComponent>
              <span className="studio-section-step">Step 4</span>
              <h2>Anchor the chapter to real time</h2>
              <p className="studio-section-helper">Add dates or turning points so readers can follow the story in the right order.</p>
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
                {moment.lastEditedByName && moment.lastEditedByUsername && moment.lastEditedAt ? (
                  <span className="section-meta studio-collaboration-meta">
                    {formatStudioEditMeta(moment.lastEditedByName, moment.lastEditedByUsername, moment.lastEditedAt)}
                  </span>
                ) : null}
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

      <section className="timeline-stage">
        <article className="studio-panel card" ref={storyLinksSectionRef}>
          <div className="section-head studio-links-head">
            <div>
              <SectionLabelComponent>STORY_LINKS</SectionLabelComponent>
              <span className="studio-section-step">Step 5</span>
              <h3>Attach supporting links to this story</h3>
              <p className="studio-section-helper">Add links only if readers should leave the story to see supporting material.</p>
            </div>
            <button className="ghost-action" onClick={addStoryLink} type="button">ADD LINK</button>
          </div>
          <div className="studio-links-list">
            {storyLinks.length ? (
              storyLinks.map((link, index) => (
                <article className="studio-link-row" key={`story-link-${index}`}>
                  <label>
                    Label
                    <input
                      onChange={(event) => updateStoryLink(index, "label", event.target.value)}
                      placeholder="Google Drive folder"
                      value={link.label}
                    />
                  </label>
                  <label>
                    Link type
                    <select
                      onChange={(event) => updateStoryLink(index, "kind", event.target.value)}
                      value={link.kind}
                    >
                      <option value="website">Official site</option>
                      <option value="social">Social account</option>
                      <option value="drive">Drive link</option>
                      <option value="photos">Google Photos</option>
                    </select>
                  </label>
                  <label className="studio-link-url-field">
                    URL
                    <input
                      onChange={(event) => updateStoryLink(index, "url", event.target.value)}
                      placeholder="https://..."
                      value={link.url}
                    />
                  </label>
                  <button
                    aria-label="Remove story link"
                    className="icon-chip"
                    onClick={() => removeStoryLink(index)}
                    type="button"
                  >
                    <IconComponent className="button-icon" name="close" />
                  </button>
                </article>
              ))
            ) : (
              <div className="studio-link-row studio-link-empty">
                <strong>No story links yet</strong>
                <span>Add Google Photos, Drive folders, official websites, or social profile links readers should see beside the story.</span>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="timeline-stage mobile-only">
        {privacyPanel}
      </section>

      <section className="timeline-stage">
        {publishPanel}
      </section>
        </>
      ) : null}

      {studioNotice ? (
        <div className="studio-guide-dialog-backdrop" onClick={() => setStudioNotice(null)} role="presentation">
          <article
            aria-modal="true"
            className="studio-guide-dialog card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="studio-guide-dialog-head">
              <span className="studio-notice-badge" aria-hidden="true">
                <IconComponent className="button-icon" name="bolt" />
              </span>
              <div className="studio-notice-copy">
                <span className="studio-notice-label">Next step</span>
                <strong>{studioNotice.title}</strong>
                <p>{studioNotice.body}</p>
              </div>
            </div>
            <div className="studio-guide-dialog-actions">
              {studioNotice.target ? (
                <button className="primary-action" onClick={() => takeUserToStudioTarget(studioNotice.target!)} type="button">
                  TAKE ME THERE
                </button>
              ) : null}
              <button className="ghost-action" onClick={() => setStudioNotice(null)} type="button">DISMISS</button>
            </div>
          </article>
        </div>
      ) : null}

      {isVoiceSheetOpen ? (
        <div className="status-viewer-backdrop" onClick={closeVoiceSheet} role="presentation">
          <article className="share-sheet-modal voice-sheet-modal" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <SectionLabelComponent>VOICE_NOTE</SectionLabelComponent>
                <h2>Record in this chapter</h2>
              </div>
              <button aria-label="Close voice note sheet" className="icon-chip" onClick={closeVoiceSheet} type="button">
                <IconComponent className="button-icon" name="close" />
              </button>
            </div>
            <div className={isRecordingVoice ? "recording-indicator recording-live" : "recording-indicator"}>
              <span className="recording-dot" />
              <strong>{isRecordingVoice ? (isVoiceRecordingPaused ? "Recording paused" : "Recording live") : "Recorder idle"}</strong>
              <span>{voiceRecordingStatus}</span>
            </div>
            <div className="share-sheet-actions voice-sheet-actions">
              {!isRecordingVoice ? (
                <button className="primary-action" onClick={() => void startVoiceRecording()} type="button">
                  START RECORDING
                </button>
              ) : (
                <>
                  <button className="ghost-action" onClick={isVoiceRecordingPaused ? resumeVoiceRecording : pauseVoiceRecording} type="button">
                    {isVoiceRecordingPaused ? "RESUME" : "PAUSE"}
                  </button>
                  <button className="primary-action" onClick={stopVoiceRecording} type="button">
                    STOP
                  </button>
                </>
              )}
            </div>
            {voiceNotes.length ? (
              <div className="voice-sheet-list">
                {voiceNotes.map((voice) => (
                  <article className="media-card voice-sheet-card" key={voice.url}>
                    <strong>{voice.name}</strong>
                    <span>{voice.source}</span>
                    <audio className="voice-player" controls src={voice.url} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="transcription-supported-copy">Your saved voice notes will appear here for playback after recording.</p>
            )}
          </article>
        </div>
      ) : null}
    </main>
  );
}
