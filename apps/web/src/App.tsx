import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import {
  chapterDrafts,
  feedPreview,
  pricingPlans,
  profileActivity,
  profileSavedShelf,
  profileSettings,
  profileStats,
  profileStories,
  readingShelves,
  storyCircles,
  timelineMoments,
  trendingStories
} from "./app-data";
import feedStory from "./assets/feed-story.svg";
import heroMemory from "./assets/hero-memory.svg";
import studioBoard from "./assets/studio-board.svg";

function Icon({
  name,
  className
}: {
  name:
    | "home"
    | "feed"
    | "write"
    | "premium"
    | "signin"
    | "spark"
    | "bookmark"
    | "heart"
    | "comment"
    | "share"
    | "bolt"
    | "arrow"
    | "check"
    | "close";
  className?: string;
}) {
  const paths = {
    home: "M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3v-10.5Z",
    feed: "M4 5h16v4H4V5Zm0 5.5h10V15H4v-4.5Zm0 6h16V19H4v-2.5Z",
    write: "M4 17.25V20h2.75L18.8 7.95l-2.75-2.75L4 17.25Z M20.7 6.05a1 1 0 0 0 0-1.4l-1.35-1.35a1 1 0 0 0-1.4 0l-1.05 1.05 2.75 2.75 1.05-1.05Z",
    premium: "M12 3l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.7 6.8 19.99l1-5.78-4.22-4.1 5.82-.85L12 3Z",
    signin: "M10 17l1.4-1.4-2.6-2.6H21v-2H8.8l2.6-2.6L10 7l-5 5 5 5Zm-7 4h7v-2H3V5h7V3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z",
    spark: "M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2Zm7 13l.95 2.55L22.5 18l-2.55.45L19 21l-.95-2.55L15.5 18l2.55-.45L19 15ZM5 14l1.2 3.2L9.4 18l-3.2 1.2L5 22l-1.2-2.8L.6 18l3.2-.8L5 14Z",
    bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z",
    heart: "M12 20.5 4.9 13.9a4.8 4.8 0 0 1 6.8-6.8L12 7.4l.3-.3a4.8 4.8 0 1 1 6.8 6.8L12 20.5Z",
    comment: "M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2Z",
    share: "M18 16a3 3 0 0 0-2.4 1.2l-6.6-3.3a3.2 3.2 0 0 0 0-1.8l6.6-3.3A3 3 0 1 0 15 7a3.2 3.2 0 0 0 .1.7L8.5 11a3 3 0 1 0 0 2l6.6 3.3A3 3 0 1 0 18 16Z",
    bolt: "M13 2 4 13h6l-1 9 9-11h-6l1-9Z",
    arrow: "M5 12h12.2l-4.1 4.1 1.4 1.4L21 11l-6.5-6.5-1.4 1.4 4.1 4.1H5v2Z",
    check: "m9.3 16.6-4-4 1.4-1.4 2.6 2.6 8-8 1.4 1.4-9.4 9.4Z",
    close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z"
  } as const;

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

function useHomeIntroVoice() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/" || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const hasPlayed = window.sessionStorage.getItem("histora-home-voice-played");
    if (hasPlayed) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance("Histora");
    utterance.rate = 0.58;
    utterance.pitch = 1.18;
    utterance.volume = 0.72;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find((voice) =>
        /female|woman|zira|samantha|karen|moira|ava|allison|aria|jenny/i.test(voice.name)
      );

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    };

    const speak = () => {
      pickVoice();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      window.sessionStorage.setItem("histora-home-voice-played", "true");
    };

    window.speechSynthesis.onvoiceschanged = pickVoice;

    const timer = window.setTimeout(speak, 650);

    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [location.pathname]);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="section-label">{children}</span>;
}

function AppShell({ children, isLoggedIn }: { children: React.ReactNode; isLoggedIn: boolean }) {
  useHomeIntroVoice();
  const location = useLocation();

  if (!isLoggedIn && location.pathname === "/") {
    return <div className="onboarding-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/studio")) {
    return <div className="studio-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/profile")) {
    return <div className="profile-focus-shell">{children}</div>;
  }

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <NavLink className="brandmark card" to="/">
          <span className="brand-lockup">
            <span className="brand-kicker">HISTORA_PROTOCOL</span>
            <strong>Histora</strong>
          </span>
          <span className="brand-badge">v2.0</span>
        </NavLink>

        <nav className="rail-nav card">
          <NavLink to="/">
            <Icon className="nav-icon" name="home" />
            Home
          </NavLink>
          <NavLink to="/feed">
            <Icon className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <Icon className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/pricing">
            <Icon className="nav-icon" name="premium" />
            Premium
          </NavLink>
          <NavLink to="/profile">
            <Icon className="nav-icon" name="bookmark" />
            Profile
          </NavLink>
          <NavLink to="/signin">
            <Icon className="nav-icon" name="signin" />
            Sign in
          </NavLink>
        </nav>

        <article className="rail-card card dark-card">
          <SectionLabel>ARCHIVE_ACCESS</SectionLabel>
          <h3>WRITE LIFE IN CHAPTERS.</h3>
          <p>Private stories, public storytelling, anonymous advice, and selected-reader drops inside one archive.</p>
          <NavLink className="primary-action" to="/signup">
            START WRITING
            <Icon className="button-icon" name="arrow" />
          </NavLink>
        </article>
      </aside>

      <div className="main-column">
        <header className="topbar card">
          <div className="topbar-copy">
            <SectionLabel>LIVE_ARCHIVE_NETWORK</SectionLabel>
            <strong>Social storytelling for real lives.</strong>
            <span>Build chapters, timeline drops, memory statuses, and controlled circles with a sharper editorial interface.</span>
          </div>
          <div className="topbar-actions">
            <NavLink className="ghost-action" to="/feed">
              EXPLORE
            </NavLink>
            <NavLink className="primary-action" to="/studio">
              NEW STORY
              <Icon className="button-icon" name="arrow" />
            </NavLink>
          </div>
        </header>

        {children}

        <nav className="mobile-dock card">
          <NavLink to="/">
            <Icon className="nav-icon" name="home" />
            Home
          </NavLink>
          <NavLink to="/feed">
            <Icon className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <Icon className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/pricing">
            <Icon className="nav-icon" name="premium" />
            Pro
          </NavLink>
          <NavLink to="/profile">
            <Icon className="nav-icon" name="bookmark" />
            Profile
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

function StoryCirclesRow() {
  type StatusEntry = {
    name: string;
    meta: string;
    tone: "orange" | "ink" | "add" | "blue";
    label: string;
    contentTitle: string;
    contentBody: string;
    anonymous?: boolean;
    shareSlug?: string;
    comments?: Array<{ author: string; text: string }>;
    helpFee?: number;
  };
  const emojiGroups = [
    { label: "Recent", icon: "🕘", emojis: ["😂", "❤️", "😭", "🔥", "🙏", "✨"] },
    { label: "Smileys", icon: "😊", emojis: ["😊", "😄", "😁", "😂", "🥹", "😮", "😌", "🤭"] },
    { label: "Love", icon: "💛", emojis: ["❤️", "💙", "💜", "💞", "💫", "🌈", "✨", "🫶"] },
    { label: "Support", icon: "🙌", emojis: ["👏", "🙏", "🙌", "🤍", "💭", "🤝", "🌟", "🕊️"] }
  ];
  const imageLibrary = [
    "Soft gradient card",
    "Journal page",
    "City window",
    "Memory board",
    "Polaroid frame",
    "Voice waveform"
  ];
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [seenStories, setSeenStories] = useState<number[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState("Today I finally wrote the chapter I kept postponing.");
  const [statusStyle, setStatusStyle] = useState<"plain" | "bold" | "italic">("plain");
  const [statusTone, setStatusTone] = useState<"sky" | "mint" | "peach">("sky");
  const [showEmojiLibrary, setShowEmojiLibrary] = useState(false);
  const [showImageLibrary, setShowImageLibrary] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeEmojiGroup, setActiveEmojiGroup] = useState("Recent");
  const [isAnonymousComposer, setIsAnonymousComposer] = useState(false);
  const [statusItems, setStatusItems] = useState<StatusEntry[]>(storyCircles as StatusEntry[]);
  const [replyDraft, setReplyDraft] = useState("");
  const [shareFeedback, setShareFeedback] = useState("");
  const [helpRequestTarget, setHelpRequestTarget] = useState<StatusEntry | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [anonymousReplyHistory, setAnonymousReplyHistory] = useState<string[]>([]);

  const activeStatus = activeIndex === null ? null : statusItems[activeIndex];
  const isAnonymousStatus = activeStatus?.name === "Anonymous" || activeStatus?.label.toLowerCase().includes("advice");
  const hasAlreadyRepliedToActiveAnonymous =
    Boolean(activeStatus?.shareSlug) && anonymousReplyHistory.includes(activeStatus.shareSlug);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const savedReplyHistory = window.localStorage.getItem("histora-anonymous-replies");
      if (!savedReplyHistory) {
        return;
      }

      const parsedHistory = JSON.parse(savedReplyHistory);
      if (Array.isArray(parsedHistory)) {
        setAnonymousReplyHistory(parsedHistory);
      }
    } catch {
      setAnonymousReplyHistory([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("histora-anonymous-replies", JSON.stringify(anonymousReplyHistory));
  }, [anonymousReplyHistory]);

  useEffect(() => {
    if (activeIndex === null) {
      setProgress(0);
      setIsPaused(false);
      return;
    }

    setSeenStories((current) => (current.includes(activeIndex) ? current : [...current, activeIndex]));
    setProgress(0);
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex === null || isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        const nextProgress = current + 4;

        if (nextProgress < 100) {
          return nextProgress;
        }

        setActiveIndex((currentIndex) => {
          if (currentIndex === null) {
            return null;
          }

          return currentIndex < statusItems.length - 1 ? currentIndex + 1 : null;
        });

        return 100;
      });
    }, 160);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused]);

  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setActiveIndex((current) => (current === null ? 0 : Math.min(current + 1, statusItems.length - 1)));
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => (current === null ? 0 : Math.max(current - 1, 0)));
      }

      if (event.key === "Escape") {
        setActiveIndex(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex]);

  const goToPrevious = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return 0;
      }

      return Math.max(current - 1, 0);
    });
  };

  const goToNext = () => {
    setActiveIndex((current) => {
      if (current === null) {
        return 0;
      }

      return current < statusItems.length - 1 ? current + 1 : null;
    });
  };

  const openStory = (index: number) => {
    if (statusItems[index]?.tone === "add") {
      setIsComposerOpen(true);
      setShowEmojiLibrary(false);
      setShowImageLibrary(false);
      setIsAnonymousComposer(false);
      setShareFeedback("");
      return;
    }

    setActiveIndex(index);
    setReplyDraft("");
    setShareFeedback("");
  };

  const insertSnippet = (snippet: string) => {
    setStatusDraft((current) => `${current}${current.endsWith(" ") || current.length === 0 ? "" : " "}${snippet}`);
  };

  const createShareSlug = () => `anon-${Date.now().toString(36)}`;
  const getStatusShareLink = (entry: StatusEntry) => {
    if (typeof window === "undefined" || !entry.shareSlug) {
      return "";
    }

    return `${window.location.origin}/status/${entry.shareSlug}`;
  };

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

    const words = entry.contentBody.split(" ");
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
    context.fillText(`Advice replies stay anonymous // ${entry.meta}`, 80, 1160);

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${entry.shareSlug ?? "histora-anonymous-status"}.png`;
    link.click();
    setShareFeedback("Anonymous status image saved to your device.");
  };

  const postStatus = () => {
    const nextEntry: StatusEntry = {
      name: isAnonymousComposer ? "Anonymous" : "Your status",
      meta: "Just now",
      tone: isAnonymousComposer ? "ink" : "blue",
      label: isAnonymousComposer ? "Advice status" : "Memory status",
      contentTitle: isAnonymousComposer ? "Anonymous advice status" : "Fresh memory status",
      contentBody: statusDraft,
      anonymous: isAnonymousComposer,
      shareSlug: isAnonymousComposer ? createShareSlug() : undefined,
      comments: isAnonymousComposer
        ? [
            { author: "Reply 1", text: "You are not overreacting. Protect your peace first." },
            { author: "Reply 2", text: "Take your time. You can ask for help without revealing yourself." }
          ]
        : [],
      helpFee: isAnonymousComposer ? 8 : undefined
    };

    setStatusItems((current) => [current[0], nextEntry, ...current.slice(1)]);
    setStatusDraft("Today I finally wrote the chapter I kept postponing.");
    setSelectedImage(null);
    setIsComposerOpen(false);
    setIsAnonymousComposer(false);
    setShareFeedback(
      isAnonymousComposer ? "Anonymous status posted. You can now copy the link or save the post image." : "Status posted."
    );
    setActiveIndex(1);
  };

  const submitReply = () => {
    if (!activeStatus || !replyDraft.trim()) {
      return;
    }

    if (activeStatus.anonymous && activeStatus.shareSlug && anonymousReplyHistory.includes(activeStatus.shareSlug)) {
      setShareFeedback("You have already sent one anonymous response to this post.");
      return;
    }

    setStatusItems((current) =>
      current.map((entry) =>
        entry.shareSlug === activeStatus.shareSlug
          ? {
              ...entry,
              comments: [...(entry.comments ?? []), { author: entry.anonymous ? "Anonymous reply" : "Reply", text: replyDraft.trim() }]
            }
          : entry
      )
    );
    if (activeStatus.anonymous && activeStatus.shareSlug) {
      setAnonymousReplyHistory((current) => [...current, activeStatus.shareSlug!]);
    }
    setReplyDraft("");
    setShareFeedback(activeStatus.anonymous ? "Anonymous advice sent." : "Reply sent.");
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
            <SectionLabel>STATUS_STREAM</SectionLabel>
            <h2>Quick memory drops</h2>
          </div>
          <span className="section-meta">SCROLL_SIDEWAYS</span>
        </div>

        <div className="status-scroll">
          {statusItems.map((circle, index) => (
            <button
              className={`status-bubble ${seenStories.includes(index) ? "status-bubble-seen" : ""}`}
              key={circle.name}
              onClick={() => openStory(index)}
              type="button"
            >
              <span className={`status-ring tone-${circle.tone}`}>
                <span className="status-avatar">{circle.tone === "add" ? "+" : circle.name.slice(0, 1)}</span>
              </span>
              <strong>{circle.name}</strong>
              <span className="status-bubble-meta">{circle.meta}</span>
            </button>
          ))}
        </div>
      </section>

      {isComposerOpen ? (
        <div className="status-viewer-backdrop" onClick={() => setIsComposerOpen(false)} role="presentation">
          <article className="status-composer card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>YOUR_STATUS</SectionLabel>
                <h3>Write a memory status</h3>
              </div>
              <button aria-label="Close status composer" className="icon-chip" onClick={() => setIsComposerOpen(false)} type="button">
                <Icon className="button-icon" name="close" />
              </button>
            </div>

            <div className="status-toolbar">
              <button
                className={statusStyle === "bold" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("bold")}
                type="button"
              >
                B
              </button>
              <button
                className={statusStyle === "italic" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("italic")}
                type="button"
              >
                I
              </button>
              <button
                className={statusStyle === "plain" ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setStatusStyle("plain")}
                type="button"
              >
                Aa
              </button>
              <button
                className={showEmojiLibrary ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setShowEmojiLibrary((current) => !current)}
                type="button"
              >
                Emoji
              </button>
              <button
                className={showImageLibrary ? "composer-chip active-composer-chip" : "composer-chip"}
                onClick={() => setShowImageLibrary((current) => !current)}
                type="button"
              >
                Photo
              </button>
              <button className="composer-chip" onClick={() => insertSnippet("[Voice]")} type="button">
                Voice
              </button>
              <button className="composer-chip" onClick={() => insertSnippet("@closefriends")} type="button">
                Mention
              </button>
            </div>

            <div className="status-tone-picker">
              {["sky", "mint", "peach"].map((tone) => (
                <button
                  className={statusTone === tone ? "tone-swatch active-tone-swatch" : "tone-swatch"}
                  key={tone}
                  onClick={() => setStatusTone(tone as "sky" | "mint" | "peach")}
                  type="button"
                >
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
                    <button
                      className={activeEmojiGroup === group.label ? "emoji-category active-emoji-category" : "emoji-category"}
                      key={group.label}
                      onClick={() => setActiveEmojiGroup(group.label)}
                      type="button"
                    >
                      <span>{group.icon}</span>
                      {group.label}
                    </button>
                  ))}
                </div>
                <div className="emoji-library">
                  {emojiGroups
                    .find((group) => group.label === activeEmojiGroup)
                    ?.emojis.map((emoji) => (
                    <button className="emoji-tile" key={emoji} onClick={() => insertSnippet(emoji)} type="button">
                      {emoji}
                    </button>
                    ))}
                </div>
              </div>
            ) : null}

            {showImageLibrary ? (
              <div className="picker-panel">
                <div className="picker-panel-head">
                  <strong>Image picker</strong>
                  <span>Select a status background</span>
                </div>
                <div className="image-library">
                  {imageLibrary.map((imageName, index) => (
                    <button
                      className={selectedImage === imageName ? "image-tile active-image-tile" : "image-tile"}
                      key={imageName}
                      onClick={() => setSelectedImage(imageName)}
                      type="button"
                    >
                      <span className={`image-tile-preview image-preview-${(index % 3) + 1}`} />
                      <strong>{imageName}</strong>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <textarea
              className="status-compose-input"
              onChange={(event) => setStatusDraft(event.target.value)}
              placeholder="Write your status..."
              value={statusDraft}
            />

            <div className={`status-compose-preview tone-preview-${statusTone} style-preview-${statusStyle}`}>
              <span className="story-tag">{isAnonymousComposer ? "Anonymous preview" : "Preview"}</span>
              {selectedImage ? <span className="preview-asset-tag">Background: {selectedImage}</span> : null}
              <p>{statusDraft}</p>
            </div>

            {isAnonymousComposer ? (
              <div className="anonymous-compose-note">
                <strong>Anonymous post tools</strong>
                <span>After posting, you can copy a share link and save the anonymous post image to your device.</span>
              </div>
            ) : null}

            <div className="status-composer-footer">
              <button className="ghost-action" onClick={() => insertSnippet("✨")} type="button">
                Add emoji
              </button>
              <button className="primary-action" onClick={postStatus} type="button">
                {isAnonymousComposer ? "Post anonymous status" : "Post status"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {activeStatus ? (
        <div className="status-viewer-backdrop" onClick={() => setActiveIndex(null)} role="presentation">
          <article className={`status-story-viewer tone-${activeStatus.tone}`} onClick={(event) => event.stopPropagation()}>
            <div className="story-progress-row">
              {statusItems.map((circle, index) => (
                <span className="story-progress-track" key={circle.name}>
                  <span
                    className="story-progress-fill"
                    style={{
                      width:
                        index < activeIndex
                          ? "100%"
                          : index === activeIndex
                            ? `${progress}%`
                            : "0%"
                    }}
                  />
                </span>
              ))}
            </div>

            <div className="story-viewer-top">
              <div className="story-viewer-author">
                <span className={`status-ring tone-${activeStatus.tone}`}>
                  <span className="status-avatar">{activeStatus.tone === "add" ? "+" : activeStatus.name.slice(0, 1)}</span>
                </span>
                <div>
                  <strong>{activeStatus.name}</strong>
                  <span>{activeStatus.meta}</span>
                </div>
              </div>
              <div className="story-viewer-top-actions">
                <button aria-label="Close story viewer" className="icon-chip" onClick={() => setActiveIndex(null)} type="button">
                  <Icon className="button-icon" name="close" />
                </button>
                <button className="story-chip" onClick={() => setIsPaused((current) => !current)} type="button">
                  {isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>

            <div className="story-viewer-stage">
              <button aria-label="Previous story" className="story-nav-zone story-nav-left" onClick={goToPrevious} type="button" />
              <button aria-label="Next story" className="story-nav-zone story-nav-right" onClick={goToNext} type="button" />

              <div className="story-stage-card">
                <span className="story-tag">{activeStatus.label}</span>
                <h3>{activeStatus.contentTitle}</h3>
                <p>{activeStatus.contentBody}</p>
                <div className="story-stage-metrics">
                  <span>Memory status</span>
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
                    <button className="story-chip" onClick={() => copyStatusLink(activeStatus)} type="button">Copy link</button>
                    <button className="story-chip" onClick={() => downloadAnonymousStatusImage(activeStatus)} type="button">Save image</button>
                    <button className="story-chip" onClick={() => setHelpRequestTarget(activeStatus)} type="button">Request to help</button>
                  </div>
                ) : null}
                {shareFeedback ? <p className="status-feedback">{shareFeedback}</p> : null}
              </div>
            </div>

            <div className="story-reply-bar">
              <input
                disabled={Boolean(isAnonymousStatus && hasAlreadyRepliedToActiveAnonymous)}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder={
                  isAnonymousStatus
                    ? hasAlreadyRepliedToActiveAnonymous
                      ? "You already sent one anonymous response"
                      : "Reply anonymously..."
                    : `Reply to ${activeStatus.name}...`
                }
                value={hasAlreadyRepliedToActiveAnonymous ? "" : replyDraft}
              />
              <button
                className="primary-action"
                disabled={Boolean(isAnonymousStatus && hasAlreadyRepliedToActiveAnonymous)}
                onClick={submitReply}
                type="button"
              >
                {isAnonymousStatus
                  ? hasAlreadyRepliedToActiveAnonymous
                    ? "Response sent"
                    : "Send anonymous reply"
                  : "Send"}
              </button>
            </div>

            {activeStatus.comments?.length ? (
              <div className="story-comment-list">
                {activeStatus.comments.map((comment, index) => (
                  <div className="story-comment-card" key={`${comment.author}-${index}`}>
                    <strong>{comment.author}</strong>
                    <p>{comment.text}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="story-footer-row">
              <button className="ghost-action" disabled={activeIndex === 0} onClick={goToPrevious} type="button">
                Previous
              </button>
              <button className="ghost-action" onClick={goToNext} type="button">
                {activeIndex === statusItems.length - 1 ? "Finish" : "Next"}
              </button>
            </div>
          </article>
        </div>
      ) : null}

      {helpRequestTarget ? (
        <div className="status-viewer-backdrop" onClick={() => setHelpRequestTarget(null)} role="presentation">
          <article className="status-help-modal card" onClick={(event) => event.stopPropagation()}>
            <div className="status-composer-top">
              <div>
                <SectionLabel>CONSENT_FEE</SectionLabel>
                <h3>Request access to help this anonymous poster</h3>
              </div>
              <button aria-label="Close help dialog" className="icon-chip" onClick={() => setHelpRequestTarget(null)} type="button">
                <Icon className="button-icon" name="close" />
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

function HomePage() {
  return (
    <main className="page-shell">
      <StoryCirclesRow />

      <section className="hero-layout">
        <article className="hero-copy-card card">
          <SectionLabel>FEATURED_LAUNCH</SectionLabel>
          <h1>CHAPTER YOUR LIFE. POST THE MOMENTS. CONTROL WHO SEES THEM.</h1>
          <p>
            Histora turns real-life history into a readable social archive. Publish full chapters, post status-style memory drops,
            attach images or voice notes, and choose whether each story stays private, anonymous, selected, or public.
          </p>
          <div className="hero-actions">
            <NavLink className="primary-action" to="/feed">
              ENTER FEED
              <Icon className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/studio">
              OPEN STUDIO
            </NavLink>
          </div>

          <div className="status-matrix">
            {readingShelves.map((shelf) => (
              <article key={shelf.title} className="status-card">
                <span className="story-tag">{shelf.mood}</span>
                <strong>{shelf.title}</strong>
                <span>{shelf.meta}</span>
                <small>{shelf.reactions}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="hero-visual-card card">
          <div className="image-frame">
            <img alt="Featured story collage" className="feature-image" src={heroMemory} />
          </div>
          <div className="hero-overlay-stack">
            <article className="overlay-card">
              <SectionLabel>EDITOR_PICK</SectionLabel>
              <h3>FROM BORROWED ROOMS TO MY OWN FRONT DOOR</h3>
              <p>12 chapters / 3 timelines / 1 voice note / 12.4K readers</p>
            </article>
            <article className="metric-strip">
              <span>READS // 12.4K</span>
              <span>SAVES // 2.3K</span>
              <span>STATUS // LIVE</span>
            </article>
          </div>
        </article>
      </section>

      <section className="two-column-section">
        <article className="large-panel card">
          <div className="section-head">
            <div>
              <SectionLabel>DISCOVERY_QUEUE</SectionLabel>
              <h2>What readers are opening today</h2>
            </div>
            <NavLink className="ghost-action" to="/feed">
              VIEW ALL
            </NavLink>
          </div>
          <div className="trend-list">
            {trendingStories.map((story, index) => (
              <div key={story.title} className="trend-row">
                <span className="trend-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{story.title}</strong>
                  <span>{story.author}</span>
                </div>
                <span>{story.reads}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="large-panel card protocol-panel">
          <SectionLabel>ARCHIVE_PROTOCOL</SectionLabel>
          <h2>Built for visual histories, not plain posts.</h2>
          <img alt="Feed layout preview" className="feature-image compact-image" src={feedStory} />
          <div className="protocol-grid">
            <div className="protocol-row">
              <strong>PUBLIC</strong>
              <span>Discoverable chapters with read counts and comments.</span>
            </div>
            <div className="protocol-row">
              <strong>PRIVATE</strong>
              <span>Archive personal histories with stronger access control.</span>
            </div>
            <div className="protocol-row">
              <strong>ANON</strong>
              <span>Ask for advice without exposing identity.</span>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}

function OnboardingPage() {
  return (
    <main className="page-shell">
      <section className="hero-layout onboarding-hero">
        <article className="hero-copy-card card">
          <SectionLabel>WELCOME_TO_HISTORA</SectionLabel>
          <h1>Turn your life into chapters, statuses, and timelines.</h1>
          <p>
            Build a social archive from real memories. Write chapter by chapter, post quick status drops, attach media, and control
            who gets access.
          </p>
          <div className="hero-actions">
            <NavLink className="primary-action" to="/signup">
              SIGN UP
              <Icon className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/signin">
              SIGN IN
            </NavLink>
          </div>
          <div className="status-matrix">
            {readingShelves.map((shelf) => (
              <article key={shelf.title} className="status-card">
                <span className="story-tag">{shelf.mood}</span>
                <strong>{shelf.title}</strong>
                <span>{shelf.meta}</span>
                <small>{shelf.reactions}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="hero-visual-card card">
          <div className="image-frame">
            <img alt="Histora onboarding preview" className="feature-image" src={heroMemory} />
          </div>
          <div className="hero-overlay-stack">
            <article className="overlay-card">
              <SectionLabel>START_HERE</SectionLabel>
              <h3>PRIVATE MEMORIES, PUBLIC STORIES, ANONYMOUS ADVICE</h3>
              <p>Start with your first profile and move into chapters, statuses, contributors, and premium media.</p>
            </article>
          </div>
        </article>
      </section>
    </main>
  );
}

function AuthPage({
  mode,
  onAuthenticated
}: {
  mode: "signin" | "signup" | "forgot" | "reset";
  onAuthenticated: () => void;
}) {
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const isSignin = mode === "signin";
  const navigate = useNavigate();

  const handlePrimaryAction = () => {
    if (isSignin || isSignup) {
      onAuthenticated();
      navigate("/feed");
      return;
    }

    if (isReset) {
      navigate("/signin");
    }
  };

  return (
    <main className="page-shell auth-shell">
      <section className="auth-layout">
        <article className="auth-info card">
          <SectionLabel>
            {isSignup ? "CREATE_IDENTITY" : isForgot ? "RECOVERY_LINK" : isReset ? "RESET_ARCHIVE_ACCESS" : "RETURN_TO_ARCHIVE"}
          </SectionLabel>
          <h1>
            {isSignup
              ? "JOIN THE SOCIAL ARCHIVE."
              : isForgot
                ? "RESET ACCESS WITHOUT LOSING YOUR DRAFTS."
                : isReset
                  ? "SET A NEW PASSWORD FOR YOUR ARCHIVE."
                  : "SIGN IN TO CONTINUE WRITING."}
          </h1>
          <p>
            {isSignup
              ? "Create your profile, draft in private, publish when ready, and control who can read each story."
              : isForgot
                ? "We will send a recovery link so you can return to your stories, drafts, statuses, and profile controls."
                : isReset
                  ? "Choose a stronger password and restore access to your protected archive, anonymous posts, and premium tools."
                  : "Return to your feed, chapter drafts, status replies, premium tools, and profile controls."}
          </p>
          <div className="auth-feature-list">
            <div className="auth-feature-row">
              <strong>Private and public archive</strong>
              <span>Choose exactly who can see each story, chapter, or anonymous post.</span>
            </div>
            <div className="auth-feature-row">
              <strong>Profile and identity controls</strong>
              <span>Manage your bio, reading stats, premium plan, and chapter visibility from one place.</span>
            </div>
            <div className="auth-feature-row">
              <strong>Status and advice access</strong>
              <span>Track anonymous responses, help requests, and consent-fee updates inside your account.</span>
            </div>
          </div>
          <div className="image-frame">
            <img alt="Writing board preview" className="feature-image" src={studioBoard} />
          </div>
        </article>

        <article className="auth-card card">
          <div className="section-head">
            <div>
              <SectionLabel>{isSignup ? "ACCOUNT_SETUP" : isForgot ? "EMAIL_RECOVERY" : isReset ? "PASSWORD_RESET" : "AUTH_GATEWAY"}</SectionLabel>
              <h2>{isSignup ? "Create your account" : isForgot ? "Forgot password" : isReset ? "Reset password" : "Sign in"}</h2>
            </div>
          </div>
          <form className="auth-form">
            {isSignup ? <input placeholder="Full name" /> : null}
            {isSignup ? <input placeholder="Username" /> : null}
            {(isSignin || isSignup || isForgot) ? <input placeholder="Email address" /> : null}
            {(isSignin || isSignup) ? <input placeholder="Password" type="password" /> : null}
            {isReset ? <input placeholder="Reset code" /> : null}
            {isReset ? <input placeholder="New password" type="password" /> : null}
            {isReset ? <input placeholder="Confirm new password" type="password" /> : null}
            {isSignup ? <input placeholder="Date of birth" type="date" /> : null}
            {isSignup ? (
              <label className="toggle-row auth-toggle-row">
                <input defaultChecked type="checkbox" />
                <span>Allow comments on published chapters by default</span>
              </label>
            ) : null}
            <button className="primary-action block-action" onClick={handlePrimaryAction} type="button">
              {isSignup ? "CREATE ACCOUNT" : isForgot ? "SEND RESET LINK" : isReset ? "UPDATE PASSWORD" : "SIGN IN"}
              <Icon className="button-icon" name="arrow" />
            </button>
          </form>

          <div className="auth-support-links">
            {isSignin ? <NavLink to="/forgot-password">Forgot password?</NavLink> : null}
            {isSignin ? <NavLink to="/signup">Create a new account</NavLink> : null}
            {isSignup ? <NavLink to="/signin">Already have an account? Sign in</NavLink> : null}
            {isForgot ? <NavLink to="/reset-password">Already have a code? Reset password</NavLink> : null}
            {isReset ? <NavLink to="/signin">Back to sign in</NavLink> : null}
          </div>
          <div className="auth-note card">
            <strong>{isSignin ? "Protected access" : "Account setup details"}</strong>
            <span>
              {isSignin
                ? "Sign in to restore your saved studio draft, profile settings, anonymous advice activity, and premium limits."
                : "Your account will control profile visibility, chapter defaults, anonymous post settings, and saved reading activity."}
            </span>
          </div>
        </article>
      </section>
    </main>
  );
}

function ProfilePage() {
  return (
    <main className="page-shell">
      <section className="topbar card profile-utility-bar">
        <div className="topbar-copy profile-topbar-copy">
          <strong>Profile archive</strong>
          <span>Identity, privacy, and archive controls.</span>
        </div>
        <div className="topbar-actions profile-topbar-actions">
          <NavLink className="ghost-action" to="/feed">
            BACK TO FEED
          </NavLink>
          <NavLink className="primary-action" to="/profile/edit">
            EDIT PROFILE
            <Icon className="button-icon" name="arrow" />
          </NavLink>
        </div>
      </section>

      <section className="profile-stage card">
        <div className="profile-stage-copy">
          <h1>Kingsley Udoma</h1>
          <strong>@kingsleyarchive</strong>
          <p>Archivist of movement, family memory, hard-earned reinventions, and anonymous advice threads that help others breathe.</p>
        </div>

        <div className="profile-header">
          <span className="profile-avatar-xl">K</span>
          <div className="profile-header-copy">
            <div className="profile-header-meta">
              <span className="story-tag">PUBLIC PROFILE</span>
              <span className="story-tag">PRO PLAN</span>
            </div>
            <p>Writing real-life chapters about home, migration, rebuilding, and the timelines that made identity visible.</p>
          </div>
          <div className="profile-header-actions">
            <NavLink className="primary-action" to="/profile/edit">
              EDIT PROFILE
              <Icon className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/studio">
              OPEN STUDIO
            </NavLink>
          </div>
        </div>

      </section>

      <section className="profile-metric-strip">
        {profileStats.map((stat) => (
          <article className="profile-stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </article>
        ))}
      </section>

      <section className="profile-content-grid">
        <div className="profile-primary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>PUBLISHED_STORIES</SectionLabel>
                <h2>Stories and chapter packs</h2>
              </div>
              <div className="profile-story-list">
                {profileStories.map((story) => (
                  <div className="profile-story-card" key={story.title}>
                    <div className="profile-story-head">
                      <div className="profile-story-copy">
                        <strong>{story.title}</strong>
                        <span>{story.chapters}</span>
                      </div>
                      <span className="story-tag">{story.visibility}</span>
                    </div>
                    <small>{story.reads} // {story.status}</small>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>RECENT_ACTIVITY</SectionLabel>
                <h2>Archive notifications</h2>
              </div>
              <div className="profile-activity-list">
                {profileActivity.map((item) => (
                  <div className="profile-activity-row" key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                    <small>{item.time}</small>
                  </div>
                ))}
              </div>
            </div>
          </article>
        </div>

        <div className="profile-secondary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>ACCOUNT_CONTROLS</SectionLabel>
                <h2>What you can manage</h2>
              </div>
              <div className="profile-settings-list">
                {profileSettings.map((item) => (
                  <div className="profile-setting-row" key={item.title}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>ANON_AND_HELP</SectionLabel>
                <h2>Anonymous posts and help requests</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Anonymous advice posts</strong>
                  <span>8 active advice drops, with one-response-per-user protection and shareable safe links.</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Consent-fee requests</strong>
                  <span>2 pending helper requests waiting for your approval before contact access is shared.</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Comment defaults</strong>
                  <span>Comments are enabled for public chapters and disabled for sensitive archive entries.</span>
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>SAVED_AND_PREMIUM</SectionLabel>
                <h2>Saved reading and plan status</h2>
              </div>
              <div className="profile-story-list">
                {profileSavedShelf.map((item) => (
                  <div className="profile-story-card" key={item.title}>
                    <div className="profile-story-copy">
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="profile-premium-card">
                <span className="story-tag">PRO PLAN</span>
                <strong>$12 / month</strong>
                <p>Unlimited chapters, more media slots, selected-reader controls, and extended archive privacy.</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function EditProfilePage() {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCircle, setInviteCircle] = useState<"family" | "friend">("family");
  const [inviteStory, setInviteStory] = useState(profileStories[0]?.title ?? "");
  const [contributorInvites, setContributorInvites] = useState([
    {
      email: "auntie.grace@example.com",
      circle: "family",
      story: "From borrowed rooms to my own front door",
      status: "Pending"
    },
    {
      email: "nora.friend@example.com",
      circle: "friend",
      story: "Need advice on forgiving a parent",
      status: "Accepted"
    }
  ]);

  const handleInviteContributor = () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail) {
      return;
    }

    setContributorInvites((current) => [
      {
        email: trimmedEmail,
        circle: inviteCircle,
        story: inviteStory,
        status: "Pending"
      },
      ...current
    ]);
    setInviteEmail("");
    setInviteCircle("family");
    setInviteStory(profileStories[0]?.title ?? inviteStory);
  };

  const handleRemoveInvite = (email: string) => {
    setContributorInvites((current) => current.filter((invite) => invite.email !== email));
  };

  return (
    <main className="page-shell">
      <div className="profile-edit-back">
        <NavLink className="ghost-action" to="/profile">
          <Icon className="button-icon" name="arrow" />
          BACK
        </NavLink>
      </div>

      <section className="profile-editor-stage card">
        <div className="profile-editor-stage-copy">
          <SectionLabel>IDENTITY_AND_ACCESS</SectionLabel>
          <h1>Update identity, privacy, invites, and archive defaults.</h1>
          <p>Use this page to manage what readers see, how stories open to others, and who can help you write by invitation.</p>
        </div>
        <div className="profile-editor-stage-notes">
          <div className="profile-editor-note">
            <strong>Public profile</strong>
            <span>Controls name, username, bio, and location shown to readers.</span>
          </div>
          <div className="profile-editor-note">
            <strong>Contributor invites</strong>
            <span>Invite family or friends by email and choose the exact story they can contribute to.</span>
          </div>
        </div>
      </section>

      <section className="profile-editor-shell">
        <article className="profile-panel card profile-editor-main">
          <div className="profile-panel-body">
            <div className="profile-section-copy profile-editor-copy">
              <SectionLabel>EDIT_PROFILE</SectionLabel>
              <h2>Identity and visibility</h2>
              <span>Update the public details, location, bio, and default archive visibility for new chapters.</span>
            </div>
            <div className="profile-form-grid">
              <label>
                Display name
                <input defaultValue="Kingsley Udoma" />
              </label>
              <label>
                Username
                <input defaultValue="@kingsleyarchive" />
              </label>
              <label>
                Bio
                <textarea defaultValue="Writing real-life chapters about home, movement, identity, healing, and hard-earned rebuilding." />
              </label>
              <label>
                Location
                <input defaultValue="Lagos, Nigeria" />
              </label>
              <label>
                Profile visibility
                <select defaultValue="public">
                  <option value="public">Public</option>
                  <option value="selected">Selected readers</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label>
                Default chapter visibility
                <select defaultValue="selected">
                  <option value="public">Public</option>
                  <option value="selected">Selected readers</option>
                  <option value="private">Private</option>
                  <option value="anonymous">Anonymous advice</option>
                </select>
              </label>
            </div>
          </div>
        </article>

        <div className="profile-editor-side">
          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>CONTRIBUTOR_INVITES</SectionLabel>
                <h2>Invite family or friends to contribute</h2>
                <span>Choose a story, send the invite by email, and manage who can contribute.</span>
              </div>
              <div className="profile-form-grid profile-invite-grid">
                <label>
                  Invite email
                  <input onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" value={inviteEmail} />
                </label>
                <label>
                  Invite type
                  <select onChange={(event) => setInviteCircle(event.target.value as "family" | "friend")} value={inviteCircle}>
                    <option value="family">Family</option>
                    <option value="friend">Friend</option>
                  </select>
                </label>
                <label>
                  Story to contribute to
                  <select onChange={(event) => setInviteStory(event.target.value)} value={inviteStory}>
                    {profileStories.map((story) => (
                      <option key={story.title} value={story.title}>
                        {story.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chapter-controls profile-editor-actions">
                <button className="primary-action" onClick={handleInviteContributor} type="button">
                  SEND INVITE
                  <Icon className="button-icon" name="arrow" />
                </button>
              </div>
              <div className="profile-settings-list">
                {contributorInvites.map((invite) => (
                  <div className="profile-setting-row" key={invite.email}>
                    <strong>{invite.email}</strong>
                    <span>
                      {invite.circle === "family" ? "Family" : "Friend"} // {invite.story}
                    </span>
                    <small>{invite.status}</small>
                    <button className="ghost-action slim-action" onClick={() => handleRemoveInvite(invite.email)} type="button">
                      REVOKE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>PROFILE_CONTROLS</SectionLabel>
                <h2>Profile controls</h2>
              </div>
              <div className="profile-toggle-stack">
                <label className="toggle-row">
                  <input defaultChecked type="checkbox" />
                  <span>Allow comments on published chapters</span>
                </label>
                <label className="toggle-row">
                  <input defaultChecked type="checkbox" />
                  <span>Let readers request to help through consent-fee flow</span>
                </label>
                <label className="toggle-row">
                  <input type="checkbox" />
                  <span>Hide read counts from public profile view</span>
                </label>
                <label className="toggle-row">
                  <input defaultChecked type="checkbox" />
                  <span>Show anonymous advice activity inside profile dashboard</span>
                </label>
              </div>
              <div className="chapter-controls">
                <button className="ghost-action" type="button">CANCEL</button>
                <button className="primary-action" type="button">
                  SAVE PROFILE
                  <Icon className="button-icon" name="arrow" />
                </button>
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabel>SECURITY_AND_ACCESS</SectionLabel>
                <h2>Security and access</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Email verification</strong>
                  <span>Verified // kingsley@example.com</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Password</strong>
                  <span>Last changed 14 days ago</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Active sessions</strong>
                  <span>MacBook Pro, iPhone Safari, Chrome desktop</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function FeedPage() {
  return (
    <main className="page-shell">
      <StoryCirclesRow />

      <section className="feed-layout">
        <div className="feed-column">
          {feedPreview.map((post) => (
            <article key={post.title} className="post-card card">
              <div className="post-top">
                <div className="post-author">
                  <span className="post-avatar">{post.author.slice(0, 1)}</span>
                  <div>
                    <strong>{post.author}</strong>
                    <span>{post.handle}</span>
                  </div>
                </div>
                <span className="story-tag">{post.visibility}</span>
              </div>
              <div className="image-frame">
                <img alt={post.title} className="post-image" src={feedStory} />
              </div>
              <div className="post-body">
                <div className="post-meta-row">
                  <span>{post.genre}</span>
                  <span>{post.chapterCount} chapters</span>
                  <span>{post.reads} reads</span>
                </div>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
                <div className="post-actions">
                  <span>
                    <Icon className="inline-icon" name="heart" />
                    Like
                  </span>
                  <span>
                    <Icon className="inline-icon" name="comment" />
                    {post.comments}
                  </span>
                  <span>
                    <Icon className="inline-icon" name="bookmark" />
                    {post.saves}
                  </span>
                  <span>
                    <Icon className="inline-icon" name="share" />
                    Share
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="right-rail">
          <article className="rail-panel card">
            <SectionLabel>STATUS_TYPES</SectionLabel>
            <div className="rail-stack">
              {readingShelves.map((shelf) => (
                <div key={shelf.title} className="rail-row">
                  <strong>{shelf.title}</strong>
                  <span>{shelf.meta}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="rail-panel card dark-card">
            <SectionLabel>TOP_READS</SectionLabel>
            <div className="rail-stack">
              {trendingStories.map((story) => (
                <div key={story.title} className="rail-row">
                  <strong>{story.title}</strong>
                  <span>{story.reads}</span>
                </div>
              ))}
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

function StudioPage() {
  const navigate = useNavigate();
  const normalizeChapterTitle = (title: string) => title.replace(/^Chapter\s+\d+:\s*/i, "").trim();
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentYear = new Date().getFullYear();
  const timelineYearOptions = Array.from({ length: currentYear - 1949 }, (_, index) => String(currentYear + 5 - index));
  const chapterCompletionThreshold = 80;
  const getDaysInMonth = (year: string, month: string) => {
    const safeYear = Number.parseInt(year, 10) || currentYear;
    const safeMonth = Number.parseInt(month, 10);
    if (!safeMonth) {
      return 31;
    }
    return new Date(safeYear, safeMonth, 0).getDate();
  };
  const getTimelineMonthLabel = (month: string) => {
    const monthIndex = Number.parseInt(month, 10);
    if (!monthIndex || monthIndex < 1 || monthIndex > 12) {
      return "Month";
    }
    return monthLabels[monthIndex - 1];
  };
  const getPlainTextFromHtml = (html: string) => {
    if (typeof document === "undefined") {
      return html.replace(/<[^>]+>/g, " ");
    }

    const parser = document.createElement("div");
    parser.innerHTML = html;
    return parser.textContent ?? "";
  };
  const getChapterWordCount = (html: string) => {
    const plainText = getPlainTextFromHtml(html).trim();
    return plainText.length === 0 ? 0 : plainText.split(/\s+/).length;
  };
  const isChapterComplete = (chapter: { title: string; body: string }) =>
    chapter.title.trim().length > 0 && getChapterWordCount(chapter.body) >= chapterCompletionThreshold;
  const transcriptionLanguages = [
    { label: "English (US)", value: "en-US" },
    { label: "English (UK)", value: "en-GB" },
    { label: "French", value: "fr-FR" },
    { label: "Spanish", value: "es-ES" },
    { label: "German", value: "de-DE" },
    { label: "Portuguese (Brazil)", value: "pt-BR" },
    { label: "Arabic", value: "ar-SA" },
    { label: "Yoruba", value: "yo-NG" },
    { label: "Igbo", value: "ig-NG" },
    { label: "Hausa", value: "ha-NG" }
  ];
  const supportedTranscriptionLanguageValues = new Set([
    "en-US",
    "en-GB",
    "fr-FR",
    "es-ES",
    "de-DE",
    "pt-BR",
    "ar-SA",
    "yo-NG",
    "ig-NG",
    "ha-NG"
  ]);
  const supportedTranscriptionLanguages = transcriptionLanguages.filter((language) =>
    supportedTranscriptionLanguageValues.has(language.value)
  );
  const initialChapterContent = {
    "Chapter 1: Before the city":
      "<p>I learned early that memory is rarely one clean scene. It is a room, then a sound, then a name I did not understand until years later.</p>",
    "Chapter 2: The year everything changed":
      "<p>I stopped trying to tell the story in one clean arc and started preserving the truth in fragments: one move, one loss, one new job, one proof that I was still here.</p>",
    "Advice post: Should I reconnect?":
      "<p>I do not know if reopening this relationship will heal anything or only restart a wound I barely closed.</p>"
  } as const;
  const [isEnteringStudio, setIsEnteringStudio] = useState(true);
  const [activeChapter, setActiveChapter] = useState(normalizeChapterTitle(chapterDrafts[1]?.title ?? "Chapter 2"));
  const [isPremium, setIsPremium] = useState(false);
  const [visibility, setVisibility] = useState("selected");
  const [anonymous, setAnonymous] = useState(true);
  const [storyTitle, setStoryTitle] = useState("From borrowed rooms to my own front door");
  const [storySummary, setStorySummary] = useState(
    "A chaptered life story about movement, rebuilding, and finally feeling at home in my own voice."
  );
  const [chapterType, setChapterType] = useState("milestone");
  const [allowComments, setAllowComments] = useState(true);
  const [chapters, setChapters] = useState(
    chapterDrafts.map((chapter) => ({
      ...chapter,
      title: normalizeChapterTitle(chapter.title),
      body: initialChapterContent[chapter.title as keyof typeof initialChapterContent] ?? ""
    }))
  );
  const [studioMessage, setStudioMessage] = useState("Studio synced locally.");
  const [hasReviewedPreview, setHasReviewedPreview] = useState(false);
  const [isDraftHistoryVisible, setIsDraftHistoryVisible] = useState(false);
  const [isEditingChapterTitle, setIsEditingChapterTitle] = useState(false);
  const [draftHistory, setDraftHistory] = useState<string[]>(["Studio opened."]);
  const [studioNotice, setStudioNotice] = useState<null | { title: string; body: string }>(null);
  const [timelineEntries, setTimelineEntries] = useState(
    timelineMoments.map((moment) => ({
      year: moment.year,
      month: "01",
      day: "01",
      title: moment.title,
      body: moment.body
    }))
  );
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    quote: false,
    checklist: false,
    timeline: false,
    comment: false
  });
  const [imageAttachments, setImageAttachments] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [voiceNotes, setVoiceNotes] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordingStatus, setVoiceRecordingStatus] = useState("Voice note idle");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("Voice transcription idle");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("en-US");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const chapterBodyRef = useRef<HTMLDivElement | null>(null);
  const chapterEditorSectionRef = useRef<HTMLElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imageAttachmentsRef = useRef<Array<{ name: string; url: string; source: string }>>([]);
  const voiceNotesRef = useRef<Array<{ name: string; url: string; source: string }>>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptionRecorderRef = useRef<MediaRecorder | null>(null);
  const transcriptionStreamRef = useRef<MediaStream | null>(null);
  const transcriptionQueueRef = useRef(Promise.resolve());
  const transcriptionPendingBlobRef = useRef<Blob | null>(null);
  const transcriptionRequestInFlightRef = useRef(false);
  const transcriptionSocketRef = useRef<WebSocket | null>(null);
  const transcriptionAudioContextRef = useRef<AudioContext | null>(null);
  const transcriptionProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptionSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const transcriptionManualStopRef = useRef(false);
  const transcriptionCommittedTurnsRef = useRef<Set<number>>(new Set());
  const transcriptionFallbackTriggeredRef = useRef(false);
  const noticeAudioContextRef = useRef<AudioContext | null>(null);
  const hasLoadedStudioDraftRef = useRef(false);

  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
  const studioStorageKey = "histora-studio-local-draft-v1";
  const imageLimit = isPremium ? 12 : 2;
  const voiceLimit = isPremium ? 6 : 1;
  const chapterLimit = isPremium ? 8 : 2;
  const activeChapterIndex = chapters.findIndex((chapter) => chapter.title === activeChapter);
  const activeChapterEntry = chapters[activeChapterIndex] ?? chapters[0];
  const activeChapterLabel = activeChapterEntry?.title ?? activeChapter;
  const chapterBody = activeChapterEntry?.body ?? "";
  const plainChapterText = getPlainTextFromHtml(chapterBody);
  const wordCount = getChapterWordCount(chapterBody);
  const chapterMetrics = chapters.map((chapter) => ({
    ...chapter,
    words: getChapterWordCount(chapter.body),
    isComplete: isChapterComplete(chapter)
  }));
  const readyChapters = chapterMetrics.filter((chapter) => chapter.isComplete);
  const startedIncompleteChapters = chapterMetrics.filter((chapter) => !chapter.isComplete && chapter.words > 0);
  const activeChapterReady = chapterMetrics[activeChapterIndex >= 0 ? activeChapterIndex : 0];
  const chapterSlots = Array.from({ length: 6 }).map((_, index) => {
    const existingChapter = chapters[index];
    const isLocked = index >= chapterLimit;

    return existingChapter
      ? { ...existingChapter, isLocked }
      : {
          title: "Premium chapter",
          status: "PREMIUM",
          type: "PREMIUM",
          words: 0,
          moments: 0,
          body: "",
          isLocked: true
        };
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setIsEnteringStudio(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem("histora-studio-reviewed") === "true") {
      setHasReviewedPreview(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(studioStorageKey);
      if (!rawDraft) {
        return;
      }

      const savedDraft = JSON.parse(rawDraft) as Partial<{
        activeChapter: string;
        isPremium: boolean;
        visibility: string;
        anonymous: boolean;
        storyTitle: string;
        storySummary: string;
        chapterType: string;
        chapters: typeof chapters;
        timelineEntries: typeof timelineEntries;
        draftHistory: string[];
        transcriptionLanguage: string;
        allowComments: boolean;
      }>;

      if (savedDraft.activeChapter) {
        setActiveChapter(savedDraft.activeChapter);
      }
      if (typeof savedDraft.isPremium === "boolean") {
        setIsPremium(savedDraft.isPremium);
      }
      if (savedDraft.visibility) {
        setVisibility(savedDraft.visibility);
      }
      if (typeof savedDraft.anonymous === "boolean") {
        setAnonymous(savedDraft.anonymous);
      }
      if (savedDraft.storyTitle) {
        setStoryTitle(savedDraft.storyTitle);
      }
      if (savedDraft.storySummary) {
        setStorySummary(savedDraft.storySummary);
      }
      if (savedDraft.chapterType) {
        setChapterType(savedDraft.chapterType);
      }
      if (typeof savedDraft.allowComments === "boolean") {
        setAllowComments(savedDraft.allowComments);
      }
      if (Array.isArray(savedDraft.chapters) && savedDraft.chapters.length > 0) {
        setChapters(savedDraft.chapters);
      }
      if (Array.isArray(savedDraft.timelineEntries)) {
        setTimelineEntries(savedDraft.timelineEntries);
      }
      if (Array.isArray(savedDraft.draftHistory) && savedDraft.draftHistory.length > 0) {
        setDraftHistory(savedDraft.draftHistory);
      }
      if (savedDraft.transcriptionLanguage) {
        setTranscriptionLanguage(savedDraft.transcriptionLanguage);
      }

      setStudioMessage("Local studio draft restored.");
    } catch {
      setStudioMessage("Could not restore the last local studio draft.");
    } finally {
      hasLoadedStudioDraftRef.current = true;
    }
  }, [studioStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedStudioDraftRef.current) {
      return;
    }

    const draftPayload = {
      activeChapter,
      isPremium,
      visibility,
      anonymous,
      storyTitle,
      storySummary,
      chapterType,
      allowComments,
      chapters,
      timelineEntries,
      draftHistory,
      transcriptionLanguage
    };

    window.localStorage.setItem(studioStorageKey, JSON.stringify(draftPayload));
  }, [
    activeChapter,
    anonymous,
    chapterType,
    allowComments,
    chapters,
    draftHistory,
    isPremium,
    storySummary,
    storyTitle,
    timelineEntries,
    transcriptionLanguage,
    visibility,
    studioStorageKey
  ]);

  useEffect(() => {
    imageAttachmentsRef.current = imageAttachments;
  }, [imageAttachments]);

  useEffect(() => {
    voiceNotesRef.current = voiceNotes;
  }, [voiceNotes]);

  useEffect(() => {
    const editor = chapterBodyRef.current;
    if (editor && editor.innerHTML !== chapterBody) {
      editor.innerHTML = chapterBody;
    }
  }, [chapterBody, activeChapter]);

  useEffect(() => {
    return () => {
      imageAttachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.url));
      voiceNotesRef.current.forEach((voice) => URL.revokeObjectURL(voice.url));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      transcriptionRecorderRef.current?.stop();
      transcriptionStreamRef.current?.getTracks().forEach((track) => track.stop());
      transcriptionProcessorRef.current?.disconnect();
      transcriptionSourceNodeRef.current?.disconnect();
      transcriptionSocketRef.current?.close();
      const audioContext = transcriptionAudioContextRef.current;
      if (audioContext) {
        void audioContext.close().catch(() => undefined);
      }
      const noticeAudioContext = noticeAudioContextRef.current;
      if (noticeAudioContext) {
        void noticeAudioContext.close().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!studioNotice || typeof window === "undefined") {
      return;
    }

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = noticeAudioContextRef.current ?? new AudioContextConstructor();
    noticeAudioContextRef.current = audioContext;

    void audioContext.resume().then(() => {
      const startAt = audioContext.currentTime;
      const playWarningPulse = (offset: number, frequency: number, duration: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const pulseStart = startAt + offset;

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, pulseStart);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.88, pulseStart + duration);

        gainNode.gain.setValueAtTime(0.0001, pulseStart);
        gainNode.gain.exponentialRampToValueAtTime(0.09, pulseStart + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, pulseStart + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(pulseStart);
        oscillator.stop(pulseStart + duration);

        oscillator.onended = () => {
          oscillator.disconnect();
          gainNode.disconnect();
        };
      };

      playWarningPulse(0, 720, 0.16);
      playWarningPulse(0.2, 620, 0.22);
    }).catch(() => undefined);
  }, [studioNotice]);

  const appendImages = (files: FileList | null, source: string) => {
    if (!files?.length) {
      return;
    }

    setMediaError(null);

    const remainingSlots = imageLimit - imageAttachments.length;

    if (remainingSlots <= 0) {
      setMediaError("Image attachment limit reached. Upgrade to premium for more slots.");
      return;
    }

    const nextImages = Array.from(files)
      .slice(0, remainingSlots)
      .map((file) => ({
        name: file.name || `${source} image`,
        url: URL.createObjectURL(file),
        source
      }));

    setImageAttachments((current) => [...current, ...nextImages]);

    if (files.length > remainingSlots) {
      setMediaError("Some images were skipped because the current plan limit was reached.");
    }
  };

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    appendImages(event.target.files, "Camera");
    event.target.value = "";
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    appendImages(event.target.files, "Upload");
    event.target.value = "";
  };

  const startVoiceRecording = async () => {
    if (voiceNotes.length >= voiceLimit) {
      setMediaError("Voice note limit reached. Upgrade to premium for more recordings.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMediaError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      setMediaError(null);
      setVoiceRecordingStatus("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      audioChunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);

        setVoiceNotes((current) => [
          ...current,
          {
            name: `Voice note ${current.length + 1}`,
            url,
            source: "Recorded in studio"
          }
        ]);

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecordingVoice(false);
        setVoiceRecordingStatus("Recording stopped. Voice note saved.");
      };

      recorder.start();
      setIsRecordingVoice(true);
      setVoiceRecordingStatus("Recording active...");
    } catch {
      setMediaError("Microphone permission was denied or unavailable.");
      setVoiceRecordingStatus("Voice recording unavailable");
    }
  };

  const stopVoiceRecording = () => {
    setVoiceRecordingStatus("Stopping recording...");
    mediaRecorderRef.current?.stop();
  };

  const removeImageAttachment = (url: string) => {
    setImageAttachments((current) => {
      const target = current.find((attachment) => attachment.url === url);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((attachment) => attachment.url !== url);
    });
  };

  const removeVoiceNote = (url: string) => {
    setVoiceNotes((current) => {
      const target = current.find((voice) => voice.url === url);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return current.filter((voice) => voice.url !== url);
    });
  };

  const updateChapter = (updater: (chapter: (typeof chapters)[number]) => (typeof chapters)[number]) => {
    setChapters((current) =>
      current.map((chapter, index) => (index === (activeChapterIndex >= 0 ? activeChapterIndex : 0) ? updater(chapter) : chapter))
    );
  };

  const updateActiveChapterTitle = (nextTitle: string) => {
    const normalizedTitle = normalizeChapterTitle(nextTitle) || "Untitled chapter";
    updateChapter((chapter) => ({
      ...chapter,
      title: normalizedTitle
    }));
    setActiveChapter(normalizedTitle);
    invalidatePreviewReview();
  };

  const submitActiveChapterTitle = () => {
    setIsEditingChapterTitle(false);
  };

  const refreshEditorState = () => {
    const selection = typeof window !== "undefined" ? window.getSelection() : null;
    const anchor = selection?.anchorNode?.parentElement ?? null;
    const insideEditor = anchor && chapterBodyRef.current?.contains(anchor);

    setActiveFormats({
      bold: typeof document !== "undefined" ? document.queryCommandState("bold") : false,
      italic: typeof document !== "undefined" ? document.queryCommandState("italic") : false,
      quote: insideEditor ? Boolean(anchor?.closest("blockquote")) : false,
      checklist: insideEditor ? Boolean(anchor?.closest("ul")) : false,
      timeline: insideEditor ? Boolean(anchor?.closest("[data-tool='timeline']")) : false,
      comment: insideEditor ? Boolean(anchor?.closest("[data-tool='comment']")) : false
    });
  };

  useEffect(() => {
    const onSelectionChange = () => refreshEditorState();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const syncEditorContent = () => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    const nextHtml = editor.innerHTML;
    const nextText = editor.textContent ?? "";
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
    updateChapter((chapter) => ({
      ...chapter,
      body: nextHtml,
      words: nextText.trim().length === 0 ? 0 : nextText.trim().split(/\s+/).length
    }));
    refreshEditorState();
  };

  const invalidatePreviewReview = () => {
    setHasReviewedPreview(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("histora-studio-reviewed");
    }
  };

  const commitTranscript = (text: string) => {
    const editor = chapterBodyRef.current;
    if (!editor || !text.trim()) {
      return;
    }

    const baseText = editor.textContent?.trim() ?? "";
    editor.appendChild(document.createTextNode(`${baseText.length > 0 ? " " : ""}${text}`));

    syncEditorContent();
  };

  const applyEditorTool = (tool: "bold" | "italic" | "quote" | "checklist" | "timeline" | "comment") => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    editor.focus();

    if (tool === "bold") {
      document.execCommand("bold");
    } else if (tool === "italic") {
      document.execCommand("italic");
    } else if (tool === "quote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else if (tool === "checklist") {
      document.execCommand("insertUnorderedList");
    } else {
      const selectedText = window.getSelection()?.toString() || (tool === "timeline" ? "2024 turning point" : "Comment for collaborators");
      document.execCommand("insertHTML", false, `<span data-tool="${tool}" class="${tool}-chip-inline">${selectedText}</span>&nbsp;`);
    }

    syncEditorContent();
    setStudioMessage(`${tool} applied in ${activeChapterLabel}.`);
    setDraftHistory((current) => [`${tool} tool used on ${activeChapterLabel}.`, ...current].slice(0, 6));
  };

  const transcribeAudioChunk = (audioBlob: Blob) => {
    transcriptionQueueRef.current = transcriptionQueueRef.current.then(async () => {
      if (audioBlob.size === 0) {
        return;
      }

      if (transcriptionRequestInFlightRef.current) {
        transcriptionPendingBlobRef.current = transcriptionPendingBlobRef.current
          ? new Blob([transcriptionPendingBlobRef.current, audioBlob], { type: audioBlob.type || "audio/webm" })
          : audioBlob;
        setTranscriptionStatus("Buffering recent speech...");
        return;
      }

      transcriptionRequestInFlightRef.current = true;
      setTranscriptionStatus("Transcribing recent speech...");

      try {
        const response = await fetch(
          `${apiBaseUrl}/transcriptions?language=${encodeURIComponent(transcriptionLanguage)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": audioBlob.type || "audio/webm"
            },
            body: audioBlob
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Transcription request failed.");
        }

        const payload = (await response.json()) as { text?: string };
        const transcript = payload.text?.trim();

        if (transcript) {
          commitTranscript(transcript);
          setStudioMessage("Voice transcription updated the chapter body.");
          setTranscriptionStatus(`Captured: ${transcript}`);
        } else {
          setTranscriptionStatus("No clear speech detected in the last audio chunk.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transcription request failed.";
        if (message.includes("429")) {
          setStudioMessage("Transcription is being rate limited. Slowing audio uploads and buffering speech.");
          setTranscriptionStatus("Transcription busy. Waiting for the next upload window...");
        } else {
          throw error;
        }
      } finally {
        transcriptionRequestInFlightRef.current = false;
        const pendingBlob = transcriptionPendingBlobRef.current;
        transcriptionPendingBlobRef.current = null;

        if (pendingBlob && pendingBlob.size > 0 && isTranscribing) {
          void transcribeAudioChunk(pendingBlob);
        }
      }
    }).catch(() => {
      transcriptionRequestInFlightRef.current = false;
      setIsTranscribing(false);
      setStudioMessage("Server transcription failed. Check API configuration and try again.");
      setTranscriptionStatus("Voice transcription failed");
    });
  };

  const cleanupStreamingTranscription = ({
    nextStatus = "Voice transcription stopped",
    notifyServer = false,
    markManual = true
  }: {
    nextStatus?: string;
    notifyServer?: boolean;
    markManual?: boolean;
  } = {}) => {
    transcriptionManualStopRef.current = markManual;
    const socket = transcriptionSocketRef.current;

    if (socket?.readyState === WebSocket.OPEN && notifyServer) {
      socket.send(JSON.stringify({ type: "Terminate" }));
    }

    transcriptionProcessorRef.current?.disconnect();
    transcriptionProcessorRef.current = null;
    transcriptionSourceNodeRef.current?.disconnect();
    transcriptionSourceNodeRef.current = null;
    transcriptionStreamRef.current?.getTracks().forEach((track) => track.stop());
    transcriptionStreamRef.current = null;
    transcriptionRecorderRef.current = null;
    transcriptionPendingBlobRef.current = null;
    transcriptionRequestInFlightRef.current = false;
    transcriptionCommittedTurnsRef.current.clear();

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
      transcriptionSocketRef.current = null;
    }

    if (transcriptionAudioContextRef.current) {
      const audioContext = transcriptionAudioContextRef.current;
      void audioContext.close().catch(() => undefined);
      transcriptionAudioContextRef.current = null;
    }

    setIsTranscribing(false);
    setTranscriptionStatus(nextStatus);
  };

  const stopStreamingTranscription = (nextStatus = "Voice transcription stopped") => {
    cleanupStreamingTranscription({ nextStatus, notifyServer: true, markManual: true });
  };

  const downsampleAudioBuffer = (input: Float32Array, sourceRate: number, targetRate: number) => {
    if (sourceRate === targetRate) {
      return input;
    }

    const sampleRateRatio = sourceRate / targetRate;
    const targetLength = Math.round(input.length / sampleRateRatio);
    const output = new Float32Array(targetLength);
    let outputIndex = 0;
    let inputIndex = 0;

    while (outputIndex < targetLength) {
      const nextInputIndex = Math.round((outputIndex + 1) * sampleRateRatio);
      let sum = 0;
      let count = 0;

      for (let index = inputIndex; index < nextInputIndex && index < input.length; index += 1) {
        sum += input[index] as number;
        count += 1;
      }

      output[outputIndex] = count > 0 ? sum / count : 0;
      outputIndex += 1;
      inputIndex = nextInputIndex;
    }

    return output;
  };

  const encodePcm16 = (input: Float32Array) => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);

    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index] ?? 0));
      view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return buffer;
  };

  const getAssemblyStreamingConfig = (language: string) => {
    if (language === "en-US" || language === "en-GB") {
      return {
        speechModel: "universal-streaming-english",
        languageDetection: false
      };
    }

    if (
      language === "fr-FR" ||
      language === "es-ES" ||
      language === "de-DE" ||
      language === "pt-BR" ||
      language === "ar-SA" ||
      language === "yo-NG" ||
      language === "ig-NG" ||
      language === "ha-NG"
    ) {
      return {
        speechModel: "universal-streaming-multilingual",
        languageDetection: true
      };
    }

    return null;
  };

  const getRelaySocketUrl = (language: string) => {
    const apiUrl = new URL(apiBaseUrl);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const relayUrl = new URL(`${protocol}//${apiUrl.host}/ws/transcription`);
    relayUrl.searchParams.set("language", language);
    return relayUrl;
  };

  const startChunkTranscription = () => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      transcriptionStreamRef.current = stream;
      transcriptionRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        void transcribeAudioChunk(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        transcriptionStreamRef.current = null;
        transcriptionRecorderRef.current = null;
        setIsTranscribing(false);
        setTranscriptionStatus("Voice transcription stopped");
      };

      recorder.start(7000);
      setIsTranscribing(true);
      const selectedLanguageLabel =
        transcriptionLanguages.find((language) => language.value === transcriptionLanguage)?.label ?? transcriptionLanguage;
      setStudioMessage(`Server transcription started in ${selectedLanguageLabel}. Speak to update the chapter body.`);
      setTranscriptionStatus(`Listening in ${selectedLanguageLabel}...`);
    }).catch(() => {
      setStudioMessage("Microphone permission was denied or unavailable.");
      setTranscriptionStatus("Voice transcription unavailable");
    });
  };

  const startRelayTranscription = (
    AudioContextConstructor: typeof AudioContext,
    mode: "mobile" | "desktop" = "mobile"
  ) => {
    setTranscriptionStatus("Preparing live transcription...");
    setStudioMessage(
      mode === "mobile" ? "Starting Histora mobile transcription relay..." : "Starting Histora transcription relay..."
    );
    transcriptionManualStopRef.current = false;
    transcriptionCommittedTurnsRef.current.clear();
    transcriptionFallbackTriggeredRef.current = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        const audioContext = new AudioContextConstructor();
        await audioContext.resume();

        const sourceNode = audioContext.createMediaStreamSource(stream);
        const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        const relaySocket = new WebSocket(getRelaySocketUrl(transcriptionLanguage));
        relaySocket.binaryType = "arraybuffer";

        transcriptionStreamRef.current = stream;
        transcriptionAudioContextRef.current = audioContext;
        transcriptionSourceNodeRef.current = sourceNode;
        transcriptionProcessorRef.current = processorNode;
        transcriptionSocketRef.current = relaySocket;

        processorNode.onaudioprocess = (event) => {
          if (relaySocket.readyState !== WebSocket.OPEN) {
            return;
          }

          const inputData = event.inputBuffer.getChannelData(0);
          const downsampled = downsampleAudioBuffer(inputData, audioContext.sampleRate, 16000);

          if (downsampled.length === 0) {
            return;
          }

          relaySocket.send(encodePcm16(downsampled));
        };

        relaySocket.onopen = () => {
          sourceNode.connect(processorNode);
          processorNode.connect(audioContext.destination);
          setIsTranscribing(true);
          const selectedLanguageLabel =
            transcriptionLanguages.find((language) => language.value === transcriptionLanguage)?.label ?? transcriptionLanguage;
          setStudioMessage(
            `${mode === "mobile" ? "Histora mobile relay" : "Histora relay"} transcription started in ${selectedLanguageLabel}.`
          );
          setTranscriptionStatus(`Listening live in ${selectedLanguageLabel}...`);
        };

        relaySocket.onmessage = (event) => {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            transcript?: string;
            end_of_turn?: boolean;
            turn_order?: number;
            error?: string;
            message?: string;
          };

          if (payload.type === "RelayReady") {
            setTranscriptionStatus("Mobile transcription relay connected");
            return;
          }

          if (payload.type === "Error") {
          cleanupStreamingTranscription({ nextStatus: "Voice transcription connection failed", markManual: false });
          setStudioMessage(payload.error || `The ${mode} transcription relay failed.`);
          return;
        }

          if (payload.type === "Begin") {
            setTranscriptionStatus("Live transcription connected");
            return;
          }

          if (payload.type === "Termination") {
            cleanupStreamingTranscription({ nextStatus: "Voice transcription ended", markManual: false });
            setStudioMessage(payload.message || "The transcription session ended.");
            return;
          }

          if (payload.type !== "Turn") {
            return;
          }

          const transcript = payload.transcript?.trim();

          if (!transcript) {
            return;
          }

          if (payload.end_of_turn && typeof payload.turn_order === "number") {
            if (!transcriptionCommittedTurnsRef.current.has(payload.turn_order)) {
              transcriptionCommittedTurnsRef.current.add(payload.turn_order);
              commitTranscript(transcript);
              setStudioMessage("Voice transcription updated the chapter body.");
            }

            setTranscriptionStatus(`Captured: ${transcript}`);
            return;
          }

          setTranscriptionStatus(`Hearing: ${transcript}`);
        };

        relaySocket.onerror = () => {
          if (transcriptionManualStopRef.current) {
            return;
          }

          cleanupStreamingTranscription({ nextStatus: "Voice transcription connection failed", markManual: false });
          setStudioMessage(`The ${mode} transcription relay connection failed.`);
        };

        relaySocket.onclose = (event) => {
          if (transcriptionManualStopRef.current) {
            transcriptionManualStopRef.current = false;
            setIsTranscribing(false);
            return;
          }

          cleanupStreamingTranscription({ nextStatus: "Voice transcription disconnected", markManual: false });
          setStudioMessage(`The ${mode} transcription relay disconnected (code ${event.code}).`);
        };
      } catch {
        if (typeof MediaRecorder === "undefined") {
          setStudioMessage("Voice transcription could not be started.");
          setTranscriptionStatus("Voice transcription unavailable");
          return;
        }

        setStudioMessage(`The ${mode} relay was unavailable. Falling back to chunk transcription.`);
        startChunkTranscription();
      }
    })();
  };

  const startVoiceTranscription = () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStudioMessage("Live transcription recording is not supported in this browser.");
      return;
    }

    const streamingConfig = getAssemblyStreamingConfig(transcriptionLanguage);
    const streamingSupported = Boolean(streamingConfig);
    const isMobileBrowser =
      /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent) ||
      (window.navigator.maxTouchPoints > 1 && /Macintosh/i.test(window.navigator.userAgent));
    transcriptionFallbackTriggeredRef.current = false;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (isMobileBrowser) {
      if (!AudioContextConstructor) {
        if (typeof MediaRecorder === "undefined") {
          setStudioMessage("Voice transcription is not supported in this browser.");
          return;
        }

        startChunkTranscription();
        return;
      }

      startRelayTranscription(AudioContextConstructor, "mobile");
      return;
    }

    if (!streamingSupported) {
      if (typeof MediaRecorder === "undefined") {
        setStudioMessage("Voice transcription is not supported in this browser.");
        return;
      }

      startChunkTranscription();
      return;
    }

    if (!AudioContextConstructor) {
      if (typeof MediaRecorder === "undefined") {
        setStudioMessage("Voice transcription is not supported in this browser.");
        return;
      }

      startChunkTranscription();
      return;
    }

    startRelayTranscription(AudioContextConstructor, "desktop");
  };

  const stopVoiceTranscription = () => {
    if (transcriptionSocketRef.current || transcriptionAudioContextRef.current) {
      stopStreamingTranscription();
      return;
    }

    transcriptionPendingBlobRef.current = null;
    transcriptionRecorderRef.current?.stop();
    setIsTranscribing(false);
    setTranscriptionStatus("Voice transcription stopped");
  };

  const openStudioNotice = (title: string, body: string) => {
    setStudioNotice({ title, body });
  };

  useEffect(() => {
    if (supportedTranscriptionLanguageValues.has(transcriptionLanguage)) {
      return;
    }

    const fallbackLanguage = supportedTranscriptionLanguages[0]?.value ?? "en-US";
    setTranscriptionLanguage(fallbackLanguage);
    setStudioMessage("Unsupported transcription language reset to a supported option.");
    openStudioNotice(
      "Transcription language unsupported",
      `The saved language "${transcriptionLanguage}" is not supported by the current voice transcription setup. Supported languages: ${supportedTranscriptionLanguages
        .map((language) => language.label)
        .join(", ")}.`
    );
  }, [supportedTranscriptionLanguages, transcriptionLanguage]);

  const guideToSection = (ref: RefObject<HTMLElement | null>, message: string) => {
    setStudioMessage(message);
    openStudioNotice("Action needed", message);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveCurrentDraft = () => {
    setChapters((current) =>
      current.map((chapter) =>
        chapter.title === activeChapter ? { ...chapter, status: "Draft saved", words: wordCount } : chapter
      )
    );
    setStudioMessage(`${activeChapterLabel} saved as draft.`);
    setDraftHistory((current) => [`${activeChapterLabel} saved as draft.`, ...current].slice(0, 6));
  };

  const publishWholeStory = () => {
    if (readyChapters.length === 0) {
      guideToSection(
        chapterEditorSectionRef,
        `Finish at least one chapter before publishing. Chapters need a title and at least ${chapterCompletionThreshold} words.`
      );
      return;
    }

    if (!hasReviewedPreview) {
      openStudioNotice(
        "Review before publish",
        startedIncompleteChapters.length > 0
          ? `After preview review, these chapters will go live: ${readyChapters.map((chapter) => chapter.title).join(", ")}. Unfinished chapters will stay as drafts: ${startedIncompleteChapters.map((chapter) => chapter.title).join(", ")}.`
          : `After preview review, these chapters will go live: ${readyChapters.map((chapter) => chapter.title).join(", ")}.`
      );
      handlePreviewToggle();
      return;
    }

    setChapters((current) =>
      current.map((chapter) =>
        readyChapters.some((readyChapter) => readyChapter.title === chapter.title)
          ? { ...chapter, status: "Published", words: getChapterWordCount(chapter.body) }
          : chapter
      )
    );
    setStudioMessage(
      startedIncompleteChapters.length > 0
        ? `Publishing ${readyChapters.map((chapter) => chapter.title).join(", ")}. Unfinished chapters stay in draft.`
        : `Publishing ${readyChapters.map((chapter) => chapter.title).join(", ")} as ${anonymous ? "anonymous" : visibility}.`
    );
    setDraftHistory((current) => [
      startedIncompleteChapters.length > 0
        ? `Published: ${readyChapters.map((chapter) => chapter.title).join(", ")}. Drafts kept: ${startedIncompleteChapters.map((chapter) => chapter.title).join(", ")}.`
        : `Story published with chapters: ${readyChapters.map((chapter) => chapter.title).join(", ")}.`,
      ...current
    ].slice(0, 6));
  };

  const updateTimelineEntry = (index: number, field: "title" | "body", value: string) => {
    setTimelineEntries((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, [field]: value } : entry))
    );
    invalidatePreviewReview();
  };

  const addTimelineEntry = () => {
    setTimelineEntries((current) => [
      ...current,
      {
        year: "",
        month: "",
        day: "",
        title: "",
        body: ""
      }
    ]);
    setStudioMessage("New timeline moment added.");
    setDraftHistory((current) => ["Timeline moment added.", ...current].slice(0, 6));
  };

  const removeTimelineEntry = (index: number) => {
    setTimelineEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
    setStudioMessage("Timeline moment removed.");
    setDraftHistory((current) => ["Timeline moment removed.", ...current].slice(0, 6));
    invalidatePreviewReview();
  };

  const updateTimelineDatePart = (index: number, field: "year" | "month" | "day", value: string) => {
    setTimelineEntries((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) {
          return entry;
        }

        const nextEntry = {
          ...entry,
          [field]: value
        };
        const maxDay = getDaysInMonth(nextEntry.year, nextEntry.month);

        if (nextEntry.day && Number.parseInt(nextEntry.day, 10) > maxDay) {
          nextEntry.day = String(maxDay).padStart(2, "0");
        }

        return nextEntry;
      })
    );
    invalidatePreviewReview();
  };

  const handlePreviewToggle = () => {
    const previewChapters = chapters
      .map((chapter) => ({
        title: chapter.title,
        status: chapter.status,
        words: getChapterWordCount(chapter.body),
        body: chapter.body
      }))
      .filter((chapter) => chapter.title.trim().length > 0 || chapter.body.trim().length > 0);
    const previewTimeline = timelineEntries.filter(
      (entry) => entry.title.trim().length > 0 || entry.body.trim().length > 0 || entry.year || entry.month || entry.day
    );
    const previewPayload = {
      storyTitle,
      storySummary,
      activeChapter: activeChapterLabel,
      chapterType,
      visibility: anonymous ? "anonymous" : visibility,
      chapterBody,
      wordCount,
      imageAttachments,
      voiceNotes,
      chapters: previewChapters,
      timelineEntries: previewTimeline,
      allowComments
    };

    window.sessionStorage.setItem("histora-studio-preview", JSON.stringify(previewPayload));
    window.sessionStorage.setItem("histora-studio-reviewed", "true");
    setHasReviewedPreview(true);
    setStudioMessage(`Preview opened for ${activeChapterLabel}. Review it before publishing.`);
    navigate("/studio/preview");
  };

  const handleChapterSwitch = (chapterTitle: string, isLocked: boolean) => {
    if (isLocked) {
      setStudioMessage("This chapter slot is premium. Subscribe to unlock more than 2 chapters.");
      setDraftHistory((current) => ["Premium chapter slot tapped.", ...current].slice(0, 6));
      return;
    }

    setActiveChapter(chapterTitle);
  };

  const insertStructureBlock = (kind: "opening" | "conflict" | "reflection" | "closing") => {
    const editor = chapterBodyRef.current;
    if (!editor) {
      return;
    }

    editor.focus();

    const blocks = {
      opening: "<h3>Opening moment</h3><p>Start with the scene, place, or feeling that opens this chapter.</p>",
      conflict: "<h3>Conflict or shift</h3><p>Describe what changed, broke, or forced the story forward.</p>",
      reflection: "<h3>Reflection</h3><p>Explain what this chapter means now that you can look back on it.</p>",
      closing: "<h3>Closing beat</h3><p>End with the lesson, question, or transition into the next chapter.</p>"
    } as const;

    document.execCommand("insertHTML", false, blocks[kind]);
    syncEditorContent();
    setStudioMessage(`${kind} structure inserted into ${activeChapterLabel}.`);
    setDraftHistory((current) => [`${kind} structure added to ${activeChapterLabel}.`, ...current].slice(0, 6));
  };

  const exitStudioMode = () => {
    saveCurrentDraft();
    setStudioMessage("Draft saved. Exiting studio mode...");
    window.setTimeout(() => navigate("/feed"), 180);
  };

  if (isEnteringStudio) {
    return (
      <main className="page-shell">
        <section className="studio-loader card">
          <span className="loader-orb" />
          <SectionLabel>STUDIO_BOOT</SectionLabel>
          <h1>Entering studio mode</h1>
          <p>Loading chapters, drafts, media tools, contributor access, and publishing controls.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="studio-header card">
        <div>
          <SectionLabel>WRITING_STUDIO</SectionLabel>
          <h1>DRAFT LIKE AN EDITOR. PUBLISH LIKE A PLATFORM.</h1>
          <p>Build chapters, attach images and voice notes, and control how every finished draft gets published.</p>
        </div>
        <div className="hero-actions">
          <button className="ghost-action" onClick={saveCurrentDraft} type="button">SAVE DRAFT</button>
          <button className="ghost-action" onClick={exitStudioMode} type="button">EXIT STUDIO</button>
        </div>
      </section>
      <section className="studio-status-bar card">
        <strong>{studioMessage}</strong>
        <span>{wordCount} words in active chapter</span>
      </section>
      {studioNotice ? (
        <section className="studio-notice card studio-notice-live" role="status">
          <span className="studio-notice-badge" aria-hidden="true">
            <Icon className="button-icon" name="bolt" />
          </span>
          <div className="studio-notice-copy">
            <span className="studio-notice-label">Action needed</span>
            <strong>{studioNotice.title}</strong>
            <p>{studioNotice.body}</p>
          </div>
          <button className="ghost-action" onClick={() => setStudioNotice(null)} type="button">DISMISS</button>
        </section>
      ) : null}

      <section className="studio-layout">
        <div className="studio-main">
          <article className="studio-panel card" ref={chapterEditorSectionRef}>
            <div className="section-head">
              <div>
                <SectionLabel>CHAPTER_SWITCHER</SectionLabel>
                <h2>Every chapter and draft stays visible</h2>
              </div>
              <span className="story-tag">{chapters.length} entries</span>
            </div>
            <div className="chapter-tab-row">
              {chapterSlots.map((chapter) => (
                <button
                  className={
                    chapter.isLocked
                      ? "chapter-pill chapter-pill-locked"
                      : activeChapter === chapter.title
                        ? "chapter-pill active-chapter-pill"
                        : "chapter-pill"
                  }
                  key={chapter.title}
                  onClick={() => handleChapterSwitch(chapter.title, chapter.isLocked)}
                  type="button"
                >
                  <strong>{chapter.title}</strong>
                  <span>{chapter.isLocked ? "PREMIUM" : chapters.find((entry) => entry.title === chapter.title)?.status ?? chapter.status}</span>
                </button>
              ))}
            </div>
            {!isPremium ? <span className="section-meta">Free users can write in the first 2 chapters only.</span> : null}
          </article>

          <article className="studio-panel card">
            <div className="section-head">
              <div>
                <SectionLabel>STORY_SETUP</SectionLabel>
                <h2>Story identity</h2>
              </div>
              <span className="story-tag">FREE_PLAN // 2500_WORDS</span>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input onChange={(event) => {
                  setStoryTitle(event.target.value);
                  invalidatePreviewReview();
                }} value={storyTitle} />
              </label>
              <label>
                Summary
                <textarea onChange={(event) => {
                  setStorySummary(event.target.value);
                  invalidatePreviewReview();
                }} value={storySummary} />
              </label>
            </div>
          </article>

          <article className="studio-panel card">
            <div className="section-head">
              <div className="chapter-heading-block">
                <SectionLabel>CURRENT_CHAPTER</SectionLabel>
                <div className="chapter-heading-row">
                  {isEditingChapterTitle ? (
                    <input
                      className="chapter-title-input"
                      onBlur={submitActiveChapterTitle}
                      onChange={(event) => updateActiveChapterTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          submitActiveChapterTitle();
                        }
                      }}
                      value={activeChapterLabel}
                    />
                  ) : (
                    <h2>{activeChapterLabel}</h2>
                  )}
                  <button
                    aria-label="Edit chapter title"
                    className="chapter-edit-button"
                    onClick={() => setIsEditingChapterTitle(true)}
                    type="button"
                  >
                    <Icon className="button-icon" name="write" />
                  </button>
                </div>
              </div>
              <span className="story-tag">{wordCount}_WORDS</span>
            </div>
            <div className="writing-toolbar">
              <button className={activeFormats.bold ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("bold")} type="button">Bold</button>
              <button className={activeFormats.italic ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("italic")} type="button">Italic</button>
              <button className={activeFormats.quote ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("quote")} type="button">Quote</button>
              <button className={activeFormats.checklist ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("checklist")} type="button">Checklist</button>
              <button className={activeFormats.timeline ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("timeline")} type="button">Timeline tag</button>
              <button className={activeFormats.comment ? "composer-chip active-composer-chip" : "composer-chip"} onClick={() => applyEditorTool("comment")} type="button">Comment note</button>
            </div>
            <div className="writing-structure-row">
              <button className="ghost-action" onClick={() => insertStructureBlock("opening")} type="button">Add opening</button>
              <button className="ghost-action" onClick={() => insertStructureBlock("conflict")} type="button">Add conflict</button>
              <button className="ghost-action" onClick={() => insertStructureBlock("reflection")} type="button">Add reflection</button>
              <button className="ghost-action" onClick={() => insertStructureBlock("closing")} type="button">Add closing</button>
            </div>
            <div className={isTranscribing ? "transcription-indicator transcription-live" : "transcription-indicator"}>
              <span className="transcription-dot" />
              <div className="transcription-signal" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="transcription-copy">
                <strong>{isTranscribing ? "Voice capture live" : "Voice capture idle"}</strong>
                <span>{isTranscribing ? "Amplifier blinking means speech is being captured." : "Ready when you want to begin."}</span>
                <small>{transcriptionStatus}</small>
              </div>
              <button
                className={isTranscribing ? "primary-action" : "ghost-action"}
                onClick={isTranscribing ? stopVoiceTranscription : startVoiceTranscription}
                type="button"
              >
                {isTranscribing ? "STOP TRANSCRIBING" : "START VOICE TO TEXT"}
              </button>
            </div>
            <div className="transcription-language-row">
              <label>
                Transcription language
                <select
                  onChange={(event) => setTranscriptionLanguage(event.target.value)}
                  value={transcriptionLanguage}
                >
                  {supportedTranscriptionLanguages.map((language) => (
                    <option key={language.value} value={language.value}>
                      {language.label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="transcription-supported-copy">
                Supported now: {supportedTranscriptionLanguages.map((language) => language.label).join(", ")}
              </span>
            </div>
            <div className="form-grid">
              <label>
                Chapter type
                <select onChange={(event) => {
                  setChapterType(event.target.value);
                  invalidatePreviewReview();
                }} value={chapterType}>
                  <option value="memory">Memory</option>
                  <option value="reflection">Reflection</option>
                  <option value="milestone">Milestone</option>
                  <option value="anonymous">Anonymous advice</option>
                </select>
              </label>
              <label>
                Body
                <div
                  className="editor-surface"
                  contentEditable
                  onInput={syncEditorContent}
                  ref={chapterBodyRef}
                  suppressContentEditableWarning
                />
              </label>
            </div>
            <div className="chapter-controls">
              <button className="ghost-action" onClick={handlePreviewToggle} type="button">PREVIEW CHAPTER</button>
              <button className="ghost-action" onClick={() => setIsDraftHistoryVisible((current) => !current)} type="button">
                {isDraftHistoryVisible ? "HIDE DRAFT HISTORY" : "VIEW DRAFT HISTORY"}
              </button>
              <button className="primary-action" onClick={saveCurrentDraft} type="button">SAVE CHAPTER</button>
            </div>
            {isDraftHistoryVisible ? (
              <div className="draft-history-panel">
                {draftHistory.map((entry) => (
                  <div className="draft-history-row" key={entry}>
                    <strong>{entry}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </article>

          <article className="studio-panel card">
            <div className="section-head">
              <div>
                <SectionLabel>MEDIA_ATTACHMENTS</SectionLabel>
                <h2>Images, camera, uploads, and voice notes</h2>
              </div>
              <span className="story-tag">{isPremium ? "PREMIUM_ACTIVE" : "FREE_LIMITS_ACTIVE"}</span>
            </div>
            <div className={isRecordingVoice ? "recording-indicator recording-live" : "recording-indicator"}>
              <span className="recording-dot" />
              <strong>{isRecordingVoice ? "Recording live" : "Recorder idle"}</strong>
              <span>{voiceRecordingStatus}</span>
            </div>
            <input
              accept="image/*"
              capture="environment"
              className="hidden-media-input"
              onChange={handleCameraChange}
              ref={cameraInputRef}
              type="file"
            />
            <input
              accept="image/*"
              className="hidden-media-input"
              multiple={isPremium}
              onChange={handleImageUpload}
              ref={imageInputRef}
              type="file"
            />
            <div className="media-action-row">
              <button className="ghost-action" onClick={() => cameraInputRef.current?.click()} type="button">OPEN CAMERA</button>
              <button className="ghost-action" onClick={() => imageInputRef.current?.click()} type="button">UPLOAD IMAGE</button>
              <button
                className={isRecordingVoice ? "primary-action" : "ghost-action"}
                onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                type="button"
              >
                {isRecordingVoice ? "STOP VOICE NOTE" : "ATTACH VOICE NOTE"}
              </button>
              <button className="ghost-action" onClick={() => setIsPremium((current) => !current)} type="button">
                {isPremium ? "SWITCH TO FREE VIEW" : "SIMULATE PREMIUM"}
              </button>
            </div>
            {mediaError ? <div className="media-error-banner">{mediaError}</div> : null}
            <div className="media-grid">
              {imageAttachments.map((attachment) => (
                <article className="media-card" key={attachment.url}>
                  <div className="media-preview-frame">
                    <img alt={attachment.name} className="media-preview-image" src={attachment.url} />
                  </div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.source}</span>
                  <div className="media-card-footer">
                    <small>Image attached</small>
                    <button className="composer-chip" onClick={() => removeImageAttachment(attachment.url)} type="button">Remove</button>
                  </div>
                </article>
              ))}
              {Array.from({ length: Math.max(imageLimit - imageAttachments.length, 0) }).map((_, index) => (
                <article className="media-card media-card-empty" key={`image-slot-${index}`}>
                  <strong>Image slot {imageAttachments.length + index + 1}</strong>
                  <span>{imageAttachments.length + index < imageLimit ? "Ready for image attachment" : "Locked"}</span>
                  <small>{isPremium ? "Available" : "Free plan image slot"}</small>
                </article>
              ))}
              {voiceNotes.map((voice) => (
                <article className="media-card" key={voice.url}>
                  <strong>{voice.name}</strong>
                  <span>{voice.source}</span>
                  <audio className="voice-player" controls src={voice.url} />
                  <div className="media-card-footer">
                    <small>Voice note attached</small>
                    <button className="composer-chip" onClick={() => removeVoiceNote(voice.url)} type="button">Remove</button>
                  </div>
                </article>
              ))}
              {Array.from({ length: Math.max(voiceLimit - voiceNotes.length, 0) }).map((_, index) => (
                <article className="media-card media-card-empty" key={`voice-slot-${index}`}>
                  <strong>Voice slot {voiceNotes.length + index + 1}</strong>
                  <span>{isRecordingVoice ? "Recording in progress..." : "Ready for voice note"}</span>
                  <small>{isPremium ? "Available" : "Free plan voice slot"}</small>
                </article>
              ))}
            </div>
            {!isPremium ? (
              <div className="premium-limit-banner">
                <strong>Free users can add 2 images and 1 voice note.</strong>
                <span>Upgrade to premium for multiple image attachments and expanded voice entries.</span>
              </div>
            ) : null}
          </article>

        </div>

        <aside className="right-rail">
          <article className="rail-panel card">
            <SectionLabel>PRIVACY_CONTROL</SectionLabel>
            <div className="choice-stack">
              {["private", "selected", "public"].map((option) => (
                <button
                  key={option}
                  className={visibility === option ? "choice-button active-choice" : "choice-button"}
                  onClick={() => setVisibility(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            <label className="toggle-row">
              <input checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} type="checkbox" />
              <span>Post this chapter anonymously for advice</span>
            </label>
            <label className="toggle-row">
              <input checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} type="checkbox" />
              <span>Allow comments on published chapters</span>
            </label>
          </article>
          <article className="rail-panel card">
            <SectionLabel>PUBLISH_CONTROL</SectionLabel>
            <div className="publish-stack">
              <div className="publish-row">
                <strong>Current mode</strong>
                <span>{anonymous ? "Anonymous advice" : visibility}</span>
              </div>
              <div className="publish-row">
                <strong>Active chapter</strong>
                <span>{activeChapterReady?.isComplete ? "Ready to publish" : `Needs ${chapterCompletionThreshold} words`}</span>
              </div>
              <div className="publish-row">
                <strong>Story readiness</strong>
                <span>{readyChapters.length > 0 ? "Ready chapters can go live" : "No finished chapters yet"}</span>
              </div>
            </div>
            <div className="publish-summary-block">
              <strong>Chapters going live</strong>
              {readyChapters.length ? (
                <div className="publish-chip-list">
                  {readyChapters.map((chapter) => (
                    <span className="publish-chip" key={chapter.title}>{chapter.title}</span>
                  ))}
                </div>
              ) : (
                <p>No finished chapters yet.</p>
              )}
            </div>
            {startedIncompleteChapters.length ? (
              <div className="publish-summary-block publish-warning-block">
                <strong>Stays in draft for now</strong>
                <div className="publish-chip-list">
                  {startedIncompleteChapters.map((chapter) => (
                    <span className="publish-chip publish-chip-warning" key={chapter.title}>{chapter.title}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="chapter-controls">
              <button className="ghost-action" onClick={saveCurrentDraft} type="button">SAVE AS DRAFT</button>
              <button className="primary-action" onClick={publishWholeStory} type="button">PUBLISH STORY</button>
            </div>
          </article>
        </aside>
      </section>

      <section className="timeline-stage">
        <article className="studio-panel card timeline-panel-full">
          <div className="section-head">
            <div>
              <SectionLabel>TIMELINE_MOMENTS</SectionLabel>
              <h2>Anchor the chapter to real time</h2>
            </div>
            <button className="ghost-action" onClick={addTimelineEntry} type="button">ADD MOMENT</button>
          </div>
          <div className="timeline-list">
            {timelineEntries.map((moment, index) => (
              <div key={`${moment.year}-${moment.month}-${moment.day}-${index}`} className="timeline-row timeline-editor-row">
                <label>
                  Date
                  <div className="timeline-date-grid">
                    <label className="timeline-date-field">
                      <span>Month</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.month ? " is-filled" : ""}`}>
                          {getTimelineMonthLabel(moment.month)}
                        </span>
                        <select
                          aria-label="Timeline month"
                          onChange={(event) => updateTimelineDatePart(index, "month", event.target.value)}
                          value={moment.month}
                        >
                          <option value="">Month</option>
                          {monthLabels.map((label, monthIndex) => (
                            <option key={label} value={String(monthIndex + 1).padStart(2, "0")}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="timeline-date-field">
                      <span>Day</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.day ? " is-filled" : ""}`}>
                          {moment.day ? String(Number.parseInt(moment.day, 10)) : "Day"}
                        </span>
                        <select
                          aria-label="Timeline day"
                          onChange={(event) => updateTimelineDatePart(index, "day", event.target.value)}
                          value={moment.day}
                        >
                          <option value="">Day</option>
                          {Array.from({ length: getDaysInMonth(moment.year, moment.month) }, (_, dayIndex) => (
                            <option key={dayIndex + 1} value={String(dayIndex + 1).padStart(2, "0")}>
                              {dayIndex + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    <label className="timeline-date-field">
                      <span>Year</span>
                      <div className="timeline-select-shell">
                        <span className={`timeline-select-value${moment.year ? " is-filled" : ""}`}>
                          {moment.year || "Year"}
                        </span>
                        <select
                          aria-label="Timeline year"
                          onChange={(event) => updateTimelineDatePart(index, "year", event.target.value)}
                          value={moment.year}
                        >
                          <option value="">Year</option>
                          {timelineYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>
                </label>
                <div className="timeline-editor-copy">
                  <label>
                    Title
                    <input
                      onChange={(event) => updateTimelineEntry(index, "title", event.target.value)}
                      placeholder="What happened?"
                      value={moment.title}
                    />
                  </label>
                  <label>
                    What happened
                    <textarea
                      onChange={(event) => updateTimelineEntry(index, "body", event.target.value)}
                      placeholder="Write what happened at this point in your story."
                      value={moment.body}
                    />
                  </label>
                  <div className="timeline-editor-actions">
                    <button className="composer-chip" onClick={() => removeTimelineEntry(index)} type="button">Remove moment</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function StudioPreviewPage() {
  const navigate = useNavigate();
  const [preview, setPreview] = useState<null | {
    storyTitle: string;
    storySummary: string;
    activeChapter: string;
    chapterType: string;
    visibility: string;
    chapterBody: string;
    wordCount: number;
    imageAttachments: Array<{ name: string; url: string; source: string }>;
    voiceNotes: Array<{ name: string; url: string; source: string }>;
    chapters: Array<{ title: string; status: string; words: number; body: string }>;
    timelineEntries: Array<{ year: string; month: string; day: string; title: string; body: string }>;
    allowComments: boolean;
  }>(null);

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
        <button className="primary-action" onClick={() => navigate("/studio")} type="button">Looks Good</button>
      </section>

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
          <span>{preview?.activeChapter ?? "No chapter selected"}</span>
          <span>{preview?.chapterType ?? "story"}</span>
          <span>{preview?.wordCount ?? 0} words</span>
          <span>{preview?.allowComments ? "Comments on" : "Comments off"}</span>
        </div>

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

        {preview?.chapters?.length ? (
          <section className="preview-chapter-stack">
            {preview.chapters.map((chapter) => (
              <section className="preview-chapter-block" key={chapter.title}>
                <div className="preview-chapter-heading">
                  <h2>{chapter.title || "Untitled chapter"}</h2>
                  <span className="story-tag">{chapter.words} words</span>
                </div>
                <div
                  className="preview-rich-text"
                  dangerouslySetInnerHTML={{
                    __html: chapter.body || "<p>This chapter has not been written yet.</p>"
                  }}
                />
              </section>
            ))}
          </section>
        ) : (
          <section className="preview-chapter-block">
            <h2>{preview?.activeChapter ?? "Story preview"}</h2>
            <div
              className="preview-rich-text"
              dangerouslySetInnerHTML={{
                __html: preview?.chapterBody ?? "<p>Open a preview from the studio to render the story reader view.</p>"
              }}
            />
          </section>
        )}
      </article>
    </main>
  );
}

function PricingPage() {
  return (
    <main className="page-shell">
      <section className="pricing-hero">
        <article className="pricing-panel card">
          <SectionLabel>SUBSCRIPTION_PLAN</SectionLabel>
          <h1>CHOOSE YOUR ARCHIVE CONTROL</h1>
          <p>Select the writing depth and media capacity you need to manage your personal history.</p>
          <div className="plan-stack">
            {pricingPlans.map((plan, index) => (
              <article className={index === 1 ? "plan-card plan-card-featured" : "plan-card"} key={plan.name}>
                <span className="story-tag">{plan.name.toUpperCase()}</span>
                <h2>{plan.price}</h2>
                <p>{plan.description}</p>
                <ul className="plan-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Icon className="inline-icon" name="check" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button className={index === 1 ? "primary-action block-action" : "ghost-action block-action"} type="button">
                  {index === 1 ? "UPGRADE NOW" : "CURRENT REALITY"}
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="pricing-panel card">
          <SectionLabel>SUBSCRIPTION_MANAGEMENT</SectionLabel>
          <h2>PRO PLAN</h2>
          <div className="management-metrics">
            <div className="metric-box">
              <strong>$12.00 / MONTH</strong>
              <span>ACTIVE</span>
            </div>
            <div className="metric-box">
              <strong>CHAPTERS: 14 / inf</strong>
              <span>ARCHIVE_VOLUME</span>
            </div>
            <div className="metric-box">
              <strong>STORAGE: 2.4GB / inf</strong>
              <span>DATA_CAPACITY</span>
            </div>
          </div>
          <button className="primary-action block-action" type="button">
            CHANGE_PLAN
            <Icon className="button-icon" name="arrow" />
          </button>
          <button className="ghost-action block-action" type="button">
            CANCEL_SUBSCRIPTION
          </button>
        </article>
      </section>
    </main>
  );
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsLoggedIn(window.localStorage.getItem("histora-auth") === "true");
  }, []);

  const handleAuthenticated = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("histora-auth", "true");
    }

    setIsLoggedIn(true);
  };

  return (
    <AppShell isLoggedIn={isLoggedIn}>
      <Routes>
        <Route element={isLoggedIn ? <HomePage /> : <OnboardingPage />} path="/" />
        <Route element={<FeedPage />} path="/feed" />
        <Route element={<ProfilePage />} path="/profile" />
        <Route element={<EditProfilePage />} path="/profile/edit" />
        <Route element={<StudioPreviewPage />} path="/studio/preview" />
        <Route element={<StudioPage />} path="/studio" />
        <Route element={<PricingPage />} path="/pricing" />
        <Route element={<AuthPage mode="signin" onAuthenticated={handleAuthenticated} />} path="/signin" />
        <Route element={<AuthPage mode="signup" onAuthenticated={handleAuthenticated} />} path="/signup" />
        <Route element={<AuthPage mode="forgot" onAuthenticated={handleAuthenticated} />} path="/forgot-password" />
        <Route element={<AuthPage mode="reset" onAuthenticated={handleAuthenticated} />} path="/reset-password" />
      </Routes>
    </AppShell>
  );
}
