import { Fragment, useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { useNavigate } from "react-router-dom";

import { type ApiStory, getEventsSocketUrl, type ProfileDashboard, type SignedReadResponse, apiRequest, uploadMediaAsset } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import type { FeedIconComponent, FeedSectionLabelComponent } from "../feed/ui-types";
import { createEmptyTimelineEntry, createInitialStudioChapter, type StudioChapter, type StudioMediaAttachment, type StudioPreviewPayload, type StudioPublishPayload, type StudioTimelineEntry } from "./types";

const isBlobUrl = (value: string) => value.startsWith("blob:");
const isOwnedStorageObjectKey = (value: string) => /^users\/[^/]+\/.+/.test(value);

const getStudioAttachmentStorageUrl = (attachment: { url: string; objectKey?: string }) =>
  attachment.objectKey || (attachment.url && !isBlobUrl(attachment.url) ? attachment.url : "");

async function resolveStudioAttachmentUrl(accessToken: string, attachment: StudioMediaAttachment) {
  const storageKey = attachment.objectKey || (isOwnedStorageObjectKey(attachment.url) ? attachment.url : null);
  if (!storageKey) {
    return attachment;
  }

  const signedRead = await apiRequest<SignedReadResponse>(
    `/media/signed-read?objectKey=${encodeURIComponent(storageKey)}`,
    { accessToken }
  );

  return {
    ...attachment,
    objectKey: storageKey,
    url: signedRead.readUrl
  };
}

async function hydrateStudioChaptersForMedia(accessToken: string, chapters: StudioChapter[]) {
  return Promise.all(
    chapters.map(async (chapter) => ({
      ...chapter,
      imageAttachments: await Promise.all(
        chapter.imageAttachments.map((attachment) => resolveStudioAttachmentUrl(accessToken, attachment))
      ),
      voiceNotes: await Promise.all(
        chapter.voiceNotes.map((voice) => resolveStudioAttachmentUrl(accessToken, voice))
      )
    }))
  );
}

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
  const hasTimelineContent = (entries: StudioTimelineEntry[]) =>
    entries.some((entry) => entry.title.trim() || entry.body.trim() || entry.year || entry.month || entry.day);
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
    title: chapter.title,
    type: chapter.type.toUpperCase(),
    words: getChapterWordCount(chapter.body),
    status: storyStatus === "published" ? "Published" : "Draft saved",
    moments: chapter.moments.length,
    body: chapter.body,
    imageAttachments: (chapter.imageUrls ?? []).map((imageUrl, index) => ({
      name: `${chapter.title} image ${index + 1}`,
      url: imageUrl,
      source: "Saved story",
      objectKey: chapter.imageKeys?.[index]
    })),
    voiceNotes: chapter.voiceNoteUrl
      ? [{
          name: `Voice note ${chapter.order}`,
          url: chapter.voiceNoteUrl,
          source: "Saved story",
          objectKey: chapter.voiceNoteKey ?? undefined
        }]
      : [],
    timelineEntries:
      chapter.moments.length > 0
        ? chapter.moments.map((moment) => {
            const momentDate = new Date(moment.happenedAt);
            return {
              year: String(momentDate.getFullYear()),
              month: String(momentDate.getMonth() + 1).padStart(2, "0"),
              day: String(momentDate.getDate()).padStart(2, "0"),
              title: moment.title,
              body: moment.description
            };
          })
        : [createEmptyTimelineEntry()]
  });
  const mergeFetchedDraftChapters = (localChapters: StudioChapter[], fetchedChapters: StudioChapter[]) => {
    const localByTitle = new Map(localChapters.map((chapter) => [chapter.title, chapter]));
    const mergedFetched = fetchedChapters.map((fetchedChapter) => {
      const localChapter = localByTitle.get(fetchedChapter.title);
      if (!localChapter) {
        return fetchedChapter;
      }

      const body = getChapterWordCount(localChapter.body) > 0 ? localChapter.body : fetchedChapter.body;
      const imageAttachments = localChapter.imageAttachments.length ? localChapter.imageAttachments : fetchedChapter.imageAttachments;
      const voiceNotes = localChapter.voiceNotes.length ? localChapter.voiceNotes : fetchedChapter.voiceNotes;
      const timelineEntries = hasTimelineContent(localChapter.timelineEntries)
        ? localChapter.timelineEntries
        : fetchedChapter.timelineEntries;

      return {
        ...fetchedChapter,
        ...localChapter,
        body,
        words: getChapterWordCount(body),
        imageAttachments,
        voiceNotes,
        timelineEntries,
        moments: timelineEntries.filter((entry) => entry.title.trim() || entry.body.trim()).length
      };
    });

    const fetchedTitles = new Set(fetchedChapters.map((chapter) => chapter.title));
    const localOnlyChapters = localChapters.filter(
      (chapter) => !fetchedTitles.has(chapter.title) && isPersistableStudioChapter(chapter)
    );

    return [...mergedFetched, ...localOnlyChapters];
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
  const [isEnteringStudio, setIsEnteringStudio] = useState(true);
  const [activeChapter, setActiveChapter] = useState("Chapter 1");
  const [isPremium, setIsPremium] = useState(currentUser.subscriptionTier === "premium");
  const [visibility, setVisibility] = useState<"private" | "selected" | "public">("selected");
  const [anonymous, setAnonymous] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storySummary, setStorySummary] = useState("");
  const [chapterType, setChapterType] = useState("memory");
  const [allowComments, setAllowComments] = useState(true);
  const [chapters, setChapters] = useState<StudioChapter[]>(
    [createInitialStudioChapter(0), createInitialStudioChapter(1)]
  );
  const [studioMessage, setStudioMessage] = useState("Studio ready.");
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false);
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState("");
  const [draftHistory, setDraftHistory] = useState<string[]>(["Studio opened."]);
  const [studioNotice, setStudioNotice] = useState<null | { title: string; body: string }>(null);
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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageAttachmentsRef = useRef<StudioMediaAttachment[]>([]);
  const voiceNotesRef = useRef<StudioMediaAttachment[]>([]);
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

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
  const studioStorageKey = "histora-studio-local-draft-v1";
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
  const liveEditorBody = getLatestChapterBody();
  const autoSaveSignature = JSON.stringify({
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    liveEditorBody,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility
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
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    setImageAttachments(activeChapterEntry?.imageAttachments ?? []);
    setVoiceNotes(activeChapterEntry?.voiceNotes ?? []);
    setTimelineEntries(activeChapterEntry?.timelineEntries?.length ? activeChapterEntry.timelineEntries : [createEmptyTimelineEntry()]);
  }, [activeChapterEntry]);

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
        setVisibility(draft.visibility as "private" | "selected" | "public");
        setAnonymous(draft.anonymous);
        const fetchedChapters = draft.chapters
          .map((chapter) => normalizeFetchedStoryChapter(chapter, draft.status))
          .filter((chapter) => !isLegacySeedChapter(chapter));

        const nextChapters = restoredLocalDraftRef.current
          ? mergeFetchedDraftChapters(chaptersRef.current, fetchedChapters)
          : fetchedChapters;

        setChapters(nextChapters);
        void hydrateStudioChaptersForMedia(accessToken, nextChapters)
          .then((hydratedChapters) => {
            if (!cancelled) {
              setChapters(hydratedChapters);
            }
          })
          .catch(() => undefined);
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

    let cancelled = false;
    let hydrationTimer: number | null = null;

    try {
      const rawDraft = window.localStorage.getItem(studioStorageKey);
      if (!rawDraft) {
        return;
      }

      const savedDraft = JSON.parse(rawDraft) as Partial<{
        activeChapter: string;
        currentStoryId: string | null;
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
      if (savedDraft.currentStoryId) {
        setCurrentStoryId(savedDraft.currentStoryId);
      }
      if (typeof savedDraft.isPremium === "boolean") {
        setIsPremium(savedDraft.isPremium);
      }
      if (savedDraft.visibility) {
        setVisibility(savedDraft.visibility as "private" | "selected" | "public");
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
        restoredLocalDraftRef.current = true;
        const restoredChapters = savedDraft.chapters
          .map((chapter) => ({
            ...chapter,
            imageAttachments: (chapter.imageAttachments ?? []).filter(
              (attachment) => Boolean(attachment.objectKey || (attachment.url && !isBlobUrl(attachment.url)))
            ),
            voiceNotes: (chapter.voiceNotes ?? []).filter(
              (voice) => Boolean(voice.objectKey || (voice.url && !isBlobUrl(voice.url)))
            ),
            timelineEntries: chapter.timelineEntries?.length ? chapter.timelineEntries : [createEmptyTimelineEntry()]
          }))
          .filter((chapter) => !isLegacySeedChapter(chapter));

        setChapters(restoredChapters);
        void hydrateStudioChaptersForMedia(accessToken, restoredChapters)
          .then((hydratedChapters) => {
            if (!cancelled) {
              setChapters(hydratedChapters);
            }
          })
          .catch(() => undefined);
      }
      if (Array.isArray(savedDraft.timelineEntries) && (!savedDraft.chapters || savedDraft.chapters.length === 0)) {
        restoredLocalDraftRef.current = true;
        setTimelineEntries(savedDraft.timelineEntries.length ? savedDraft.timelineEntries : [createEmptyTimelineEntry()]);
      }
      if (Array.isArray(savedDraft.draftHistory) && savedDraft.draftHistory.length > 0) {
        setDraftHistory(savedDraft.draftHistory);
      }
      if (savedDraft.transcriptionLanguage) {
        setTranscriptionLanguage(savedDraft.transcriptionLanguage);
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
  }, [accessToken, studioStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedStudioDraftRef.current || !isStudioDraftHydrated) {
      return;
    }

    const snapshotChapters = getLiveChaptersSnapshot();
    const serializableChapters = snapshotChapters.map((chapter) => ({
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

    const draftPayload = {
      currentStoryId,
      activeChapter,
      isPremium,
      visibility,
      anonymous,
      storyTitle,
      storySummary,
      chapterType,
      allowComments,
      chapters: serializableChapters,
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
    currentStoryId,
    liveEditorBody,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    isStudioDraftHydrated,
    studioStorageKey
  ]);

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  useEffect(() => {
    voiceNotesRef.current = voiceNotes;
  }, [voiceNotes]);

  useEffect(() => {
    if (isEnteringStudio) {
      return;
    }

    const editor = chapterBodyRef.current;
    if (editor && editor.innerHTML !== chapterBody) {
      editor.innerHTML = chapterBody;
    }
  }, [chapterBody, activeChapter, isEnteringStudio]);

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

  const appendImages = async (files: FileList | null, source: string) => {
    if (!files?.length) {
      return;
    }

    setMediaError(null);

    const remainingSlots = imageLimit - imageAttachments.length;

    if (remainingSlots <= 0) {
      setMediaError("Image attachment limit reached. Upgrade to premium for more slots.");
      return;
    }

    const nextFiles = Array.from(files).slice(0, remainingSlots);
    setVoiceRecordingStatus("Uploading image attachments...");
    const optimisticImages = nextFiles.map((file, index) => ({
      localId: `${Date.now()}-${index}-${file.name}`,
      name: file.name || `${source} image`,
      url: URL.createObjectURL(file),
      source: "Uploading image...",
      blob: file
    }));

    setImageAttachments((current) => {
      const updated = [...current, ...optimisticImages];
      updateActiveChapterMedia("imageAttachments", updated);
      return updated;
    });

    void Promise.all(
      optimisticImages.map(async (attachment, index) => {
        const file = nextFiles[index];
        const uploaded = await uploadMediaAsset(accessToken, {
          blob: file,
          fileName: file.name || `${source} image.jpg`,
          contentType: file.type || "image/jpeg"
        });

        return {
          ...attachment,
          url: uploaded.readUrl,
          source,
          objectKey: uploaded.objectKey
        };
      })
    )
      .then((uploadedImages) => {
        setImageAttachments((current) => {
          const updated = current.map((attachment) => {
            const uploaded = uploadedImages.find((item) => item.localId === attachment.localId);
            if (!uploaded) {
              return attachment;
            }
            if (isBlobUrl(attachment.url)) {
              URL.revokeObjectURL(attachment.url);
            }
            return uploaded;
          });
          updateActiveChapterMedia("imageAttachments", updated);
          return updated;
        });
        setVoiceRecordingStatus("Image attachments saved.");
      })
      .catch((error) => {
        optimisticImages.forEach((attachment) => {
          if (isBlobUrl(attachment.url)) {
            URL.revokeObjectURL(attachment.url);
          }
        });
        setImageAttachments((current) => {
          const updated = current.filter(
            (attachment) => !optimisticImages.some((item) => item.localId === attachment.localId)
          );
          updateActiveChapterMedia("imageAttachments", updated);
          return updated;
        });
        setMediaError(getErrorMessage(error, "Could not save the selected images."));
        setVoiceRecordingStatus("Image upload failed.");
      });

    if (files.length > remainingSlots) {
      setMediaError("Some images were skipped because the current plan limit was reached.");
    }
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    void appendImages(event.target.files, "Upload").catch((error) => {
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

        setVoiceNotes((current) => {
          const updated = [
            ...current,
            {
              localId,
              name: nextVoiceName,
              url,
              source: "Uploading voice note...",
              blob
            }
          ];
          updateActiveChapterMedia("voiceNotes", updated);
          return updated;
        });

        setVoiceRecordingStatus("Uploading voice note...");

        void uploadMediaAsset(accessToken, {
          blob,
          fileName: `${nextVoiceName}.webm`,
          contentType: blob.type || "audio/webm"
        })
          .then((uploaded) => {
            setVoiceNotes((current) => {
              const updated = current.map((voice) =>
                voice.localId === localId
                  ? {
                      ...voice,
                      url: uploaded.readUrl,
                      source: "Recorded in studio",
                      objectKey: uploaded.objectKey
                    }
                  : voice
              );
              updateActiveChapterMedia("voiceNotes", updated);
              return updated;
            });
            setVoiceRecordingStatus("Recording stopped. Voice note saved.");
          })
          .catch((error) => {
            setVoiceNotes((current) => {
              const updated = current.filter((voice) => voice.localId !== localId);
              updateActiveChapterMedia("voiceNotes", updated);
              return updated;
            });
            if (isBlobUrl(url)) {
              URL.revokeObjectURL(url);
            }
            const message = getErrorMessage(error, "Could not upload the voice note.");
            setMediaError(`${message} Voice notes only appear after a successful upload.`);
            openStudioNotice("Voice note upload failed", `${message} Record again when your connection is stable.`);
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
    setImageAttachments((current) => {
      const target = current.find((attachment) => attachment.url === url);
      if (target && isBlobUrl(target.url)) {
        URL.revokeObjectURL(target.url);
      }
      const updated = current.filter((attachment) => attachment.url !== url);
      updateActiveChapterMedia("imageAttachments", updated);
      return updated;
    });
  };

  const openImageSlot = () => {
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
    setVoiceNotes((current) => {
      const target = current.find((voice) => voice.url === url);
      if (target && isBlobUrl(target.url)) {
        URL.revokeObjectURL(target.url);
      }
      const updated = current.filter((voice) => voice.url !== url);
      updateActiveChapterMedia("voiceNotes", updated);
      return updated;
    });
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
    const normalizedTitle = normalizeChapterTitle(nextTitle) || "Untitled chapter";
    updateChapter((chapter) => ({
      ...chapter,
      title: normalizedTitle
    }));
    setActiveChapter(normalizedTitle);
    invalidatePreviewReview();
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
    const nextText = editor.textContent ?? "";
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
    const nextSnapshot = chapters.map((chapter, index) =>
      index === (activeChapterIndex >= 0 ? activeChapterIndex : 0)
        ? {
            ...chapter,
            body: nextHtml,
            words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length,
            imageAttachments: [...imageAttachmentsRef.current],
            voiceNotes: [...voiceNotesRef.current],
            timelineEntries: [...timelineEntries]
          }
        : chapter
    );
    updateChapter((chapter) => ({
      ...chapter,
      body: nextHtml,
      words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length
    }));
    if (typeof window !== "undefined" && hasLoadedStudioDraftRef.current) {
      const serializableChapters = nextSnapshot.map((chapter) => ({
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
      const draftPayload = {
        currentStoryId,
        activeChapter,
        isPremium,
        visibility,
        anonymous,
        storyTitle,
        storySummary,
        chapterType,
        allowComments,
        chapters: serializableChapters,
        timelineEntries,
        draftHistory,
        transcriptionLanguage
      };
      window.localStorage.setItem(studioStorageKey, JSON.stringify(draftPayload));
    }
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

  const saveCurrentDraft = (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet ?? false;
    const snapshot = buildChaptersSnapshot();
    setChapters((current) =>
      current.map((chapter) =>
        chapter.title === activeChapter ? { ...chapter, status: "Draft saved", words: wordCount } : chapter
      )
    );

    if (canPersistStoryRemotely(snapshot)) {
      void ensureStoryMediaUploaded(snapshot)
        .then((uploadedChapters) => persistStory(buildStoryPayload("draft", uploadedChapters), "Autosaved."))
        .catch((error) => {
          setStudioMessage(getErrorMessage(error, "Could not upload chapter media."));
        });
    }

    if (quiet) {
      setStudioMessage("All studio changes auto-saved.");
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
      openStudioNotice("Chapter saved with pending items", noticeBody);
      scrollToCurrentChapterIssue();
      setDraftHistory((current) => [`${activeChapterNumberLabel} saved with pending items.`, ...current].slice(0, 6));
      return;
    }

    setStudioMessage(`${activeChapterNumberLabel} is saved and ready for preview.`);
    setDraftHistory((current) => [`${activeChapterNumberLabel} saved as draft.`, ...current].slice(0, 6));
  };

  useEffect(() => {
    if (!hasLoadedStudioDraftRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (autoSaveSignature === lastAutoSavedSignatureRef.current) {
        return;
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
    autoSaveSignature
  ]);

  const publishWholeStory = () => {
    const snapshot = buildChaptersSnapshot();
    const metrics = getChapterMetrics(snapshot);
    const readyChaptersSnapshot = metrics.filter((chapter) => chapter.isComplete);
    const startedIncompleteChaptersSnapshot = metrics.filter((chapter) => !chapter.isComplete && chapter.words > 0);

    if (readyChaptersSnapshot.length === 0) {
      guideToSection(
        chapterEditorSectionRef,
        `Finish at least one chapter before publishing. Chapters need a title and at least ${chapterCompletionThreshold} words.`
      );
      return;
    }

    if (!hasReviewedPreview) {
      openStudioNotice(
        "Review before publish",
        startedIncompleteChaptersSnapshot.length > 0
          ? `After preview review, these chapters will go live: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}. Unfinished chapters will stay as drafts: ${startedIncompleteChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`
          : `After preview review, these chapters will go live: ${readyChaptersSnapshot.map((chapter) => chapter.title).join(", ")}.`
      );
      scrollToSectionTop(publishSectionRef);
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

  const ensureStudioAttachmentUploaded = async (attachment: StudioMediaAttachment, fallbackExtension: string, fallbackType: string) => {
    if (attachment.objectKey) {
      return attachment;
    }

    if (!attachment.blob) {
      return attachment;
    }

    const contentType = attachment.blob.type || fallbackType;
    const fileName = attachment.name.includes(".") ? attachment.name : `${attachment.name}${fallbackExtension}`;
    const uploaded = await uploadMediaAsset(accessToken, {
      blob: attachment.blob,
      fileName,
      contentType
    });

    return {
      ...attachment,
      objectKey: uploaded.objectKey,
      url: uploaded.readUrl
    };
  };

  const ensureStoryMediaUploaded = async (sourceChapters: StudioChapter[]) => {
    const uploadedChapters = await Promise.all(
      sourceChapters.map(async (chapter) => {
        const uploadedImages = await Promise.all(
          chapter.imageAttachments.map((attachment) =>
            ensureStudioAttachmentUploaded(attachment, ".jpg", attachment.blob?.type || "image/jpeg")
          )
        );
        const uploadedVoiceNotes = await Promise.all(
          chapter.voiceNotes.map((voice) =>
            ensureStudioAttachmentUploaded(voice, ".webm", voice.blob?.type || "audio/webm")
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

    return ({
    title: storyTitle,
    summary: storySummary,
    coverImageUrl: persistedChapters.flatMap((chapter) => chapter.imageAttachments)[0]?.objectKey,
    visibility: anonymous ? "public" : visibility,
    anonymous,
    allowedViewerIds: [],
    tags: [],
    status,
    chapters: persistedChapters.map((chapter, index) => ({
      title: chapter.title,
      body: chapter.body,
      type:
        chapter.type.toLowerCase() === "anon"
          ? "anonymous"
          : (chapter.type.toLowerCase() as "memory" | "reflection" | "milestone" | "anonymous"),
      order: index + 1,
      imageUrls: chapter.imageAttachments.map((attachment) => attachment.objectKey ?? attachment.url),
      voiceNoteUrl: chapter.voiceNotes[0]?.objectKey ?? chapter.voiceNotes[0]?.url,
      moments: chapter.timelineEntries
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
  };

  const validateStoryBeforePersist = () => {
    const summaryWords = storySummary.trim().split(/\s+/).filter(Boolean).length;

    if (storyTitle.trim().length < 3) {
      const message = "Add a clearer story title before continuing.";
      setStudioMessage(message);
      openStudioNotice("Story title too short", message);
      scrollToSectionTop(mediaSectionRef);
      return false;
    }

    if (summaryWords < 20) {
      const message = `Add a fuller story summary with at least 20 words. You currently have ${summaryWords}.`;
      setStudioMessage(message);
      openStudioNotice("Story summary needs more detail", message);
      scrollToSectionTop(mediaSectionRef);
      return false;
    }

    return true;
  };

  const persistStory = async (payload: ReturnType<typeof buildStoryPayload>, successMessage: string) => {
    console.info("[studio] persist story payload", {
      currentStoryId,
      title: payload.title,
      status: payload.status,
      chapterCount: payload.chapters.length,
      imageCount: payload.chapters.reduce((sum, chapter) => sum + chapter.imageUrls.length, 0),
      voiceCount: payload.chapters.reduce((sum, chapter) => sum + (chapter.voiceNoteUrl ? 1 : 0), 0),
      chapterTitles: payload.chapters.map((chapter) => chapter.title)
    });

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
    return story;
  };

  const updateTimelineEntry = (index: number, field: "title" | "body", value: string) => {
    setTimelineEntries((current) => {
      const updated = current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry));
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    invalidatePreviewReview();
  };

  const addTimelineEntry = () => {
    setTimelineEntries((current) => {
      const updated = [
        ...current,
        createEmptyTimelineEntry()
      ];
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    setStudioMessage("New timeline moment added.");
    setDraftHistory((current) => ["Timeline moment added.", ...current].slice(0, 6));
  };

  const removeTimelineEntry = (index: number) => {
    setTimelineEntries((current) => {
      const filtered = current.filter((_, entryIndex) => entryIndex !== index);
      const updated = filtered.length ? filtered : [createEmptyTimelineEntry()];
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    setStudioMessage("Timeline moment removed.");
    setDraftHistory((current) => ["Timeline moment removed.", ...current].slice(0, 6));
    invalidatePreviewReview();
  };

  const updateTimelineDatePart = (index: number, field: "year" | "month" | "day", value: string) => {
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
      updateActiveChapterMedia("timelineEntries", updated);
      return updated;
    });
    invalidatePreviewReview();
  };

  const handlePreviewToggle = async () => {
    if (!validateStoryBeforePersist()) {
      return;
    }

    try {
      const snapshot = buildChaptersSnapshot();
      const uploadedChapters = await ensureStoryMediaUploaded(snapshot);
      const previewChapters = sanitizePreviewChaptersForCurrentPlan(uploadedChapters);
      const draftPayload = buildStoryPayload("draft", previewChapters);
      const story = await persistStory(draftPayload, "Autosaved.");
      const uploadedActiveChapter = previewChapters[activeChapterIndex >= 0 ? activeChapterIndex : 0];
      const previewPayload: StudioPreviewPayload = {
        storyId: story.id,
        storyTitle,
        storySummary,
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
        chapterStatus: uploadedActiveChapter?.status ?? "Draft saved",
        chapterChecklist: {
          required: currentChapterRequiredItems,
          optional: currentChapterOptionalItems
        }
      };

      const publishPayload: StudioPublishPayload = {
        storyId: story.id,
        payload: buildStoryPayload("published", previewChapters)
      };

      window.sessionStorage.setItem("histora-studio-preview", JSON.stringify(previewPayload));
      window.sessionStorage.setItem("histora-studio-publish-payload", JSON.stringify(publishPayload));
      window.sessionStorage.setItem("histora-studio-reviewed", "true");
      setHasReviewedPreview(true);
      setStudioMessage(`Preview opened for ${uploadedActiveChapter?.title || activeChapterLabel}. Review it before publishing.`);
      navigate("/studio/preview");
    } catch (error) {
      const message = getErrorMessage(error, "Could not open preview.");
      setStudioMessage(message);
      openStudioNotice("Preview failed", message);
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

  const publishPanel = (
    <article className="studio-panel card">
      <SectionLabelComponent>PUBLISH_CONTROL</SectionLabelComponent>
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
        <button className="primary-action" onClick={() => void handlePreviewToggle()} type="button">FINISH AND PREVIEW</button>
      </div>
    </article>
  );

  const privacyPanel = (
    <article className="rail-panel card">
      <SectionLabelComponent>PRIVACY_CONTROL</SectionLabelComponent>
      <div className="choice-stack">
        {["private", "selected", "public"].map((option) => (
          <button
            key={option}
            className={visibility === option ? "choice-button active-choice" : "choice-button"}
            onClick={() => setVisibility(option as "private" | "selected" | "public")}
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

  return (
    <main className="page-shell">
      <section className="studio-header card">
        <div>
          <SectionLabelComponent>WRITING_STUDIO</SectionLabelComponent>
          <h1>DRAFT LIKE AN EDITOR. PUBLISH LIKE A PLATFORM.</h1>
          <p>Build chapters, attach images and voice notes, and control how every finished draft gets published.</p>
        </div>
        <div className="hero-actions">
          <button className="ghost-action" onClick={exitStudioMode} type="button">EXIT STUDIO</button>
        </div>
      </section>
      <section className="studio-status-bar card">
        <strong>{studioMessage}</strong>
        <span>{isAutoSavingDraft ? "Auto-saving..." : `${wordCount} words in active chapter`}</span>
      </section>
      {studioNotice ? (
        <section className="studio-notice card studio-notice-live" role="status">
          <span className="studio-notice-badge" aria-hidden="true">
            <IconComponent className="button-icon" name="bolt" />
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
                <SectionLabelComponent>CHAPTER_SWITCHER</SectionLabelComponent>
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
                  key={chapter.chapterLabel}
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
                <SectionLabelComponent>STORY_SETUP</SectionLabelComponent>
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
                <SectionLabelComponent>CURRENT_CHAPTER</SectionLabelComponent>
                <span className="current-chapter-kicker">
                  Working on {chapterSlots.find((chapter) => chapter.title === activeChapter)?.chapterLabel ?? "Current chapter"}
                </span>
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
                      <IconComponent className="button-icon" name="mic" />
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

          <article className="studio-panel card">
            <div className="section-head">
              <div>
                <SectionLabelComponent>MEDIA_ATTACHMENTS</SectionLabelComponent>
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
                    <IconComponent className="button-icon" name="close" />
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

      <section className="timeline-stage mobile-only">
        {privacyPanel}
      </section>

      <section className="timeline-stage">
        {publishPanel}
      </section>

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
