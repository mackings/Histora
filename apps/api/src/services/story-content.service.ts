import type { StorySaveInput } from "../shared/index.js";
import { ENCRYPTED_CONTENT_PLACEHOLDER, decryptJsonValue, encryptJsonValue } from "./encryption.service.js";

type StoryLinkContent = {
  label: string;
  url: string;
  kind: "website" | "social" | "drive" | "photos";
};

type StoryMomentContent = {
  title: string;
  description: string;
};

type StoryChapterContent = {
  title: string;
  body: string;
  moments: StoryMomentContent[];
};

export type StoryTextContent = {
  title: string;
  summary: string;
  tags: string[];
  links: StoryLinkContent[];
  chapters: StoryChapterContent[];
};

type StoryShape = {
  contentEncrypted?: string | null;
  title: string;
  summary?: string;
  tags?: string[];
  links?: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  chapters?: Array<{
    title: string;
    body: string;
    moments: Array<{
      title: string;
      description: string;
    }>;
  }>;
};

export function buildStoredStoryContent(input: StorySaveInput) {
  const content: StoryTextContent = {
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    links: input.links,
    chapters: input.chapters.map((chapter) => ({
      title: chapter.title,
      body: chapter.body,
      moments: chapter.moments.map((moment) => ({
        title: moment.title,
        description: moment.description
      }))
    }))
  };

  return {
    title: ENCRYPTED_CONTENT_PLACEHOLDER,
    summary: ENCRYPTED_CONTENT_PLACEHOLDER,
    tags: [],
    links: [],
    chapters: input.chapters.map((chapter) => ({
      ...chapter,
      title: ENCRYPTED_CONTENT_PLACEHOLDER,
      body: ENCRYPTED_CONTENT_PLACEHOLDER,
      moments: chapter.moments.map((moment) => ({
        ...moment,
        title: ENCRYPTED_CONTENT_PLACEHOLDER,
        description: ENCRYPTED_CONTENT_PLACEHOLDER
      }))
    })),
    contentEncrypted: encryptJsonValue(content)
  };
}

export function resolveStoryTextContent(story: StoryShape): StoryTextContent {
  const decrypted = decryptJsonValue<StoryTextContent>(story.contentEncrypted);
  if (decrypted) {
    return decrypted;
  }

  return {
    title: story.title,
    summary: story.summary ?? "",
    tags: story.tags ?? [],
    links: (story.links ?? []).map((link) => ({
      label: link.label,
      url: link.url,
      kind: link.kind
    })),
    chapters: (story.chapters ?? []).map((chapter) => ({
      title: chapter.title,
      body: chapter.body,
      moments: chapter.moments.map((moment) => ({
        title: moment.title,
        description: moment.description
      }))
    }))
  };
}
