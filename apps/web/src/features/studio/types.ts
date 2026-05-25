export type StudioMediaAttachment = {
  localId?: string;
  replaceTargetUrl?: string;
  name: string;
  url: string;
  source: string;
  objectKey?: string;
  blob?: Blob;
};

export type StudioTimelineEntry = {
  id?: string;
  year: string;
  month: string;
  day: string;
  title: string;
  body: string;
  createdByName?: string | null;
  createdByUsername?: string | null;
  createdAt?: string | null;
  lastEditedByName?: string | null;
  lastEditedByUsername?: string | null;
  lastEditedAt?: string | null;
};

export type StudioExternalLink = {
  label: string;
  url: string;
  kind: "website" | "social" | "drive" | "photos";
};

export const createEmptyTimelineEntry = (): StudioTimelineEntry => ({
  year: "",
  month: "",
  day: "",
  title: "",
  body: ""
});

export type StudioChapter = {
  id?: string;
  title: string;
  type: string;
  words: number;
  status: string;
  moments: number;
  body: string;
  createdByName?: string | null;
  createdByUsername?: string | null;
  createdAt?: string | null;
  lastEditedByName?: string | null;
  lastEditedByUsername?: string | null;
  lastEditedAt?: string | null;
  imageAttachments: StudioMediaAttachment[];
  voiceNotes: StudioMediaAttachment[];
  timelineEntries: StudioTimelineEntry[];
};

export const createInitialStudioChapter = (index: number): StudioChapter => ({
  title: `Chapter ${index + 1}`,
  type: "MEMORY",
  words: 0,
  status: "DRAFT",
  moments: 0,
  body: "",
  imageAttachments: [],
  voiceNotes: [],
  timelineEntries: [createEmptyTimelineEntry()]
});

export type StudioPreviewPayload = {
  storyId?: string | null;
  storyTitle: string;
  storySummary: string;
  storyLinks: StudioExternalLink[];
  currentStoryStatus?: "draft" | "published";
  activeChapterNumberLabel: string;
  activeChapter: string;
  chapterType: string;
  visibility: string;
  chapterBody: string;
  wordCount: number;
  imageAttachments: StudioMediaAttachment[];
  voiceNotes: StudioMediaAttachment[];
  timelineEntries: StudioTimelineEntry[];
  allowComments: boolean;
  chapterStatus: string;
  chapterChecklist: {
    required: string[];
    optional: string[];
  };
};

export type StudioPublishPayload = {
  storyId?: string | null;
  payload: {
    title: string;
    summary: string;
    coverImageUrl?: string;
    visibility: "private" | "public" | "selected";
    anonymous: boolean;
    allowedViewerIds: string[];
    tags: string[];
    links: StudioExternalLink[];
    status: "draft" | "published";
    expectedRevision?: number;
    chapters: Array<{
      id?: string;
      title: string;
      body: string;
      type: "memory" | "reflection" | "milestone" | "anonymous";
      order: number;
      imageUrls: string[];
      voiceNoteUrl?: string;
      moments: Array<{
        id?: string;
        title: string;
        description: string;
        happenedAt: string;
        imageUrls: string[];
        voiceNoteUrl?: string;
      }>;
    }>;
  };
};
