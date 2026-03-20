export type StudioMediaAttachment = {
  localId?: string;
  name: string;
  url: string;
  source: string;
  objectKey?: string;
  blob?: Blob;
};

export type StudioTimelineEntry = {
  year: string;
  month: string;
  day: string;
  title: string;
  body: string;
};

export const createEmptyTimelineEntry = (): StudioTimelineEntry => ({
  year: "",
  month: "",
  day: "",
  title: "",
  body: ""
});

export type StudioChapter = {
  title: string;
  type: string;
  words: number;
  status: string;
  moments: number;
  body: string;
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
    status: "draft" | "published";
    chapters: Array<{
      title: string;
      body: string;
      type: "memory" | "reflection" | "milestone" | "anonymous";
      order: number;
      imageUrls: string[];
      voiceNoteUrl?: string;
      moments: Array<{
        title: string;
        description: string;
        happenedAt: string;
        imageUrls: string[];
        voiceNoteUrl?: string;
      }>;
    }>;
  };
};
