import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { type ApiStory, apiRequest } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import type { StudioPreviewPayload, StudioPublishPayload } from "./types";

export function StudioPreviewPage({
  accessToken
}: {
  accessToken: string;
}) {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<StudioPreviewPayload | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    const rawPreview = window.sessionStorage.getItem("histora-studio-preview");
    if (!rawPreview) {
      return;
    }

    try {
      setPreview(JSON.parse(rawPreview));
    } catch {
      setPreview(null);
    }
  }, []);

  return (
    <main className="studio-preview-page">
      <section className="studio-preview-topbar">
        <button className="ghost-action" onClick={() => navigate("/studio")} type="button">Back To Edit</button>
        <button
          className="primary-action"
          disabled={isPublishing}
          onClick={() => {
            const rawPublishPayload = window.sessionStorage.getItem("histora-studio-publish-payload");
            if (!rawPublishPayload) {
              setPreviewError("Preview payload expired. Return to studio and preview again.");
              return;
            }

            try {
              const publishPayload = JSON.parse(rawPublishPayload) as StudioPublishPayload;
              setIsPublishing(true);
              setPreviewError("");
              void (publishPayload.storyId
                ? apiRequest<ApiStory>(`/stories/${publishPayload.storyId}`, {
                    method: "PATCH",
                    accessToken,
                    body: publishPayload.payload
                  })
                : apiRequest<ApiStory>("/stories", {
                    method: "POST",
                    accessToken,
                    body: publishPayload.payload
                  }))
                .then((story) => {
                  window.sessionStorage.removeItem("histora-studio-preview");
                  window.sessionStorage.removeItem("histora-studio-publish-payload");
                  window.sessionStorage.removeItem("histora-studio-reviewed");
                  navigate(`/feed/story/${story.slug}`);
                })
                .catch((error) => {
                  setPreviewError(getErrorMessage(error, "Could not publish story."));
                  setIsPublishing(false);
                });
            } catch {
              setPreviewError("Preview payload expired. Return to studio and preview again.");
            }
          }}
          type="button"
        >
          {isPublishing ? "Publishing..." : "Publish"}
        </button>
      </section>
      {previewError ? <p className="status-feedback">{previewError}</p> : null}

      <article className="studio-preview-reader card">
        <span className="story-tag">{preview?.visibility ?? "draft"}</span>
        <h1>{preview?.storyTitle ?? "Preview unavailable"}</h1>
        <p className="preview-summary">{preview?.storySummary ?? "Open preview from the studio to see the reader view."}</p>

        {preview?.imageAttachments?.length ? (
          <div className="preview-gallery">
            {preview.imageAttachments.map((attachment) => (
              <div className="preview-gallery-frame" key={attachment.url}>
                <img alt={attachment.name} className="media-preview-image" src={attachment.url} />
              </div>
            ))}
          </div>
        ) : null}

        <div className="preview-meta-strip">
          <span>{preview?.activeChapterNumberLabel ?? "No chapter selected"}</span>
          <span>{preview?.activeChapter ?? "Untitled chapter"}</span>
          <span>{preview?.chapterStatus ?? "Draft"}</span>
          <span>{preview?.chapterType ?? "story"}</span>
          <span>{preview?.wordCount ?? 0} words</span>
          <span>{preview?.allowComments ? "Comments on" : "Comments off"}</span>
        </div>

        {preview?.chapterChecklist?.required?.length || preview?.chapterChecklist?.optional?.length ? (
          <section className="preview-chapter-block">
            <h2>Current chapter progress</h2>
            {preview.chapterChecklist.required.length ? (
              <div className="preview-checklist-group">
                <strong>Still needed</strong>
                <ul className="preview-checklist-list">
                  {preview.chapterChecklist.required.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="preview-checklist-group">
                <strong>Required items complete</strong>
              </div>
            )}
            {preview.chapterChecklist.optional.length ? (
              <div className="preview-checklist-group">
                <strong>Optional enrichments</strong>
                <ul className="preview-checklist-list">
                  {preview.chapterChecklist.optional.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {preview?.voiceNotes?.length ? (
          <section className="preview-chapter-block">
            <h2>Voice notes</h2>
            <div className="preview-voice-list">
              {preview.voiceNotes.map((voice) => (
                <article className="preview-voice-card" key={voice.url}>
                  <strong>{voice.name}</strong>
                  <span>{voice.source}</span>
                  <audio className="voice-player" controls src={voice.url} />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {preview?.timelineEntries?.length ? (
          <section className="preview-chapter-block">
            <h2>Timeline moments</h2>
            <div className="preview-timeline-list">
              {preview.timelineEntries.map((entry, index) => (
                <article className="preview-timeline-row" key={`${entry.year}-${entry.month}-${entry.day}-${index}`}>
                  <strong>
                    {[entry.month, entry.day, entry.year].filter(Boolean).join(" / ") || "Undated moment"}
                  </strong>
                  <h3>{entry.title || "Untitled moment"}</h3>
                  <p>{entry.body || "No timeline notes added yet."}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="preview-chapter-block">
          <div className="preview-chapter-heading">
            <h2>{preview?.activeChapter ?? "Story preview"}</h2>
            <span className="story-tag">{preview?.wordCount ?? 0} words</span>
          </div>
          <div
            className="preview-rich-text"
            dangerouslySetInnerHTML={{
              __html: preview?.chapterBody ?? "<p>Open a preview from the studio to render the story reader view.</p>"
            }}
          />
        </section>
      </article>
    </main>
  );
}
