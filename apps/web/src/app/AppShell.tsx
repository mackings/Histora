import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";

import type { FeedIconComponent, FeedSectionLabelComponent } from "../features/feed/ui-types";

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

export function AppShell({
  children,
  isLoggedIn,
  IconComponent,
  SectionLabelComponent
}: {
  children: React.ReactNode;
  isLoggedIn: boolean;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  useHomeIntroVoice();
  const location = useLocation();

  if (!isLoggedIn && location.pathname === "/") {
    return <div className="onboarding-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/studio")) {
    return <div className="studio-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/feed/story/")) {
    return <div className="feed-reader-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/anonymous")) {
    return <div className="feed-reader-focus-shell">{children}</div>;
  }

  if (location.pathname.startsWith("/profile")) {
    return <div className="profile-focus-shell">{children}</div>;
  }

  if (
    location.pathname === "/signin" ||
    location.pathname === "/signup" ||
    location.pathname === "/forgot-password" ||
    location.pathname === "/reset-password"
  ) {
    return <div className="auth-focus-shell">{children}</div>;
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
          <NavLink to="/feed">
            <IconComponent className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <IconComponent className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/anonymous">
            <IconComponent className="nav-icon" name="spark" />
            Anonymous
          </NavLink>
          <NavLink to="/profile">
            <IconComponent className="nav-icon" name="person" />
            Profile
          </NavLink>
          <NavLink to="/signin">
            <IconComponent className="nav-icon" name="signin" />
            Sign in
          </NavLink>
        </nav>

        <article className="rail-card card dark-card">
          <SectionLabelComponent>ARCHIVE_ACCESS</SectionLabelComponent>
          <h3>WRITE LIFE IN CHAPTERS.</h3>
          <p>Private stories, public storytelling, anonymous advice, and selected-reader drops inside one archive.</p>
          <NavLink className="primary-action" to="/signup">
            START WRITING
            <IconComponent className="button-icon" name="arrow" />
          </NavLink>
        </article>
      </aside>

      <div className="main-column">
        <header className="topbar card">
          <div className="topbar-copy">
            <SectionLabelComponent>LIVE_ARCHIVE_NETWORK</SectionLabelComponent>
            <strong>Social storytelling for real lives.</strong>
            <span>Build chapters, timeline drops, memory statuses, and controlled circles with a sharper editorial interface.</span>
          </div>
          <div className="topbar-actions">
            <NavLink className="ghost-action" to="/feed">
              EXPLORE
            </NavLink>
            <NavLink className="primary-action" to="/studio">
              NEW STORY
              <IconComponent className="button-icon" name="arrow" />
            </NavLink>
          </div>
        </header>

        {children}

        <nav className="mobile-dock card">
          <NavLink to="/feed">
            <IconComponent className="nav-icon" name="feed" />
            Feed
          </NavLink>
          <NavLink to="/studio">
            <IconComponent className="nav-icon" name="write" />
            Studio
          </NavLink>
          <NavLink to="/anonymous">
            <IconComponent className="nav-icon" name="spark" />
            Anonymous
          </NavLink>
          <NavLink to="/profile">
            <IconComponent className="nav-icon" name="person" />
            Profile
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
