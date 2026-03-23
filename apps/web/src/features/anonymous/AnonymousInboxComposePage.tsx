import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { type ApiAnonymousMessage, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

export function AnonymousInboxComposePage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const { recipientSlug = "kingsleyarchive" } = useParams();
  const navigate = useNavigate();
  const [body, setBody] = useState("I need perspective before I decide what the next chapter should be.");
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submitAnonymousMessage = async () => {
    if (isSending) {
      return;
    }

    const trimmedBody = body.trim();

    if (!trimmedBody) {
      setFeedback("Add your message first.");
      return;
    }

    try {
      setIsSending(true);
      setFeedback("");
      await apiRequest<ApiAnonymousMessage>("/anonymous-messages", {
        method: "POST",
        accessToken,
        body: {
          recipientUsername: recipientSlug.toLowerCase(),
          body: trimmedBody,
          distribution: "external"
        }
      });
      navigate("/anonymous", { replace: true });
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not send the anonymous message."));
      setIsSending(false);
    }
  };

  return (
    <main className="feed-reader-shell anonymous-hub-shell anonymous-compose-page">
      <div className="profile-edit-back">
        <button className="ghost-action" onClick={() => navigate("/anonymous")} type="button">
          <IconComponent className="button-icon" name="arrow" />
          BACK
        </button>
      </div>

      <section className="story-reader-stage card anonymous-hero">
        <div className="anonymous-hero-copy">
          <SectionLabelComponent>WRITE_ANONYMOUSLY</SectionLabelComponent>
          <h1>Send an anonymous message to @{recipientSlug}.</h1>
          <p>Your message stays anonymous. The recipient decides whether to keep it inside Histora or share it elsewhere.</p>
        </div>
      </section>

      <section className="chapter-reader-card card anonymous-compose-card">
        <div className="anonymous-panel-body">
          <div className="profile-section-copy anonymous-section-copy">
            <SectionLabelComponent>MESSAGE_FORM</SectionLabelComponent>
            <h2>Write the anonymous message</h2>
          </div>
          <div className="profile-form-grid">
            <label>
              Message
              <textarea
                disabled={isSending}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write your anonymous message..."
                value={body}
              />
            </label>
          </div>
          {feedback ? <p className="status-feedback">{feedback}</p> : null}
          <div className="chapter-controls">
            <button className="ghost-action" disabled={isSending} onClick={() => navigate("/anonymous")} type="button">
              CANCEL
            </button>
            <button className="primary-action" disabled={isSending} onClick={() => void submitAnonymousMessage()} type="button">
              {isSending ? "SENDING..." : "SEND ANONYMOUS MESSAGE"}
              <IconComponent className="button-icon" name="arrow" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
