import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { type ApiAnonymousMessage, type ApiComment, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { formatAnonymousMeta } from "../feed/support";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

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
  const [comments, setComments] = useState<Array<{ text: string }>>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [loading, setLoading] = useState(true);

  const pendingHelpRequests = useMemo(
    () => (status?.helpRequests ?? []).filter((request) => !request.accepted),
    [status]
  );

  useEffect(() => {
    let cancelled = false;

    const loadMessage = async () => {
      setLoading(true);

      try {
        const privateMessage = accessToken
          ? await apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}/private`, { accessToken }).catch(() => null)
          : null;

        const activeMessage = privateMessage ?? (await apiRequest<ApiAnonymousMessage>(`/anonymous-messages/${shareSlug}`, { accessToken }));

        if (!cancelled) {
          setStatus(activeMessage);
          setShareFeedback("");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(null);
          setShareFeedback(getErrorMessage(error, "Could not load this anonymous message."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
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
      `/comments?targetType=anonymousMessage&targetId=${encodeURIComponent(status.id)}&shareSlug=${encodeURIComponent(status.shareSlug)}`,
      { accessToken }
    )
      .then((messageComments) => {
        setComments(messageComments.map((comment) => ({ text: comment.body })));
      })
      .catch(() => undefined);
  }, [accessToken, status?.id, status?.shareSlug]);

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

      setComments((current) => [{ text: createdComment.body }, ...current]);
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

  const submitHelpRequest = async () => {
    if (!status || !consentAccepted) {
      setShareFeedback("Accept the consent fee first to continue.");
      return;
    }

    try {
      const updatedMessage = await apiRequest<ApiAnonymousMessage>(
        `/anonymous-messages/${status.shareSlug}/help-requests`,
        {
          method: "POST",
          accessToken
        }
      );

      setStatus(updatedMessage);
      setShowHelpDialog(false);
      setConsentAccepted(false);
      setShareFeedback("Help request sent to the poster.");
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not send your help request."));
    }
  };

  const acceptHelpRequest = async (requestId: string) => {
    if (!status) {
      return;
    }

    try {
      const updatedMessage = await apiRequest<ApiAnonymousMessage>(
        `/anonymous-messages/${status.id}/help-requests/${requestId}/accept`,
        {
          method: "POST",
          accessToken
        }
      );

      setStatus(updatedMessage);
      setShareFeedback("Help request accepted.");
    } catch (error) {
      setShareFeedback(getErrorMessage(error, "Could not accept the help request."));
    }
  };

  if (loading) {
    return (
      <main className="feed-reader-shell anonymous-story-shell">
        <article className="story-reader-stage card">
          <SectionLabelComponent>ANONYMOUS_MESSAGE</SectionLabelComponent>
          <h1>Loading anonymous message...</h1>
        </article>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="feed-reader-shell anonymous-story-shell">
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
          {status.viewerRole === "reader" && status.canRequestHelp ? (
            <button className="primary-action" onClick={() => setShowHelpDialog(true)} type="button">
              REQUEST TO HELP
            </button>
          ) : null}
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
        </div>

        <div className="chapter-reader-head">
          <span className="story-tag">{status.distribution === "app" ? "ON APP" : "EXTERNAL"}</span>
        </div>
        <p className="chapter-reader-summary">{status.body}</p>

        {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
        {status.viewerRole === "recipient" && status.helperContact ? (
          <div className="anonymous-helper-card">
            <strong>Accepted helper</strong>
            <span>{status.helperContact.name}</span>
            <small>{status.helperContact.phone}</small>
          </div>
        ) : null}

        {status.viewerRole === "recipient" ? (
          <section className="story-reader-footer-card anonymous-help-requests-card">
            <div className="profile-section-copy">
              <SectionLabelComponent>HELP</SectionLabelComponent>
              <h2>Readers who want to help</h2>
              <span>{pendingHelpRequests.length} pending request{pendingHelpRequests.length === 1 ? "" : "s"}.</span>
            </div>
            <div className="anonymous-help-request-list">
              {pendingHelpRequests.length ? (
                pendingHelpRequests.map((request) => (
                  <article className="anonymous-help-request-card" key={request.id}>
                    <div>
                      <strong>Reader wants to help</strong>
                      <span>{formatAnonymousMeta(request.createdAt)}</span>
                    </div>
                    <button className="primary-action" onClick={() => void acceptHelpRequest(request.id)} type="button">
                      ACCEPT HELP
                    </button>
                  </article>
                ))
              ) : (
                <article className="anonymous-empty">
                  <strong>No help requests yet</strong>
                  <p>Readers can request to help from this message page after they open it.</p>
                </article>
              )}
            </div>
          </section>
        ) : null}

        <section className="story-reader-footer-card">
          <div className="profile-section-copy">
            <SectionLabelComponent>THREAD</SectionLabelComponent>
            <h2>Anonymous advice thread</h2>
          </div>
          <div className="anonymous-thread-list">
            {comments.map((comment, index) => (
              <div className="anonymous-thread-card" key={`comment-${index}`}>
                <p>{comment.text}</p>
              </div>
            ))}
          </div>
          <div className="story-reply-bar anonymous-reply-bar">
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
                <h3>Request to help this anonymous poster</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setShowHelpDialog(false)} type="button">
                <IconComponent className="button-icon" name="close" />
              </button>
            </div>
            <p>You are requesting to help the poster. Your identity stays hidden until the poster accepts your help request.</p>
            <label className="toggle-row">
              <input checked={consentAccepted} onChange={(event) => setConsentAccepted(event.target.checked)} type="checkbox" />
              <span>I accept the consent fee and privacy terms for this help request.</span>
            </label>
            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => setShowHelpDialog(false)} type="button">Cancel</button>
              <button className="primary-action" onClick={() => void submitHelpRequest()} type="button">Send help request</button>
            </div>
          </article>
        </div>
      ) : null}
    </main>
  );
}
