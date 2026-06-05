import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type ApiAnonymousMessage, type AuthUser, apiRequest, subscribeToAppEvents } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { formatAnonymousMeta } from "../feed/support";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

type AnonymousInboxEvent =
  | {
      type: "event";
      channel: string;
      payload?: {
        kind?: "anonymous.inbox.upsert" | "anonymous.inbox.received";
        message?: ApiAnonymousMessage;
      };
    }
  | {
      type: "event";
      channel: string;
      payload?: {
        kind?: "anonymous.inbox.deleted";
        messageId?: string;
      };
    };

const mergeAnonymousInboxMessage = (messages: ApiAnonymousMessage[], incoming: ApiAnonymousMessage) =>
  [...messages.filter((message) => message.id !== incoming.id), incoming].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

const isAnonymousInboxUpsertPayload = (
  payload: AnonymousInboxEvent["payload"]
): payload is { kind?: "anonymous.inbox.upsert" | "anonymous.inbox.received"; message?: ApiAnonymousMessage } =>
  payload?.kind === "anonymous.inbox.upsert" || payload?.kind === "anonymous.inbox.received";

const isAnonymousInboxDeletePayload = (
  payload: AnonymousInboxEvent["payload"]
): payload is { kind?: "anonymous.inbox.deleted"; messageId?: string } => payload?.kind === "anonymous.inbox.deleted";

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
  const [messages, setMessages] = useState<ApiAnonymousMessage[]>([]);
  const [shareFeedback, setShareFeedback] = useState("");
  const profileLink =
    typeof window === "undefined"
      ? `/anonymous/write/${currentUser.username}`
      : `${window.location.origin}/anonymous/write/${currentUser.username}`;

  const helpRequests = useMemo(
    () =>
      messages.flatMap((message) =>
        (message.helpRequests ?? []).map((request) => ({
          ...request,
          messageId: message.id,
          excerpt: message.body
        }))
      ),
    [messages]
  );

  useEffect(() => {
    let cancelled = false;

    const loadMessages = async () => {
      try {
        const inboxMessages = await apiRequest<ApiAnonymousMessage[]>("/anonymous-messages/inbox", { accessToken });

        if (!cancelled) {
          setMessages(inboxMessages);
        }
      } catch (error) {
        if (!cancelled) {
          setShareFeedback(getErrorMessage(error, "Could not load anonymous messages."));
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const unsubscribe = subscribeToAppEvents(
      accessToken,
      [`anonymous:inbox:${currentUser.id}`],
      (rawMessage) => {
        const message = rawMessage as AnonymousInboxEvent;
        if (message.type !== "event" || message.channel !== `anonymous:inbox:${currentUser.id}`) {
          return;
        }

        const payload = message.payload;

        if (isAnonymousInboxUpsertPayload(payload)) {
          const incomingMessage = payload.message;
          if (!incomingMessage) {
            return;
          }

          setMessages((current) => mergeAnonymousInboxMessage(current, incomingMessage));
          return;
        }

        if (isAnonymousInboxDeletePayload(payload) && payload.messageId) {
          setMessages((current) => current.filter((entry) => entry.id !== payload.messageId));
        }
      }
    );

    return unsubscribe;
  }, [accessToken, currentUser.id]);

  const copyProfileLink = async () => {
    if (typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(profileLink);
      setShareFeedback("Profile link copied. People can use it to send you anonymous messages.");
    } catch {
      setShareFeedback("Could not copy the profile link on this device.");
    }
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
          <p>Share your profile link so people can paste anonymous messages into your inbox.</p>
        </div>
        <div className="anonymous-inbox-card">
          <span className="story-tag">YOUR PROFILE LINK</span>
          <strong>One link for all anonymous messages</strong>
          <p>{profileLink}</p>
          <div className="anonymous-hub-actions">
            <button className="ghost-action" onClick={copyProfileLink} type="button">
              COPY PROFILE LINK
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
              <span>{messages.length} total message{messages.length === 1 ? "" : "s"} in your inbox.</span>
            </div>
            <div className="anonymous-hub-list">
              {messages.length ? (
                messages.map((message) => (
                  <article className="anonymous-hub-card" key={message.id}>
                    <div className="anonymous-hub-card-top">
                      <div className="anonymous-hub-card-copy">
                        <strong>Anonymous message</strong>
                        <span>{formatAnonymousMeta(message.createdAt)}</span>
                      </div>
                    </div>
                    <p>{message.body}</p>
                  </article>
                ))
              ) : (
                <article className="anonymous-empty">
                  <strong>No anonymous messages yet</strong>
                  <p>Copy your profile link and share it to start receiving anonymous messages.</p>
                  <div className="anonymous-hub-actions">
                    <button className="ghost-action" onClick={copyProfileLink} type="button">
                      COPY PROFILE LINK
                    </button>
                  </div>
                </article>
              )}
            </div>
          </div>
        </article>

        <article className="chapter-reader-card card anonymous-hub-panel">
          <div className="anonymous-panel-body">
            <div className="profile-section-copy anonymous-section-copy">
              <SectionLabelComponent>HELP</SectionLabelComponent>
              <h2>Readers who want to help</h2>
              <span>{helpRequests.length} help request{helpRequests.length === 1 ? "" : "s"} from readers.</span>
            </div>
            <div className="anonymous-hub-list">
              {helpRequests.length ? (
                helpRequests.map((request) => (
                  <article className="anonymous-hub-card" key={request.id}>
                    <div className="anonymous-hub-card-top">
                      <div className="anonymous-hub-card-copy">
                        <strong>{request.accepted ? "Help accepted" : "Reader wants to help"}</strong>
                        <span>{formatAnonymousMeta(request.createdAt)}</span>
                      </div>
                    </div>
                    <p>
                      {request.accepted
                        ? `${request.helperName} (@${request.helperUsername}) was accepted to help on this anonymous message.`
                        : `${request.helperName ?? "A reader"}${request.helperUsername ? ` (@${request.helperUsername})` : ""} wants to help with this anonymous message.`}
                    </p>
                    <p className="anonymous-help-excerpt">{request.excerpt}</p>
                  </article>
                ))
              ) : (
                <article className="anonymous-empty">
                  <strong>No help requests yet</strong>
                  <p>Readers who want to help will appear here after they open a message and request to help.</p>
                </article>
              )}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
