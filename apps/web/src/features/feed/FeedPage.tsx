import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

import feedStory from "../../assets/feed-story.svg";
import { apiRequest, type ApiComment, type ApiStatus, prefetchStoryBySlug, updateCachedStoryCounts, uploadMediaAsset } from "../../lib/api-client";
import { ShareSheet } from "./FeedStoryPage";
import { buildFeedStories, type FeedStoryRecord, type ShareSheetPayload, toFeedStoryRecord } from "./models";
import {
  revalidateFeedStore,
  updateFeedPosts,
  updateFeedStatuses,
  updateLiveAnonymousSources,
  updateMyStatusIds,
  useFeedStore
} from "./store";
import {
  type AnonymousFeedSource,
  bumpStorySaveCount,
  formatAnonymousMeta,
  groupStatusEntries,
  removeStatusEntry,
  roundRect,
  statusUpdateEvent,
  type StatusEntry,
  toAnonymousPublicFeedSource,
  toStatusEntry,
  upsertStatusEntry,
  wrapCanvasText
} from "./support";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "./ui-types";

type StatusImageSelection = {
  id: string;
  previewUrl: string;
  uploadedUrl: string | null;
  fileName: string;
  uploading: boolean;
  uploadError: string;
  objectUrl: string | null;
};

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
          }
        | {
            kind: "status.created" | "status.deleted" | "status.reaction.updated";
            [key: string]: unknown;
          }
        | {
            kind: "anonymous.public.created";
            [key: string]: unknown;
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

const getStoryAudienceLabel = (visibility: string) => {
  if (visibility === "PRIVATE") {
    return "ONLY YOU";
  }
  if (visibility === "SELECTED") {
    return "SELECTED READERS";
  }
  return visibility;
};

const getStoryAudienceHelp = (visibility: string) => {
  if (visibility === "PRIVATE") {
    return "Only you can open this story.";
  }
  if (visibility === "SELECTED") {
    return "Only selected readers and you can open this story.";
  }
  return "Anyone who can see the feed can open this story.";
};

const isBlobUrl = (value: string | null | undefined) => Boolean(value?.startsWith("blob:"));

const getStatusAvatarLabel = (entry: Pick<StatusEntry, "name" | "anonymous">, fallback = "S") => {
  if (entry.anonymous) {
    return "A";
  }

  const normalizedName = entry.name.replace(/^@/, "").trim();
  return normalizedName.slice(0, 1).toUpperCase() || fallback;
};

function StoryCirclesRow({
  accessToken,
  statuses,
  myStatusIds,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  statuses: ApiStatus[];
  myStatusIds: Set<string>;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const emojiGroups = [
    { label: "Recent", icon: "🕘", emojis: ["😂", "❤️", "😭", "🔥", "🙏", "✨"] },
    { label: "Smileys", icon: "😊", emojis: ["😊", "😄", "😁", "😂", "🥹", "😮", "😌", "🤭"] },
    { label: "Love", icon: "💛", emojis: ["❤️", "💙", "💜", "💞", "💫", "🌈", "✨", "🫶"] },
    { label: "Support", icon: "🙌", emojis: ["👏", "🙏", "🙌", "🤍", "💭", "🤝", "🌟", "🕊️"] }
  ];
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [seenStatusIds, setSeenStatusIds] = useState<string[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState("Today I finally wrote the chapter I kept postponing.");
  const [statusStyle, setStatusStyle] = useState<"plain" | "bold" | "italic">("plain");
  const [statusTone, setStatusTone] = useState<"sky" | "mint" | "peach">("sky");
  const [showEmojiLibrary, setShowEmojiLibrary] = useState(false);
  const [activeEmojiGroup, setActiveEmojiGroup] = useState("Recent");
  const [isAnonymousComposer, setIsAnonymousComposer] = useState(false);
  const [isPostingStatus, setIsPostingStatus] = useState(false);
  const [statusItems, setStatusItems] = useState<StatusEntry[]>([]);
  const [shareFeedback, setShareFeedback] = useState("");
  const [helpRequestTarget, setHelpRequestTarget] = useState<StatusEntry | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedStatusImage, setSelectedStatusImage] = useState<StatusImageSelection | null>(null);
  const statusImageInputRef = useRef<HTMLInputElement | null>(null);

  const ownedStatusItems = useMemo(() => statusItems.filter((entry) => entry.owned), [statusItems]);
  const otherStatusItems = useMemo(() => statusItems.filter((entry) => !entry.owned), [statusItems]);
  const myStatusBubble = useMemo(
    () =>
      ownedStatusItems.length
        ? {
            primaryEntry: ownedStatusItems[0],
            count: ownedStatusItems.length,
            statusIds: ownedStatusItems.map((entry) => entry.id)
          }
        : null,
    [ownedStatusItems]
  );
  const statusBubbleGroups = useMemo(() => groupStatusEntries(otherStatusItems), [otherStatusItems]);
  const viewableStatuses = statusItems;
  const activeStatusIndex = activeStatusId ? viewableStatuses.findIndex((entry) => entry.id === activeStatusId) : -1;
  const activeStatus = activeStatusIndex >= 0 ? viewableStatuses[activeStatusIndex] : null;

  useEffect(() => {
    setStatusItems((current) => {
      const nextEntries = statuses.map((status) => toStatusEntry(status, { owned: myStatusIds.has(status.id) }));
      const preservedCommentMap = new Map(
        current
          .map((entry) => [entry.id, entry.comments ?? []] as const)
      );

      return nextEntries.map((entry) => ({
          ...entry,
          comments: preservedCommentMap.get(entry.id) ?? entry.comments
        }));
    });
  }, [myStatusIds, statuses]);

  useEffect(() => {
    return () => {
      if (selectedStatusImage?.objectUrl && isBlobUrl(selectedStatusImage.objectUrl)) {
        URL.revokeObjectURL(selectedStatusImage.objectUrl);
      }
    };
  }, [selectedStatusImage]);

  useEffect(() => {
    if (!activeStatus) {
      setProgress(0);
      setIsPaused(false);
      return;
    }
    setSeenStatusIds((current) => (current.includes(activeStatus.id) ? current : [...current, activeStatus.id]));
    setProgress(0);
  }, [activeStatus]);

  useEffect(() => {
    if (!activeStatus || isPaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const nextProgress = current + 4;
        if (nextProgress < 100) {
          return nextProgress;
        }
        setActiveStatusId(
          activeStatusIndex >= 0 && activeStatusIndex < viewableStatuses.length - 1
            ? viewableStatuses[activeStatusIndex + 1].id
            : null
        );
        return 100;
      });
    }, 160);
    return () => window.clearInterval(timer);
  }, [activeStatus, activeStatusIndex, isPaused, viewableStatuses]);

  useEffect(() => {
    if (!activeStatus) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setActiveStatusId(
          activeStatusIndex < viewableStatuses.length - 1
            ? viewableStatuses[activeStatusIndex + 1].id
            : viewableStatuses[activeStatusIndex]?.id ?? null
        );
      }
      if (event.key === "ArrowLeft") {
        setActiveStatusId(
          activeStatusIndex > 0 ? viewableStatuses[activeStatusIndex - 1].id : viewableStatuses[0]?.id ?? null
        );
      }
      if (event.key === "Escape") {
        setActiveStatusId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeStatus, activeStatusIndex, viewableStatuses]);

  const goToPrevious = () => {
    if (activeStatusIndex <= 0) {
      setActiveStatusId(viewableStatuses[0]?.id ?? null);
      return;
    }
    setActiveStatusId(viewableStatuses[activeStatusIndex - 1].id);
  };

  const goToNext = () => {
    if (activeStatusIndex < 0 || activeStatusIndex >= viewableStatuses.length - 1) {
      setActiveStatusId(null);
      return;
    }
    setActiveStatusId(viewableStatuses[activeStatusIndex + 1].id);
  };

  const openStory = (entryId: string) => {
    const entry = statusItems.find((current) => current.id === entryId);
    if (!entry) {
      return;
    }
    setActiveStatusId(entryId);
    setShareFeedback("");
  };

  const openComposer = () => {
    setIsComposerOpen(true);
    setShowEmojiLibrary(false);
    setIsAnonymousComposer(false);
    setShareFeedback("");
  };

  const openMyStatus = () => {
    if (myStatusBubble?.primaryEntry) {
      openStory(myStatusBubble.primaryEntry.id);
      return;
    }

    openComposer();
  };

  const insertSnippet = (snippet: string) => {
    setStatusDraft((current) => `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}${snippet}`);
  };

  const getStatusShareLink = (entry: StatusEntry) =>
    typeof window === "undefined" || !entry.shareSlug ? "" : `${window.location.origin}/anonymous/status/${entry.shareSlug}`;

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
    const messageLines = wrapCanvasText(context, entry.contentBody, 880);
    messageLines.slice(0, 10).forEach((line, index) => {
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

  const clearSelectedStatusImage = () => {
    setSelectedStatusImage((current) => {
      if (current?.objectUrl && isBlobUrl(current.objectUrl)) {
        URL.revokeObjectURL(current.objectUrl);
      }
      return null;
    });
  };

  const handleStatusImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const selectionId = `${Date.now()}-${file.name}`;
    const objectUrl = URL.createObjectURL(file);
    setShareFeedback("");
    setSelectedStatusImage((current) => {
      if (current?.objectUrl && isBlobUrl(current.objectUrl)) {
        URL.revokeObjectURL(current.objectUrl);
      }

      return {
        id: selectionId,
        previewUrl: objectUrl,
        uploadedUrl: null,
        fileName: file.name,
        uploading: true,
        uploadError: "",
        objectUrl
      };
    });

    void uploadMediaAsset(accessToken, {
      blob: file,
      fileName: file.name,
      contentType: file.type || "image/jpeg"
    })
      .then((uploaded) => {
        setSelectedStatusImage((current) => {
          if (!current || current.id !== selectionId) {
            return current;
          }

          if (current.objectUrl && isBlobUrl(current.objectUrl)) {
            URL.revokeObjectURL(current.objectUrl);
          }

          return {
            ...current,
            previewUrl: uploaded.readUrl,
            uploadedUrl: uploaded.readUrl,
            uploading: false,
            uploadError: "",
            objectUrl: null
          };
        });
      })
      .catch((error) => {
        setSelectedStatusImage((current) => {
          if (!current || current.id !== selectionId) {
            return current;
          }

          return {
            ...current,
            uploading: false,
            uploadError: getErrorMessage(error, "Could not upload the selected photo.")
          };
        });
      });
  };

  const postStatus = () => {
    if (isPostingStatus || !statusDraft.trim()) {
      return;
    }
    if (selectedStatusImage?.uploading) {
      setShareFeedback("Status photo is still uploading.");
      return;
    }
    if (selectedStatusImage && !selectedStatusImage.uploadedUrl) {
      setShareFeedback(selectedStatusImage.uploadError || "Status photo is not ready yet.");
      return;
    }
    setIsPostingStatus(true);
    void apiRequest<ApiStatus>("/statuses", {
      method: "POST",
      accessToken,
      body: {
        body: statusDraft.trim(),
        anonymous: isAnonymousComposer,
        visibility: "public",
        imageUrl: selectedStatusImage?.uploadedUrl ?? undefined
      }
    })
      .then((createdStatus) => {
        const nextEntry = toStatusEntry(createdStatus, { owned: true });
        setStatusItems((current) => upsertStatusEntry(current, nextEntry));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(statusUpdateEvent, { detail: { type: "created", status: createdStatus } }));
        }
        setStatusDraft("Today I finally wrote the chapter I kept postponing.");
        clearSelectedStatusImage();
        setIsComposerOpen(false);
        setIsAnonymousComposer(false);
        setShareFeedback(createdStatus.anonymous ? "Anonymous status posted." : "Status posted.");
        setActiveStatusId(nextEntry.id);
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not post status."));
      })
      .finally(() => {
        setIsPostingStatus(false);
      });
  };

  const deleteStatusItem = () => {
    if (!activeStatus?.id || !activeStatus.owned) {
      return;
    }
    void apiRequest<{ ok: boolean }>(`/statuses/${activeStatus.id}`, { method: "DELETE", accessToken })
      .then(() => {
        setStatusItems((current) => removeStatusEntry(current, activeStatus.id));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(statusUpdateEvent, { detail: { type: "deleted", statusId: activeStatus.id } }));
        }
        setActiveStatusId(null);
        setShareFeedback(activeStatus.anonymous ? "Anonymous status deleted." : "Status deleted.");
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not delete the status."));
      });
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
            <SectionLabelComponent>STATUS_STREAM</SectionLabelComponent>
            <h2>Quick memory drops</h2>
          </div>
          <span aria-label="Scroll sideways" className="section-meta">↔</span>
        </div>
        <div className="status-scroll">
          <div className="status-bubble-shell my-status-bubble-shell">
            <button className={`status-bubble my-status-bubble ${myStatusBubble ? "" : "status-bubble-empty"}`} onClick={openMyStatus} type="button">
              <span className="status-ring-shell">
                <span className={`status-ring ${myStatusBubble ? `tone-${myStatusBubble.primaryEntry.tone}` : "tone-blue"} my-status-ring`}>
                  {myStatusBubble?.primaryEntry.imageUrl ? (
                    <img alt="" className="status-avatar-image" src={myStatusBubble.primaryEntry.imageUrl} />
                  ) : (
                    <span className="status-avatar">{myStatusBubble?.primaryEntry ? getStatusAvatarLabel(myStatusBubble.primaryEntry, "Y") : "Y"}</span>
                  )}
                </span>
                {myStatusBubble && myStatusBubble.count > 1 ? <span className="status-bubble-count">{myStatusBubble.count}</span> : null}
              </span>
              <strong>My status</strong>
              <span className="status-bubble-meta">{myStatusBubble?.primaryEntry.meta ?? "Tap to add status"}</span>
            </button>
            <button
              aria-label="Add a new status"
              className="status-bubble-add-button"
              onClick={(event) => {
                event.stopPropagation();
                openComposer();
              }}
              type="button"
            >
              +
            </button>
          </div>
          {statusBubbleGroups.map((group) => {
            const circle = group.primaryEntry;
            const isSeen = group.statusIds.every((statusId) => seenStatusIds.includes(statusId));
            return (
            <button className={`status-bubble ${isSeen ? "status-bubble-seen" : ""}`} key={group.key} onClick={() => openStory(circle.id)} type="button">
              <span className="status-ring-shell">
                <span className={`status-ring tone-${circle.tone}`}>
                  {circle.imageUrl ? (
                    <img alt="" className="status-avatar-image" src={circle.imageUrl} />
                  ) : (
                    <span className="status-avatar">{getStatusAvatarLabel(circle)}</span>
                  )}
                </span>
                {group.count > 1 ? <span className="status-bubble-count">{group.count}</span> : null}
              </span>
              <strong>{circle.name}</strong>
              {circle.verified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
              <span className="status-bubble-meta">{circle.meta}</span>
            </button>
          );})}
        </div>
      </section>

      {isComposerOpen ? (
        <div className="status-viewer-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <article className="status-composer card" onClick={(event) => event.stopPropagation()}>
            <input accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={handleStatusImageChange} ref={statusImageInputRef} type="file" />
            <div className="status-composer-top">
              <div>
                <SectionLabelComponent>YOUR_STATUS</SectionLabelComponent>
                <h3>Post a WhatsApp-style memory status</h3>
              </div>
              <button aria-label="Close status composer" className="icon-chip" onClick={() => setIsComposerOpen(false)} type="button">
                <IconComponent className="button-icon" name="close" />
              </button>
            </div>
            <div className="status-toolbar">
              <button className={statusStyle === "bold" ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => setStatusStyle("bold")} type="button">B</button>
              <button className={statusStyle === "italic" ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => setStatusStyle("italic")} type="button">I</button>
              <button className={statusStyle === "plain" ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => setStatusStyle("plain")} type="button">Aa</button>
              <button className={showEmojiLibrary ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => setShowEmojiLibrary((current) => !current)} type="button">Emoji</button>
              <button className={selectedStatusImage ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => statusImageInputRef.current?.click()} type="button">Photo</button>
              <button className="composer-chip" onClick={() => insertSnippet("[Voice]")} type="button">Voice</button>
              <button className="composer-chip" onClick={() => insertSnippet("@closefriends")} type="button">Mention</button>
            </div>
            <div className="status-tone-picker">
              {["sky", "mint", "peach"].map((tone) => (
                <button className={statusTone === tone ? "tone-swatch active-tone-swatch" : "tone-swatch"} key={tone} onClick={() => setStatusTone(tone as "sky" | "mint" | "peach")} type="button">
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
                    <button className={activeEmojiGroup === group.label ? "emoji-category active-emoji-category" : "emoji-category"} key={group.label} onClick={() => setActiveEmojiGroup(group.label)} type="button">
                      <span>{group.icon}</span>
                      {group.label}
                    </button>
                  ))}
                </div>
                <div className="emoji-library">
                  {emojiGroups.find((group) => group.label === activeEmojiGroup)?.emojis.map((emoji) => (
                    <button className="emoji-tile" key={emoji} onClick={() => insertSnippet(emoji)} type="button">{emoji}</button>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedStatusImage ? (
              <div className="picker-panel">
                <div className="picker-panel-head">
                  <strong>Status photo</strong>
                  <span>{selectedStatusImage.uploading ? "Uploading to Histora media..." : "Ready to post"}</span>
                </div>
                <div className="status-photo-card">
                  <img alt="Selected status" className="status-photo-preview" src={selectedStatusImage.previewUrl} />
                  <div className="status-photo-meta">
                    <strong>{selectedStatusImage.fileName}</strong>
                    <span>{selectedStatusImage.uploadError || (selectedStatusImage.uploading ? "Optimizing and uploading..." : "Attached to this status")}</span>
                  </div>
                  <button className="ghost-action" onClick={clearSelectedStatusImage} type="button">Remove photo</button>
                </div>
              </div>
            ) : null}
            <textarea className="status-compose-input" onChange={(event) => setStatusDraft(event.target.value)} placeholder="Write your status..." value={statusDraft} />
            <div
              className={`status-compose-preview tone-preview-${statusTone} style-preview-${statusStyle}${selectedStatusImage ? " status-compose-preview-with-image" : ""}`}
              style={
                selectedStatusImage
                  ? {
                      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.72)), url(${selectedStatusImage.previewUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }
                  : undefined
              }
            >
              <span className="story-tag">{isAnonymousComposer ? "Anonymous preview" : "Preview"}</span>
              {selectedStatusImage ? <span className="preview-asset-tag">Photo status</span> : null}
              <p>{statusDraft}</p>
            </div>
            {isAnonymousComposer ? (
              <div className="anonymous-compose-note">
                <strong>Anonymous post tools</strong>
                <span>After posting, you can copy a share link and save the anonymous post image to your device.</span>
              </div>
            ) : null}
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => insertSnippet("✨")} type="button">Add emoji</button>
              <button className="primary-action" onClick={postStatus} type="button">
                {isPostingStatus ? "Posting..." : isAnonymousComposer ? "Post anonymous status" : "Post status"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {activeStatus ? (
        <div className="status-viewer-backdrop" onClick={() => setActiveStatusId(null)} role="presentation">
          <article className={`status-story-viewer tone-${activeStatus.tone}`} onClick={(event) => event.stopPropagation()}>
            <div className="story-viewer-close-row">
              <button aria-label="Close story viewer" className="icon-chip" onClick={() => setActiveStatusId(null)} type="button">
                <IconComponent className="button-icon" name="close" />
              </button>
            </div>
            <div className="story-progress-row" style={{ gridTemplateColumns: `repeat(${Math.max(viewableStatuses.length, 1)}, minmax(0, 1fr))` }}>
              {viewableStatuses.map((circle, index) => (
                <span className="story-progress-track" key={circle.id}>
                  <span
                    className="story-progress-fill"
                    style={{ width: index < activeStatusIndex ? "100%" : index === activeStatusIndex ? `${progress}%` : "0%" }}
                  />
                </span>
              ))}
            </div>
            <div className="story-viewer-top">
              <div className="story-viewer-author">
                <span className={`status-ring tone-${activeStatus.tone}`}>
                  {activeStatus.imageUrl ? (
                    <img alt="" className="status-avatar-image" src={activeStatus.imageUrl} />
                  ) : (
                    <span className="status-avatar">{getStatusAvatarLabel(activeStatus)}</span>
                  )}
                </span>
                <div>
                  <strong>
                    {activeStatus.owned ? "My status" : activeStatus.name}
                    {activeStatus.verified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
                  </strong>
                  <span>{activeStatus.meta}</span>
                </div>
              </div>
              <div className="story-viewer-top-actions">
                {activeStatus.anonymous ? (
                  <button aria-label="Save anonymous status image" className="icon-chip icon-chip-dark" onClick={() => downloadAnonymousStatusImage(activeStatus)} type="button">
                    <IconComponent className="button-icon" name="download" />
                  </button>
                ) : null}
                {activeStatus.owned ? (
                  <button aria-label="Delete status" className="icon-chip icon-chip-dark" onClick={deleteStatusItem} type="button">
                    <IconComponent className="button-icon" name="trash" />
                  </button>
                ) : null}
                <button className="story-chip" onClick={() => setIsPaused((current) => !current)} type="button">
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
            <div className="story-viewer-stage">
              <button aria-label="Previous story" className="story-nav-zone story-nav-left" onClick={goToPrevious} type="button" />
              <button aria-label="Next story" className="story-nav-zone story-nav-right" onClick={goToNext} type="button" />
              <div className="story-stage-card">
                {activeStatus.imageUrl ? (
                  <div className="status-stage-image-frame">
                    <img alt="" className="status-stage-image" src={activeStatus.imageUrl} />
                  </div>
                ) : null}
                <span className="story-tag">{activeStatus.label}</span>
                <h3>{activeStatus.contentTitle}</h3>
                <p>{activeStatus.contentBody}</p>
                <div className="story-stage-metrics">
                  <span>{activeStatus.imageUrl ? "Photo status" : "Memory status"}</span>
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
                    <button className="story-chip" onClick={() => void copyStatusLink(activeStatus)} type="button">Copy link</button>
                    <button className="story-chip" onClick={() => setHelpRequestTarget(activeStatus)} type="button">Request to help</button>
                  </div>
                ) : null}
                {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
              </div>
            </div>
            <div className="story-footer-row">
              <button className="ghost-action" disabled={activeStatusIndex === 0} onClick={goToPrevious} type="button">Previous</button>
              <button className="ghost-action" onClick={goToNext} type="button">{activeStatusIndex === viewableStatuses.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </article>
        </div>
      ) : null}

      {helpRequestTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpRequestTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabelComponent>CONSENT_FEE</SectionLabelComponent>
                <h3>Request access to help this anonymous poster</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setHelpRequestTarget(null)} type="button">
                <IconComponent className="button-icon" name="close" />
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

export function FeedPage({
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
  const { feedPosts, feedStatuses, myStatusIds, liveAnonymousSources, error: feedStoreError, hydrated } = useFeedStore();
  const [shareSheet, setShareSheet] = useState<ShareSheetPayload | null>(null);
  const [activeAnonymousIndex, setActiveAnonymousIndex] = useState<number | null>(null);
  const [anonymousReplyDraft, setAnonymousReplyDraft] = useState("");
  const [helpTarget, setHelpTarget] = useState<AnonymousFeedSource | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [pendingFeedActions, setPendingFeedActions] = useState<Record<string, boolean>>({});
  const [shareFeedback, setShareFeedback] = useState("");
  const anonymousFeedPosts = feedPosts.filter((post) => post.anonymous);

  const openStory = (story: FeedStoryRecord) => navigate(`/feed/story/${story.slug}`, { state: { prefetchedStory: story } });
  const warmStory = (slug: string) => {
    void prefetchStoryBySlug(slug, accessToken).catch(() => undefined);
  };
  const openShareSheet = (post: FeedStoryRecord) => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    setShareSheet({
      storyId: post.id,
      title: post.title,
      text: `${post.title} by ${post.author}`,
      url: `${baseUrl}/feed/story/${post.slug}`
    });
  };

  useEffect(() => {
    if (feedStoreError) {
      setShareFeedback(feedStoreError);
    }
  }, [feedStoreError]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void revalidateFeedStore(accessToken).catch(() => undefined);
  }, [accessToken, hydrated]);

  useEffect(() => {
    if (!feedPosts.length) {
      return;
    }
    const warmPosts = () => {
      feedPosts.slice(0, 4).forEach((post) => warmStory(post.slug));
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = (window as typeof window & {
        requestIdleCallback: (callback: IdleRequestCallback) => number;
        cancelIdleCallback?: (id: number) => void;
      }).requestIdleCallback(() => warmPosts());
      return () => {
        (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
      };
    }
    const timer = globalThis.setTimeout(warmPosts, 180);
    return () => globalThis.clearTimeout(timer);
  }, [feedPosts]);

  const anonymousFeedSources: AnonymousFeedSource[] = [
    ...liveAnonymousSources,
    ...feedStatuses
      .filter((status) => status.anonymous && status.shareSlug)
      .map((status) => ({
      id: status.id,
      slug: status.shareSlug ?? status.id,
      title: "Anonymous status",
      excerpt: status.body,
      imageUrl: status.imageUrl ?? null,
      meta: formatAnonymousMeta(status.createdAt),
      comments: [],
      helpFee: 8,
      fromQuickMemory: true,
      sourceType: "status" as const,
      targetType: "status" as const,
      owned: myStatusIds.has(status.id)
    })),
    ...anonymousFeedPosts.map((post) => ({
      id: post.slug,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      imageUrl: post.coverImageUrl ?? null,
      meta: `${post.reads} reads`,
      comments: (post.chapters[0]?.comments ?? []).map((comment) => ({ author: comment.author, text: comment.text })),
      helpFee: post.helpFee ?? 8,
      fromQuickMemory: false,
      sourceType: "story" as const,
      targetType: "storyChapter" as const
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
    return [{ id: `${source.slug}-lead`, postSlug: source.slug, title: "Anonymous", meta: source.meta, preview: source.excerpt }, ...chapterReplies];
  });
  const activeAnonymousMessage = activeAnonymousIndex === null ? null : anonymousFeedMessages[activeAnonymousIndex] ?? null;
  const activeAnonymousPost = activeAnonymousMessage ? anonymousFeedSources.find((source) => source.slug === activeAnonymousMessage.postSlug) ?? null : null;

  const toggleFeedLike = (slug: string) => {
    const targetPost = feedPosts.find((post) => post.slug === slug);
    if (!targetPost || pendingFeedActions[`${slug}:like`]) {
      return;
    }
    const optimisticPost = { ...targetPost, liked: !targetPost.liked, likes: Math.max(0, targetPost.likes + (targetPost.liked ? -1 : 1)) };
    setPendingFeedActions((current) => ({ ...current, [`${slug}:like`]: true }));
    updateFeedPosts((current) => current.map((post) => (post.slug === slug ? optimisticPost : post)));
    void apiRequest<{ storyId: string; action: "like" | "bookmark"; active: boolean; likesCount: number; bookmarksCount: number; reactionsCount: number }>(
      `/stories/${targetPost.id}/reactions`,
      { method: "POST", accessToken, body: { action: "like" } }
    )
      .then((result) => {
        updateCachedStoryCounts(targetPost.id, (story) => ({
          ...story,
          liked: result.active,
          likesCount: result.likesCount,
          bookmarksCount: result.bookmarksCount,
          reactionsCount: result.reactionsCount
        }));
        updateFeedPosts((current) =>
          current.map((post) =>
            post.slug === slug ? { ...post, liked: result.active, likes: result.likesCount, saves: String(result.bookmarksCount) } : post
          )
        );
        setPendingFeedActions((current) => ({ ...current, [`${slug}:like`]: false }));
      })
      .catch((error) => {
        updateFeedPosts((current) => current.map((post) => (post.slug === slug ? targetPost : post)));
        setPendingFeedActions((current) => ({ ...current, [`${slug}:like`]: false }));
        setShareFeedback(getErrorMessage(error, "Could not update story like."));
      });
  };

  const toggleFeedBookmark = (slug: string) => {
    const targetPost = feedPosts.find((post) => post.slug === slug);
    if (!targetPost || pendingFeedActions[`${slug}:bookmark`]) {
      return;
    }
    const optimisticPost = { ...targetPost, bookmarked: !targetPost.bookmarked, saves: bumpStorySaveCount(targetPost.saves, targetPost.bookmarked ? -1 : 1) };
    setPendingFeedActions((current) => ({ ...current, [`${slug}:bookmark`]: true }));
    updateFeedPosts((current) => current.map((post) => (post.slug === slug ? optimisticPost : post)));
    void apiRequest<{ storyId: string; action: "like" | "bookmark"; active: boolean; likesCount: number; bookmarksCount: number; reactionsCount: number }>(
      `/stories/${targetPost.id}/reactions`,
      { method: "POST", accessToken, body: { action: "bookmark" } }
    )
      .then((result) => {
        updateCachedStoryCounts(targetPost.id, (story) => ({
          ...story,
          bookmarked: result.active,
          likesCount: result.likesCount,
          bookmarksCount: result.bookmarksCount,
          reactionsCount: result.reactionsCount
        }));
        updateFeedPosts((current) =>
          current.map((post) =>
            post.slug === slug ? { ...post, bookmarked: result.active, likes: result.likesCount, saves: String(result.bookmarksCount) } : post
          )
        );
        setPendingFeedActions((current) => ({ ...current, [`${slug}:bookmark`]: false }));
      })
      .catch((error) => {
        updateFeedPosts((current) => current.map((post) => (post.slug === slug ? targetPost : post)));
        setPendingFeedActions((current) => ({ ...current, [`${slug}:bookmark`]: false }));
        setShareFeedback(getErrorMessage(error, "Could not update bookmark."));
      });
  };

  const recordStoryShare = async (storyId: string) => {
    const result = await apiRequest<{ storyId: string; sharesCount: number }>(`/stories/${storyId}/share`, {
      method: "POST",
      accessToken
    });

    updateCachedStoryCounts(result.storyId, (story) => ({
      ...story,
      sharesCount: result.sharesCount
    }));
    updateFeedPosts((current) =>
      current.map((post) =>
        post.id === result.storyId
          ? {
              ...post,
              shares: result.sharesCount
            }
          : post
      )
    );
  };

  const submitAnonymousReply = () => {
    if (!activeAnonymousPost || !anonymousReplyDraft.trim()) {
      return;
    }
    void apiRequest<ApiComment>("/comments", {
      method: "POST",
      accessToken,
      body: { targetType: activeAnonymousPost.targetType, targetId: activeAnonymousPost.id, body: anonymousReplyDraft.trim() }
    })
      .then((comment) => {
        updateFeedPosts((current) =>
          current.map((post) =>
            post.slug === activeAnonymousPost.slug
              ? {
                  ...post,
                  chapters: post.chapters.map((chapter, index) =>
                    index === 0
                      ? { ...chapter, comments: [...chapter.comments, { author: comment.authorName, handle: `@${comment.authorUsername}`, text: comment.body, time: "now" }] }
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

  const deleteAnonymousFeedItem = () => {
    if (!activeAnonymousPost?.owned || activeAnonymousPost.sourceType !== "status") {
      return;
    }
    void apiRequest<{ ok: boolean }>(`/statuses/${activeAnonymousPost.id}`, { method: "DELETE", accessToken })
      .then(() => {
        updateFeedStatuses((current) => current.filter((status) => status.id !== activeAnonymousPost.id));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(statusUpdateEvent, { detail: { type: "deleted", statusId: activeAnonymousPost.id } }));
        }
        setActiveAnonymousIndex(null);
        setShareFeedback("Anonymous status deleted.");
      })
      .catch((error) => {
        setShareFeedback(getErrorMessage(error, "Could not delete the anonymous status."));
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
      <StoryCirclesRow
        IconComponent={IconComponent}
        SectionLabelComponent={SectionLabelComponent}
        accessToken={accessToken}
        myStatusIds={myStatusIds}
        statuses={feedStatuses}
      />
      <section className="feed-layout feed-layout-expanded">
        <div className="feed-column">
          {feedPosts.map((post, index) => (
            <Fragment key={post.title}>
              <article className="post-card card post-card-clickable" onClick={() => openStory(post)} onMouseEnter={() => warmStory(post.slug)} onTouchStart={() => warmStory(post.slug)}>
                <div className="post-top">
                  <div className="post-author">
                    <span className="post-avatar">{post.author.slice(0, 1)}</span>
                    <div>
                      <strong>
                        {post.author}
                        {post.authorVerified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
                      </strong>
                      <span>{post.handle}</span>
                    </div>
                  </div>
                  <span className="story-tag">{getStoryAudienceLabel(post.visibility)}</span>
                </div>
                <div className="image-frame">
                  <img alt={post.title} className="post-image" decoding="async" fetchPriority={index === 0 ? "high" : "auto"} loading={index < 2 ? "eager" : "lazy"} src={post.coverImageUrl || post.chapters[0]?.images[0]?.src || feedStory} />
                </div>
                <div className="post-body">
                  <div className="post-meta-row">
                    <span>{post.genre}</span>
                    <span>{post.chapterCount} chapters</span>
                    <span>{post.reads} reads</span>
                  </div>
                  <h2>{post.title}</h2>
                  <p>{post.excerpt}</p>
                  {post.visibility !== "PUBLIC" ? <p className="section-meta">{getStoryAudienceHelp(post.visibility)}</p> : null}
                  <div className="post-actions feed-card-actions">
                    <button className={post.liked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={(event) => { event.stopPropagation(); toggleFeedLike(post.slug); }} disabled={pendingFeedActions[`${post.slug}:like`]} type="button">
                      <IconComponent className="inline-icon" name="heart" />
                      {post.likes}
                    </button>
                    <button className="feed-action-pill" onClick={(event) => { event.stopPropagation(); openStory(post); }} type="button">
                      <IconComponent className="inline-icon" name="comment" />
                      {post.comments}
                    </button>
                    <button className={post.bookmarked ? "feed-action-pill active-feed-action-pill" : "feed-action-pill"} onClick={(event) => { event.stopPropagation(); toggleFeedBookmark(post.slug); }} disabled={pendingFeedActions[`${post.slug}:bookmark`]} type="button">
                      <IconComponent className="inline-icon" name="bookmark" />
                      {post.saves}
                    </button>
                    <button className="feed-action-pill" onClick={(event) => { event.stopPropagation(); openShareSheet(post); }} type="button">
                      <IconComponent className="inline-icon" name="share" />
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
                      <SectionLabelComponent>ANONYMOUS_MESSAGES</SectionLabelComponent>
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
      {activeAnonymousPost ? (
        <div className="status-viewer-backdrop" onClick={() => setActiveAnonymousIndex(null)} role="presentation">
          <article className="status-story-viewer tone-ink anonymous-feed-viewer" onClick={(event) => event.stopPropagation()}>
            <div className="story-viewer-close-row">
              <button aria-label="Close anonymous message" className="icon-chip" onClick={() => setActiveAnonymousIndex(null)} type="button">
                <IconComponent className="button-icon" name="close" />
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
                {activeAnonymousPost.owned && activeAnonymousPost.sourceType === "status" ? (
                  <button aria-label="Delete anonymous post" className="icon-chip icon-chip-dark" onClick={deleteAnonymousFeedItem} type="button">
                    <IconComponent className="button-icon" name="trash" />
                  </button>
                ) : null}
                <button aria-label="Download anonymous post" className="icon-chip" onClick={() => downloadAnonymousMessageImage(activeAnonymousPost)} type="button">
                  <IconComponent className="button-icon" name="download" />
                </button>
              </div>
            </div>
            <div className="story-stage-card">
              {activeAnonymousPost.imageUrl ? (
                <div className="status-stage-image-frame">
                  <img alt="" className="status-stage-image" src={activeAnonymousPost.imageUrl} />
                </div>
              ) : null}
              <span className="story-tag">Anonymous advice</span>
              <h3>{activeAnonymousPost.title}</h3>
              <p>{activeAnonymousPost.excerpt}</p>
              <div className="story-stage-metrics">
                <span>{activeAnonymousPost.fromQuickMemory ? "Quick memory status" : "Anonymous chapter"}</span>
                <strong>{activeAnonymousPost.comments.length} replies</strong>
              </div>
              <div className="anonymous-status-tools">
                <button className="primary-action anonymous-help-action" onClick={() => { setHelpTarget(activeAnonymousPost); setConsentAccepted(false); }} type="button">Render help</button>
              </div>
              {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
            </div>
            <div className="story-reply-bar">
              <input onChange={(event) => setAnonymousReplyDraft(event.target.value)} placeholder="Reply anonymously..." value={anonymousReplyDraft} />
              <button className="primary-action" onClick={submitAnonymousReply} type="button">Send anonymous reply</button>
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
                <SectionLabelComponent>CONSENT_FEE</SectionLabelComponent>
                <h3>Render help for this anonymous message</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setHelpTarget(null)} type="button">
                <IconComponent className="button-icon" name="close" />
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
