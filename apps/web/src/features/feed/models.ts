import { feedPreview } from "../../app-data";
import type { ApiFeedStory, ApiStory } from "../../lib/api-client";

export type FeedThreadComment = {
  author: string;
  handle: string;
  text: string;
  time: string;
  replyTo?: string;
  pending?: boolean;
};

export type FeedStoryChapter = {
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

export type FeedStoryRecord = (typeof feedPreview)[number] & {
  id: string;
  slug: string;
  coverImageUrl?: string | null;
  anonymous: boolean;
  updatedAt?: string;
  authorVerified: boolean;
  shares: number;
  likes: number;
  liked: boolean;
  bookmarked: boolean;
  following: boolean;
  links: Array<{
    label: string;
    url: string;
    kind: "website" | "social" | "drive" | "photos";
  }>;
  helpFee?: number;
  chapters: FeedStoryChapter[];
};

export type ShareSheetPayload = {
  storyId?: string;
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

export const toFeedStoryRecord = (story: ApiFeedStory): FeedStoryRecord => ({
  id: story.id,
  author: story.authorName,
  handle: `@${story.authorUsername}`,
  title: story.title,
  excerpt: story.summary,
  coverImageUrl: story.coverImageUrl ?? null,
  reads: String(story.readCount),
  visibility: story.anonymous ? "ANON" : story.visibility.toUpperCase(),
  genre: storyTypeToGenre(story.chapters[0]?.type ?? "memory"),
  chapterCount: story.chapterCount,
  comments: story.commentCount,
  saves: String(story.bookmarksCount),
  slug: story.slug,
  anonymous: story.anonymous,
  updatedAt: story.updatedAt,
  authorVerified: story.authorVerified,
  shares: story.sharesCount,
  likes: story.likesCount,
  liked: story.liked,
  bookmarked: story.bookmarked,
  following: story.following ?? false,
  links: story.links ?? [],
  helpFee: story.anonymous ? 8 : undefined,
  chapters: story.chapters.map((chapter) => ({
    id: `${story.id}:${chapter.order}`,
    title: chapter.title,
    body: chapter.body.replace(/<[^>]+>/g, " "),
    summary: chapter.body.replace(/<[^>]+>/g, " ").slice(0, 160),
    likes: 0,
    liked: false,
    comments: [],
    images: (chapter.imageUrls ?? []).map((src, index) => ({
      src,
      alt: `${chapter.title} attachment ${index + 1}`
    })),
    voiceNotes: chapter.voiceNoteUrl
      ? [{ name: `Voice note ${chapter.order}`, detail: "Attached voice note", src: chapter.voiceNoteUrl }]
      : [],
    timeline: (chapter.moments ?? []).map((moment) => ({
      label: new Date(moment.happenedAt).toLocaleDateString(),
      title: moment.title,
      body: moment.description
    }))
  }))
});

export const buildFeedStories = (): FeedStoryRecord[] =>
  feedPreview.map((post, index) => ({
    id: `preview-story-${index + 1}`,
    ...post,
    coverImageUrl: null,
    slug: slugifyStoryTitle(post.title),
    anonymous: post.visibility === "ANON",
    updatedAt: undefined,
    authorVerified: false,
    shares: [48, 31, 66][index] ?? 12,
    likes: [428, 213, 689][index] ?? 120,
    liked: false,
    bookmarked: false,
    following: false,
    links: [],
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
