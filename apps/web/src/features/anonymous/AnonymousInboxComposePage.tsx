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
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSending, setIsSending] = useState(false);
  const normalizedRecipient = recipientSlug.toLowerCase();
  const maxMessageLength = 300;
  const remainingCharacters = maxMessageLength - body.length;

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
          recipientUsername: normalizedRecipient,
          body: trimmedBody,
          distribution: "external"
        }
      });
      setBody("");
      setFeedback("Sent. Your identity stays hidden.");
      window.setTimeout(() => navigate("/anonymous", { replace: true }), 900);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Could not send the anonymous message."));
      setIsSending(false);
    }
  };

  return (
    <main className="anonymous-ngl-shell anonymous-compose-page">
      <div className="anonymous-ngl-topbar">
        <button className="anonymous-ngl-back" onClick={() => navigate("/anonymous")} type="button">
          <IconComponent className="button-icon" name="arrow" />
          BACK
        </button>
        <span>Histora anonymous</span>
      </div>

      <section className="anonymous-ngl-stage">
        <div className="anonymous-ngl-copy">
          <SectionLabelComponent>WRITE ANONYMOUSLY</SectionLabelComponent>
          <h1>Send @{normalizedRecipient} an anonymous message.</h1>
          <p>Say what you want to say. The sender name is not shown to the recipient.</p>
        </div>

        <article className="anonymous-ngl-phone-card" aria-label={`Anonymous message form for ${normalizedRecipient}`}>
          <div className="anonymous-ngl-question-card">
            <div className="anonymous-ngl-avatar" aria-hidden="true">
              {normalizedRecipient.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <span>@{normalizedRecipient}</span>
              <strong>send me anonymous messages!</strong>
            </div>
          </div>

          <label className="anonymous-ngl-message-box">
            <span>Anonymous message</span>
            <textarea
              disabled={isSending}
              maxLength={maxMessageLength}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Type something honest..."
              value={body}
            />
            <small className={remainingCharacters < 30 ? "is-low" : ""}>{remainingCharacters} characters left</small>
          </label>

          {feedback ? <p className="anonymous-ngl-feedback">{feedback}</p> : null}

          <button className="anonymous-ngl-send" disabled={isSending || !body.trim()} onClick={() => void submitAnonymousMessage()} type="button">
            {isSending ? "Sending..." : "Send anonymously"}
            <IconComponent className="button-icon" name="arrow" />
          </button>

          <div className="anonymous-ngl-trust-grid">
            <span>No sender name</span>
            <span>Private inbox</span>
            <span>Share-ready</span>
          </div>

          <button className="anonymous-ngl-create" onClick={() => navigate("/anonymous")} type="button">
            Get your own anonymous link
          </button>
        </article>
      </section>
    </main>
  );
}
