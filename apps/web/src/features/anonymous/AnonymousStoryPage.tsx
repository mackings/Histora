import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { type ApiAnonymousMessage, type ApiComment, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { formatAnonymousMeta } from "../feed/support";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";
import { sampleHelperContacts } from "./support";

export function AnonymousStoryPage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const { shareSlug = "" } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ApiAnonymousMessage | null>(null);
  const [comments, setComments] = useState<Array<{ author: string; text: string }>>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadMessage = async () => {
      try {
        const [publicMessage, privateMessage] = await Promise.all([
          apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}`),
          apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}/private`, { accessToken }).catch(
            () => null
          )
        ]);

        if (cancelled) {
          return;
        }

        const activeMessage = privateMessage ?? publicMessage;
        setStatus(activeMessage);
      } catch (error) {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load this anonymous message."));
        }
      }
    };

    void loadMessage();

    return () => {
      cancelled = true;
    };
  }, [accessToken, shareSlug]);

  useEffect(() => {
    if (!status) {
      return;
    }

    void apiRequest<ApiComment[]>(
      `/comments?targetType=anonymousMessage&targetId=${encodeURIComponent(status.id)}&shareSlug=${encodeURIComponent(status.shareSlug)}`
    )
      .then((messageComments) => {
        setComments(
          messageComments.map((comment) => ({
            author: comment.authorName,
            text: comment.body
          }))
        );
      })
      .catch(() => undefined);
  }, [status?.id]);

  const submitReply = async () => {
    if (!status || !replyDraft.trim()) {
      return;
    }

    try {
      const createdComment = await apiRequest<ApiComment>("/comments", {
        method: "POST",
        accessToken,
        body: {
          targetType: "anonymousMessage",
          targetId: status.id,
          shareSlug: status.shareSlug,
          body: replyDraft.trim()
        }
      });

      setComments((current) => [
        { author: createdComment.authorName, text: createdComment.body },
        ...current
      ]);
      setStatus((current) =>
        current
          ? {
              ...current,
              commentsCount: current.commentsCount + 1
            }
          : current
      );
      setReplyDraft("");
      setShareFeedback("Anonymous advice sent.");
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not send your anonymous reply."));
    }
  };

  const confirmHelpRequest = async () => {
    if (!status || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    const helperContact = sampleHelperContacts[Math.abs(status.shareSlug.length) % sampleHelperContacts.length];

    try {
      const updatedMessage = await apiRequest<ApiAnonymousMessage>(
        `/anonymous-messages/${status.id}/helper-contact/unlock`,
        {
          method: "POST",
          accessToken,
          body: {
            helperName: helperContact.name,
            helperPhone: helperContact.phone
          }
        }
      );

      setStatus(updatedMessage);
      setShowHelpDialog(false);
      setConsentAccepted(false);
      setShareFeedback(`Consent fee confirmed. ${helperContact.name} is now available to help.`);
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not unlock helper contact."));
    }
  };

  const copyAnonymousLink = async () => {
    if (!status || typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(`${window.location.origin}/anonymous/${status.shareSlug}`);
      setShareFeedback("Anonymous link copied.");
    } catch {
      setShareFeedback("Could not copy the anonymous link on this device.");
    }
  };

  if (!status) {
    return (
      <main className="feed-reader-shell">
        <article className="story-reader-stage card">
          <SectionLabelComponent>ANONYMOUS_MESSAGE</SectionLabelComponent>
          <h1>This anonymous message was not found.</h1>
          <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
            BACK TO ANONYMOUS
          </button>
        </article>
      </main>
    );
  }

  return (
    <main className="feed-reader-shell anonymous-story-shell">
      <section className="topbar card feed-reader-topbar">
        <div className="topbar-copy">
          <SectionLabelComponent>ANONYMOUS_MESSAGE</SectionLabelComponent>
          <span>{formatAnonymousMeta(status.createdAt)} // {comments.length} replies // Consent fee ${status.helpFee}</span>
        </div>
        <div className="topbar-actions">
          <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
            BACK
          </button>
          <button className="primary-action" onClick={() => setShowHelpDialog(true)} type="button">
            RENDER HELP
          </button>
        </div>
      </section>

      <article className="chapter-reader-card card anonymous-story-card">
        <div className="story-reader-author-row">
          <div className="story-viewer-author">
            <span className="status-ring tone-ink">
              <span className="status-avatar">A</span>
            </span>
            <div>
              <strong>Anonymous</strong>
              <span>{formatAnonymousMeta(status.createdAt)}</span>
            </div>
          </div>
          <div className="story-reader-stage-actions">
            <button className="feed-action-pill" onClick={copyAnonymousLink} type="button">
              <IconComponent className="inline-icon" name="share" />
              Copy link
            </button>
          </div>
        </div>

        <div className="chapter-reader-head">
          <span className="story-tag">{status.distribution === "app" ? "ON APP" : "EXTERNAL"}</span>
        </div>
        <p className="chapter-reader-summary">{status.body}</p>

        {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
        {status.helperContact ? (
          <div className="anonymous-helper-card">
            <strong>Helper unlocked</strong>
            <span>{status.helperContact.name}</span>
            <small>{status.helperContact.phone}</small>
          </div>
        ) : null}

        <section className="story-reader-footer-card">
          <div className="profile-section-copy">
            <SectionLabelComponent>THREAD</SectionLabelComponent>
            <h2>Anonymous advice thread</h2>
          </div>
          <div className="story-comment-list">
            {comments.map((comment, index) => (
              <div className="story-comment-card" key={`${comment.author}-${index}`}>
                <strong>{comment.author}</strong>
                <p>{comment.text}</p>
              </div>
            ))}
          </div>
          <div className="story-reply-bar">
            <input onChange={(event) => setReplyDraft(event.target.value)} placeholder="Reply anonymously..." value={replyDraft} />
            <button className="primary-action" onClick={() => void submitReply()} type="button">
              Send anonymous reply
            </button>
          </div>
        </section>
      </article>

      {showHelpDialog ? (
        <div className="status-viewer-backdrop" onClick={() => setShowHelpDialog(false)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabelComponent>CONSENT_FEE</SectionLabelComponent>
                <h3>Render help for this anonymous message</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setShowHelpDialog(false)} type="button">
                <IconComponent className="button-icon" name="close" />
              </button>
            </div>
            <p>To protect privacy, helpers pay a consent fee of ${status.helpFee} before any contact request can be passed to the poster.</p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for this help request.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setShowHelpDialog(false)} type="button">Cancel</button>
              <button className="primary-action" onClick={() => void confirmHelpRequest()} type="button">Pay consent fee</button>
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}
