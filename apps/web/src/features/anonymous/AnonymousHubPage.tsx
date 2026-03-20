import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type ApiAnonymousMessage, type ApiStatus, type AuthUser, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import {
  type StoredAnonymousStatus,
  roundRect,
  toStoredAnonymousStatus,
  toStoredAnonymousStatusEntry,
  wrapCanvasText
} from "../feed/support";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

export function AnonymousHubPage({
  accessToken,
  currentUser,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  currentUser: AuthUser;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<StoredAnonymousStatus[]>([]);
  const [shareFeedback, setShareFeedback] = useState("");
  const [showAllMessages, setShowAllMessages] = useState(false);
  const inboxLink =
    typeof window === "undefined"
      ? `/anonymous/write/${currentUser.username}`
      : `${window.location.origin}/anonymous/write/${currentUser.username}`;
  const receivedMessages = statuses.filter((status) => status.source === "received");
  const postedMessages = statuses.filter((status) => status.source === "posted");
  const visibleReceivedMessages = showAllMessages ? receivedMessages : receivedMessages.slice(0, 5);

  useEffect(() => {
    let cancelled = false;

    const loadStatuses = async () => {
      try {
        const [inboxMessages, sentMessages, postedStatuses] = await Promise.all([
          apiRequest<ApiAnonymousMessage[]>("/anonymous-messages/inbox", { accessToken }),
          apiRequest<ApiAnonymousMessage[]>("/anonymous-messages/sent", { accessToken }),
          apiRequest<ApiStatus[]>("/statuses/mine", { accessToken })
        ]);

        if (cancelled) {
          return;
        }

        setStatuses([
          ...inboxMessages.map((message) => toStoredAnonymousStatus(message, "received")),
          ...sentMessages.map((message) => toStoredAnonymousStatus(message, "posted")),
          ...postedStatuses.filter((status) => status.anonymous && status.shareSlug).map((status) => toStoredAnonymousStatusEntry(status))
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
      const sharePath = status.kind === "status" ? `/anonymous/status/${status.shareSlug}` : `/anonymous/${status.shareSlug}`;
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
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

  const deletePostedItem = async (status: StoredAnonymousStatus) => {
    try {
      if (status.kind === "status") {
        await apiRequest<{ ok: boolean }>(`/statuses/${status.id}`, {
          method: "DELETE",
          accessToken
        });
      } else {
        await apiRequest<{ ok: boolean }>(`/anonymous-messages/${status.id}`, {
          method: "DELETE",
          accessToken
        });
      }

      setStatuses((current) => current.filter((entry) => !(entry.id === status.id && entry.kind === status.kind)));
      setShareFeedback(status.kind === "status" ? "Anonymous status deleted." : "Anonymous message deleted.");
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not delete this anonymous post."));
    }
  };

  const downloadPostedStatusImage = (status: StoredAnonymousStatus) => {
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
    context.fillText("Anonymous advice status", 80, 240);
    context.font = "400 42px Manrope, sans-serif";

    const words = status.body.split(" ");
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
    context.fillText(`Advice replies stay anonymous // ${status.meta}`, 80, 1160);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${status.shareSlug}.png`;
    link.click();
    setShareFeedback("Anonymous status image saved to your device.");
  };

  return (
    <main className="feed-reader-shell anonymous-hub-shell">
      <div className="profile-edit-back">
        <button className="ghost-action" onClick={() => navigate("/feed")} type="button">
          <IconComponent className="button-icon" name="arrow" />
          BACK
        </button>
      </div>

      <section className="story-reader-stage card anonymous-hero">
        <div className="anonymous-hero-copy">
          <SectionLabelComponent>ANONYMOUS_ARCHIVE</SectionLabelComponent>
          <p>Share your inbox link so people can send you anonymous messages.</p>
        </div>
        <div className="anonymous-inbox-card">
          <span className="story-tag">YOUR INBOX LINK</span>
          <strong>Let people write to you anonymously</strong>
          <p>{inboxLink}</p>
          <div className="anonymous-hub-actions">
            <button className="ghost-action" onClick={copyInboxLink} type="button">
              COPY LINK
            </button>
            <button className="primary-action" onClick={() => setShowAllMessages((current) => !current)} type="button">
              {showAllMessages ? "SHOW RECENT" : "SEE ALL MESSAGES"}
              <IconComponent className="button-icon" name="arrow" />
            </button>
          </div>
        </div>
      </section>

      {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}

      <section className="anonymous-hub-stack">
        <article className="chapter-reader-card card anonymous-hub-panel">
          <div className="anonymous-panel-body">
            <div className="profile-section-copy anonymous-section-copy">
              <SectionLabelComponent>MESSAGES</SectionLabelComponent>
              <h2>Anonymous messages</h2>
              <span>{receivedMessages.length} total message{receivedMessages.length === 1 ? "" : "s"} in your inbox.</span>
            </div>
            <div className="anonymous-hub-list">
              {visibleReceivedMessages.length ? (
                visibleReceivedMessages.map((status) => (
                  <article className="anonymous-hub-card" key={status.shareSlug}>
                    <div className="anonymous-hub-card-top">
                      <div className="anonymous-hub-card-copy">
                        <strong>Anonymous message</strong>
                        <span>{status.meta}</span>
                      </div>
                    </div>
                    <p>{status.body}</p>
                    <div className="anonymous-hub-actions">
                      <button className="ghost-action" onClick={() => copyAnonymousLink(status)} type="button">
                        COPY MESSAGE LINK
                      </button>
                      <button className="primary-action" onClick={() => navigate(`/anonymous/${status.shareSlug}`)} type="button">
                        OPEN MESSAGE
                        <IconComponent className="button-icon" name="arrow" />
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <article className="anonymous-empty">
                  <strong>No anonymous messages yet</strong>
                  <p>Copy your inbox link and share it to start receiving anonymous messages.</p>
                  <div className="anonymous-hub-actions">
                    <button className="ghost-action" onClick={copyInboxLink} type="button">
                      COPY INBOX LINK
                    </button>
                  </div>
                </article>
              )}
            </div>
            {receivedMessages.length > 5 ? (
              <div className="anonymous-hub-actions">
                <button className="ghost-action" onClick={() => setShowAllMessages((current) => !current)} type="button">
                  {showAllMessages ? "SHOW LESS" : "SEE ALL ANONYMOUS"}
                </button>
              </div>
            ) : null}
          </div>
        </article>

        {postedMessages.length ? (
          <article className="chapter-reader-card card anonymous-hub-panel">
            <div className="anonymous-panel-body">
              <div className="profile-section-copy anonymous-section-copy">
                <SectionLabelComponent>POSTED</SectionLabelComponent>
                <h2>Your anonymous posts</h2>
                <span>{postedMessages.length} anonymous post{postedMessages.length === 1 ? "" : "s"} created by you.</span>
              </div>
              <div className="anonymous-hub-list">
                {postedMessages.map((status) => (
                  <article className="anonymous-hub-card" key={`${status.kind ?? "message"}-${status.id}`}>
                    <div className="anonymous-hub-card-top">
                      <div className="anonymous-hub-card-copy">
                        <strong>{status.kind === "status" ? "Anonymous status" : "Anonymous message"}</strong>
                        <span>{status.meta}</span>
                      </div>
                      <div className="story-viewer-top-actions">
                        {status.kind === "status" ? (
                          <button
                            aria-label="Save anonymous status image"
                            className="icon-chip icon-chip-dark"
                            onClick={() => downloadPostedStatusImage(status)}
                            type="button"
                          >
                            <IconComponent className="button-icon" name="download" />
                          </button>
                        ) : null}
                        <button
                          aria-label="Delete anonymous post"
                          className="icon-chip icon-chip-dark"
                          onClick={() => void deletePostedItem(status)}
                          type="button"
                        >
                          <IconComponent className="button-icon" name="trash" />
                        </button>
                      </div>
                    </div>
                    <p>{status.body}</p>
                    <div className="anonymous-hub-actions">
                      <button className="ghost-action" onClick={() => copyAnonymousLink(status)} type="button">
                        COPY LINK
                      </button>
                      <button
                        className="primary-action"
                        onClick={() => navigate(status.kind === "status" ? `/anonymous/status/${status.shareSlug}` : `/anonymous/${status.shareSlug}`)}
                        type="button"
                      >
                        OPEN
                        <IconComponent className="button-icon" name="arrow" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
