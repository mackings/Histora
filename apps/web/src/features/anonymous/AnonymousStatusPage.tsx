import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { type ApiComment, type ApiStatus, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

export function AnonymousStatusPage({
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
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [comments, setComments] = useState<Array<{ author: string; text: string }>>([]);
  const [replyDraft, setReplyDraft] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ApiStatus>(`/statuses/share/${shareSlug}`)
      .then((payload) => {
        if (!cancelled) {
          setStatus(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setFeedback(getErrorMessage(error, "Could not load this anonymous status."));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareSlug]);

  useEffect(() => {
    if (!status) {
      return;
    }

    void apiRequest<ApiComment[]>(`/comments?targetType=status&targetId=${encodeURIComponent(status.id)}`)
      .then((statusComments) => {
        setComments(
          statusComments.map((comment) => ({
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
          targetType: "status",
          targetId: status.id,
          body: replyDraft.trim()
        }
      });

      setComments((current) => [{ author: createdComment.authorName, text: createdComment.body }, ...current]);
      setReplyDraft("");
      setFeedback("Reply posted.");
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not post your reply."));
    }
  };

  return (
    <main className="feed-reader-shell">
      <div className="profile-edit-back">
        <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
          <IconComponent className="button-icon" name="arrow" />
          BACK
        </button>
      </div>

      <section className="story-reader-stage card">
        <div className="story-reader-stage-copy">
          <SectionLabelComponent>ANONYMOUS_STATUS</SectionLabelComponent>
          <h1>{status ? "Anonymous status" : "Loading status..."}</h1>
          <p>{status?.body ?? "Open an anonymous status from the feed or anonymous hub to read it here."}</p>
        </div>
      </section>

      {feedback ? <p className="status-feedback">{feedback}</p> : null}

      <section className="feed-reader-single-column">
        <article className="chapter-reader-card card">
          <div className="chapter-section-head">
            <div>
              <SectionLabelComponent>REPLIES</SectionLabelComponent>
              <h3>Reply anonymously on Histora</h3>
            </div>
            <span>{comments.length} replies</span>
          </div>
          <div className="feed-thread-list">
            {comments.map((comment, index) => (
              <article className="feed-thread-item" key={`${comment.author}-${index}`}>
                <div className="feed-thread-line" aria-hidden="true" />
                <div className="feed-thread-copy">
                  <div className="feed-thread-head">
                    <strong>{comment.author}</strong>
                  </div>
                  <p>{comment.text}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="feed-thread-reply">
            <textarea
              className="status-compose-input feed-thread-input"
              onChange={(event) => setReplyDraft(event.target.value)}
              placeholder="Reply to this anonymous status..."
              value={replyDraft}
            />
            <button className="primary-action" onClick={() => void submitReply()} type="button">
              Post reply
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}
