import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  apiRequest,
  type ApiComment,
  getCachedStory,
  getEventsSocketUrl,
  prefetchStoryBySlug,
  updateCachedStoryCounts
} from "../../lib/api-client";
import { type FeedStoryRecord, type FeedThreadComment, type ShareSheetPayload, toFeedStoryRecord } from "./models";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "./ui-types";

type RealtimeEventMessage =
  | {
      type: "event";
      channel: string;
      payload:
        | {
            kind: "story.reaction.updated";
            storyId: string;
            action?: "like" | "bookmark";
            active?: boolean;
            likesCount: number;
            bookmarksCount: number;
            reactionsCount: number;
          }
        | {
            kind: "comment.created";
            comment: ApiComment;
          }
        | {
            kind: "follow.updated";
            username: string;
            active: boolean;
          }
        | {
            kind: "story.share.updated";
            storyId: string;
            sharesCount: number;
          };
    }
  | {
      type: "ready" | "subscribed" | "error";
      channel?: string;
      error?: string;
      channels?: string[];
    };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const bumpStorySaveCount = (value: string, delta: number) =>
  String(Math.max(0, Number.parseInt(value, 10) + delta || 0));

export function ShareSheet({
  share,
  onClose,
  onFeedback,
  onShared,
  IconComponent,
  SectionLabelComponent
}: {
  share: ShareSheetPayload;
  onClose: () => void;
  onFeedback: (message: string) => void;
  onShared?: () => Promise<void> | void;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const openShareTarget = async (target: "copy" | "email" | "whatsapp" | "more") => {
    if (typeof window === "undefined") {
      return;
    }

    if (target === "copy") {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(share.url);
        await onShared?.();
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
        await onShared?.();
        onFeedback("Shared successfully.");
      } else {
        onFeedback("More apps sharing is not available in this browser.");
      }
      onClose();
      return;
    }

    const encodedText = encodeURIComponent(`${share.text} ${share.url}`);
    const encodedTitle = encodeURIComponent(share.title);
    const targetUrl =
      target === "whatsapp"
        ? `https://wa.me/?text=${encodedText}`
        : `mailto:?subject=${encodedTitle}&body=${encodedText}`;

    window.open(targetUrl, "_blank", "noopener,noreferrer");
    await onShared?.();
    onFeedback(target === "whatsapp" ? "Opening WhatsApp share..." : "Opening email share...");
    onClose();
  };

  return (
    <div className="status-viewer-backdrop" onClick={onClose} role="presentation">
      <article className="share-sheet-modal card" onClick={(event) => event.stopPropagation()}>
        <div className="status-composer-top">
          <div>
            <SectionLabelComponent>SHARE_STORY</SectionLabelComponent>
            <h3>{share.title}</h3>
          </div>
          <button aria-label="Close share dialog" className="icon-chip" onClick={onClose} type="button">
            <IconComponent className="button-icon" name="close" />
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

export function FeedStoryPage({
  accessToken,
  currentUserId,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  currentUserId: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { storySlug } = useParams();
  const prefetchedStory = (location.state as { prefetchedStory?: FeedStoryRecord } | null)?.prefetchedStory ?? null;
  const [stories, setStories] = useState<FeedStoryRecord[]>(() =>
    prefetchedStory && prefetchedStory.slug === storySlug ? [prefetchedStory] : []
  );
  const [isStoryLoading, setIsStoryLoading] = useState(!prefetchedStory || prefetchedStory.slug !== storySlug);
  const [chapterReplyDrafts, setChapterReplyDrafts] = useState<Record<string, string>>({});
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareSheet, setShareSheet] = useState<ShareSheetPayload | null>(null);
  const [helpTarget, setHelpTarget] = useState<FeedStoryRecord | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState("");
  const [commentToast, setCommentToast] = useState("");
  const [pendingStoryActions, setPendingStoryActions] = useState<Record<"like" | "bookmark" | "follow", boolean>>({
    like: false,
    bookmark: false,
    follow: false
  });
  const [pendingChapterComments, setPendingChapterComments] = useState<Record<string, boolean>>({});

  const story = stories.find((entry) => entry.slug === storySlug) ?? null;
  const totalChapterComments = story?.chapters.reduce((total, chapter) => total + chapter.comments.length, 0) ?? 0;
  const activeChapter = story?.chapters.find((chapter) => chapter.id === activeChapterId) ?? story?.chapters[0] ?? null;
  const activeChapterIndex = story?.chapters.findIndex((chapter) => chapter.id === activeChapter?.id) ?? 0;
  const relatedChapters = story?.chapters.filter((chapter) => chapter.id !== activeChapter?.id) ?? [];
  const activeChapterNumber = activeChapterIndex >= 0 ? activeChapterIndex + 1 : 1;

  useEffect(() => {
    let cancelled = false;

    if (!storySlug) {
      setIsStoryLoading(false);
      return;
    }

    if (!prefetchedStory || prefetchedStory.slug !== storySlug) {
      setIsStoryLoading(true);
    }
    const cachedStory = !prefetchedStory || prefetchedStory.slug !== storySlug ? getCachedStory(storySlug) : null;
    if (cachedStory) {
      const nextStory = toFeedStoryRecord({
        ...cachedStory,
        chapterCount: cachedStory.chapters.length,
        commentCount: cachedStory.commentsCount
      });
      setStories([nextStory]);
      setIsStoryLoading(false);
    }

    void prefetchStoryBySlug(storySlug, accessToken)
      .then(async (storyPayload) => {
        const nextStory = toFeedStoryRecord({
          ...storyPayload,
          chapterCount: storyPayload.chapters.length,
          commentCount: storyPayload.commentsCount
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
        setIsStoryLoading(false);
      })
      .catch((error) => {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load this story."));
          setIsStoryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, prefetchedStory, storySlug]);

  useEffect(() => {
    if (!story) {
      return;
    }

    setActiveChapterId(story.chapters[0]?.id ?? "");
  }, [story?.slug]);

  useEffect(() => {
    if (!commentToast) {
      return;
    }

    const timer = window.setTimeout(() => setCommentToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [commentToast]);

  useEffect(() => {
    if (typeof window === "undefined" || !accessToken) {
      return;
    }

    const socket = new WebSocket(getEventsSocketUrl(accessToken));

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "subscribe", channel: "feed" }));
      socket.send(JSON.stringify({ type: "subscribe", channel: `user:${currentUserId}` }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as RealtimeEventMessage;
        if (message.type !== "event" || !storySlug) {
          return;
        }

        const payload = message.payload;

        if (payload.kind === "story.reaction.updated") {
          updateCachedStoryCounts(payload.storyId, (nextStory) => ({
            ...nextStory,
            likesCount: payload.likesCount,
            bookmarksCount: payload.bookmarksCount,
            reactionsCount: payload.likesCount + payload.bookmarksCount,
            ...(message.channel === `user:${currentUserId}` && payload.action
              ? {
                  liked: payload.action === "like" ? !!payload.active : nextStory.liked,
                  bookmarked: payload.action === "bookmark" ? !!payload.active : nextStory.bookmarked
                }
              : {})
          }));
          updateStory((current) =>
            current.id === payload.storyId
              ? {
                  ...current,
                  likes: payload.likesCount,
                  saves: String(payload.bookmarksCount),
                  ...(message.channel === `user:${currentUserId}` && payload.action
                    ? {
                        liked: payload.action === "like" ? !!payload.active : current.liked,
                        bookmarked: payload.action === "bookmark" ? !!payload.active : current.bookmarked
                      }
                    : {})
                }
              : current
          );
          return;
        }

        if (payload.kind === "story.share.updated") {
          updateCachedStoryCounts(payload.storyId, (nextStory) => ({
            ...nextStory,
            sharesCount: payload.sharesCount
          }));
          updateStory((current) =>
            current.id === payload.storyId
              ? {
                  ...current,
                  shares: payload.sharesCount
                }
              : current
          );
          return;
        }

        if (payload.kind === "comment.created" && payload.comment.targetType === "storyChapter") {
          const [storyId, chapterOrder] = payload.comment.targetId.split(":");
          updateStory((current) =>
            current.id === storyId
              ? {
                  ...current,
                  comments: current.comments + 1,
                  chapters: current.chapters.map((chapter, index) =>
                    String(index + 1) === chapterOrder &&
                    !chapter.comments.some(
                      (entry) =>
                        entry.text === payload.comment.body &&
                        entry.handle === `@${payload.comment.authorUsername}`
                    )
                      ? {
                          ...chapter,
                          comments: [
                            ...chapter.comments,
                            {
                              author: payload.comment.authorName,
                              handle: `@${payload.comment.authorUsername}`,
                              text: payload.comment.body,
                              time: new Date(payload.comment.createdAt).toLocaleDateString()
                            }
                          ]
                        }
                      : chapter
                  )
                }
              : current
          );
          return;
        }

        if (payload.kind === "follow.updated" && story?.handle.replace(/^@/, "") === payload.username) {
          updateStory((current) => ({ ...current, following: payload.active }));
        }
      } catch {
        return;
      }
    });

    return () => {
      socket.close();
    };
  }, [accessToken, currentUserId, story?.handle, storySlug]);

  const updateStory = (updater: (story: FeedStoryRecord) => FeedStoryRecord) => {
    if (!story) {
      return;
    }

    setStories((current) => current.map((entry) => (entry.slug === story.slug ? updater(entry) : entry)));
  };

  const recordStoryShare = async (storyId: string) => {
    const result = await apiRequest<{ storyId: string; sharesCount: number }>(`/stories/${storyId}/share`, {
      method: "POST",
      accessToken
    });

    updateCachedStoryCounts(result.storyId, (nextStory) => ({
      ...nextStory,
      sharesCount: result.sharesCount
    }));
    updateStory((current) =>
      current.id === result.storyId
        ? {
            ...current,
            shares: result.sharesCount
          }
        : current
    );
  };

  const toggleFollow = () => {
    if (!story || pendingStoryActions.follow) {
      return;
    }

    const previousFollowing = story.following;
    updateStory((current) => ({ ...current, following: !current.following }));
    setPendingStoryActions((current) => ({ ...current, follow: true }));

    void apiRequest<{ username: string; active: boolean }>(
      `/profile/follows/${story.handle.replace(/^@/, "")}/toggle`,
      { method: "POST", accessToken }
    )
      .then((result) => {
        updateStory((current) => ({ ...current, following: result.active }));
        setPendingStoryActions((current) => ({ ...current, follow: false }));
      })
      .catch((error) => {
        updateStory((current) => ({ ...current, following: previousFollowing }));
        setPendingStoryActions((current) => ({ ...current, follow: false }));
        setShareFeedback(getErrorMessage(error, "Could not update follow state."));
      });
  };

  const toggleStoryLike = () => {
    if (!story || pendingStoryActions.like) {
      return;
    }

    const previousStory = story;
    updateStory((current) => ({
      ...current,
      liked: !current.liked,
      likes: Math.max(0, current.likes + (current.liked ? -1 : 1))
    }));
    setPendingStoryActions((current) => ({ ...current, like: true }));

    void apiRequest<{ active: boolean; likesCount: number; bookmarksCount: number; reactionsCount: number }>(
      `/stories/${story.id}/reactions`,
      {
        method: "POST",
        accessToken,
        body: { action: "like" }
      }
    )
      .then((result) => {
        updateCachedStoryCounts(story.id, (nextStory) => ({
          ...nextStory,
          liked: result.active,
          likesCount: result.likesCount,
          bookmarksCount: result.bookmarksCount,
          reactionsCount: result.reactionsCount
        }));
        updateStory((current) => ({
          ...current,
          liked: result.active,
          likes: result.likesCount,
          saves: String(result.bookmarksCount)
        }));
        setPendingStoryActions((current) => ({ ...current, like: false }));
      })
      .catch((error) => {
        updateStory(() => previousStory);
        setPendingStoryActions((current) => ({ ...current, like: false }));
        setShareFeedback(getErrorMessage(error, "Could not update story like."));
      });
  };

  const toggleStoryBookmark = () => {
    if (!story || pendingStoryActions.bookmark) {
      return;
    }

    const previousStory = story;
    updateStory((current) => ({
      ...current,
      bookmarked: !current.bookmarked,
      saves: bumpStorySaveCount(current.saves, current.bookmarked ? -1 : 1)
    }));
    setPendingStoryActions((current) => ({ ...current, bookmark: true }));

    void apiRequest<{ active: boolean; likesCount: number; bookmarksCount: number; reactionsCount: number }>(
      `/stories/${story.id}/reactions`,
      {
        method: "POST",
        accessToken,
        body: { action: "bookmark" }
      }
    )
      .then((result) => {
        updateCachedStoryCounts(story.id, (nextStory) => ({
          ...nextStory,
          bookmarked: result.active,
          likesCount: result.likesCount,
          bookmarksCount: result.bookmarksCount,
          reactionsCount: result.reactionsCount
        }));
        updateStory((current) => ({
          ...current,
          bookmarked: result.active,
          likes: result.likesCount,
          saves: String(result.bookmarksCount)
        }));
        setPendingStoryActions((current) => ({ ...current, bookmark: false }));
      })
      .catch((error) => {
        updateStory(() => previousStory);
        setPendingStoryActions((current) => ({ ...current, bookmark: false }));
        setShareFeedback(getErrorMessage(error, "Could not update bookmark."));
      });
  };

  const shareStory = async () => {
    if (!story) {
      return;
    }
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    setShareSheet({
      storyId: story.id,
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
    if (!story || !draft || pendingChapterComments[chapterId]) {
      return;
    }

    const optimisticComment: FeedThreadComment = {
      author: "You",
      handle: "@you",
      text: draft,
      time: "Just now",
      pending: true
    };

    setPendingChapterComments((current) => ({ ...current, [chapterId]: true }));
    updateStory((current) => ({
      ...current,
      chapters: current.chapters.map((chapter) =>
        chapter.id === chapterId ? { ...chapter, comments: [...chapter.comments, optimisticComment] } : chapter
      )
    }));
    setChapterReplyDrafts((current) => ({ ...current, [chapterId]: "" }));

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
            chapter.id === chapterId
              ? {
                  ...chapter,
                  comments: [
                    ...chapter.comments.filter(
                      (entry) =>
                        entry !== optimisticComment &&
                        !(entry.text === nextComment.text && entry.handle === nextComment.handle && !entry.pending)
                    ),
                    nextComment
                  ]
                }
              : chapter
          )
        }));
        setPendingChapterComments((current) => ({ ...current, [chapterId]: false }));
        setCommentToast("Your comment was posted.");
      })
      .catch((error) => {
        updateStory((current) => ({
          ...current,
          chapters: current.chapters.map((chapter) =>
            chapter.id === chapterId
              ? {
                  ...chapter,
                  comments: chapter.comments.filter((entry) => entry !== optimisticComment)
                }
              : chapter
          )
        }));
        setChapterReplyDrafts((current) => ({ ...current, [chapterId]: draft }));
        setPendingChapterComments((current) => ({ ...current, [chapterId]: false }));
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

  if (isStoryLoading) {
    return (
      <main className="page-shell">
        <section className="card feed-reader-empty">
          <h1>Loading story...</h1>
          <p>Fetching the published story and chapter thread.</p>
        </section>
      </main>
    );
  }

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
          <button className={story.following ? "primary-action" : "ghost-action"} disabled={pendingStoryActions.follow} onClick={toggleFollow} type="button">
            {story.following ? "UNFOLLOW" : "FOLLOW"}
          </button>
        </div>
      </section>

      <section className="feed-reader-single-column">
        <article className="feed-reader-main card story-reader-stage">
          <div className="story-reader-stage-copy">
            <SectionLabelComponent>STORY_READING</SectionLabelComponent>
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
            <button className={story.liked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} disabled={pendingStoryActions.like} onClick={toggleStoryLike} type="button">
              <IconComponent className="inline-icon" name="heart" />
              {story.likes}
            </button>
            <button className={story.bookmarked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} disabled={pendingStoryActions.bookmark} onClick={toggleStoryBookmark} type="button">
              <IconComponent className="inline-icon" name="bookmark" />
              {story.saves}
            </button>
            <button className="feed-action-pill" onClick={() => void shareStory()} type="button">
              <IconComponent className="inline-icon" name="share" />
              {story.shares}
            </button>
            {story.anonymous ? (
              <button className="feed-action-pill" onClick={() => {
                setHelpTarget(story);
                setConsentAccepted(false);
              }} type="button">
                <IconComponent className="inline-icon" name="bolt" />
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
                  <SectionLabelComponent>{`CHAPTER_${activeChapterNumber}`}</SectionLabelComponent>
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
                      <SectionLabelComponent>MEMORY_ATTACHMENTS</SectionLabelComponent>
                      <span>{activeChapter.images.length} images</span>
                    </div>
                    <div className="feed-reader-media-grid">
                      {activeChapter.images.map((image, index) => (
                        <figure className="feed-reader-media-frame" key={image.alt}>
                          <img alt={image.alt} className="post-image story-reader-image" decoding="async" loading="lazy" src={image.src} />
                          <figcaption>{`Attachment ${index + 1} // ${image.alt}`}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </section>
                ) : null}

                {activeChapter.voiceNotes.length ? (
                  <section className="chapter-content-section">
                    <div className="chapter-section-head">
                      <SectionLabelComponent>VOICE_NOTES</SectionLabelComponent>
                      <span>{activeChapter.voiceNotes.length} attached</span>
                    </div>
                    <div className="feed-reader-support-grid">
                      {activeChapter.voiceNotes.map((voice) => (
                        <article className="feed-reader-support-card voice-note-card" key={voice.name}>
                          <div className="voice-note-icon">
                            <IconComponent className="button-icon" name="mic" />
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
                      <SectionLabelComponent>TIMELINE_MOMENTS</SectionLabelComponent>
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

              <footer className="chapter-thread-footer">
                <div className="chapter-section-head">
                  <div>
                    <SectionLabelComponent>COMMENTS_THREAD</SectionLabelComponent>
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
                          <small>{comment.pending ? "Posting..." : comment.time}</small>
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
                  <button className="primary-action" disabled={pendingChapterComments[activeChapter.id]} onClick={() => submitChapterComment(activeChapter.id)} type="button">
                    {pendingChapterComments[activeChapter.id] ? "Posting..." : "Post reply"}
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
                <SectionLabelComponent>RELATED_CHAPTERS</SectionLabelComponent>
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
            <SectionLabelComponent>STORY_FOOTER</SectionLabelComponent>
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

      {commentToast ? (
        <div className="bottom-toast" role="status">
          {commentToast}
        </div>
      ) : null}

      {helpTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabelComponent>CONSENT_FEE</SectionLabelComponent>
                <h3>Render help for this anonymous story</h3>
              </div>
              <button aria-label="Close render help dialog" className="icon-chip" onClick={() => setHelpTarget(null)} type="button">
                <IconComponent className="button-icon" name="close" />
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
      {shareSheet ? (
        <ShareSheet
          IconComponent={IconComponent}
          SectionLabelComponent={SectionLabelComponent}
          onClose={() => setShareSheet(null)}
          onFeedback={setShareFeedback}
          onShared={shareSheet.storyId ? () => recordStoryShare(shareSheet.storyId!) : undefined}
          share={shareSheet}
        />
      ) : null}
    </main>
  );
}
