import { Fragment, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import {
  type AuthSession,
  type ProfileDashboard,
  apiRequest,
  setLatestAccessToken
} from "./lib/api-client";
import { syncPushAlerts } from "./lib/browser-client";
import { AppShell } from "./app/AppShell";
import { RequireCurrentLocationSignInRedirect, RequireSignInRedirect } from "./app/RouteRedirects";
import { FeedPage } from "./features/feed/FeedPage";
import { FeedStoryPage } from "./features/feed/FeedStoryPage";
import { FeedRealtimeBridge } from "./features/feed/store";
import { EditProfilePage } from "./features/profile/EditProfilePage";
import { AuthPage } from "./features/auth/AuthPage";
import { ProfilePage } from "./features/profile/ProfilePage";
import { StudioPreviewPage } from "./features/studio/StudioPreviewPage";
import { StudioPage } from "./features/studio/StudioPage";
import { AnonymousHubPage } from "./features/anonymous/AnonymousHubPage";
import { AnonymousStoryPage } from "./features/anonymous/AnonymousStoryPage";
import { AnonymousStatusPage } from "./features/anonymous/AnonymousStatusPage";
import { AnonymousInboxComposePage } from "./features/anonymous/AnonymousInboxComposePage";
import { OnboardingPage } from "./features/marketing/OnboardingPage";
import { PricingPage } from "./features/pricing/PricingPage";

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
    | "close"
    | "person"
    | "download"
    | "trash"
    | "image"
    | "mic"
    | "pause"
    | "eye"
    | "eyeOff"
    | "bold"
    | "italic"
    | "quote"
    | "checklist"
    | "timeline"
    | "note";
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
    close: "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z",
    person: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.7 0-8.5 2.6-8.5 5.8 0 .7.6 1.2 1.2 1.2h14.6c.7 0 1.2-.5 1.2-1.2C20.5 16.6 16.7 14 12 14Z",
    download: "M11 4h2v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4 2.6 2.6V4Zm-6 14h14v2H5v-2Z",
    trash: "M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12a2 2 0 0 1-2-2V7h16v12a2 2 0 0 1-2 2H6Z",
    image: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm1 10 3-3 2 2 4-5 4 6H6Zm2.5-6A1.5 1.5 0 1 0 8.5 6a1.5 1.5 0 0 0 0 3Z",
    mic: "M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z",
    pause: "M7 5h3v14H7V5Zm7 0h3v14h-3V5Z",
    eye: "M12 6c5.1 0 9.3 3.3 10.8 6-1.5 2.7-5.7 6-10.8 6S2.7 14.7 1.2 12C2.7 9.3 6.9 6 12 6Zm0 2C8.1 8 4.8 10.3 3.4 12 4.8 13.7 8.1 16 12 16s7.2-2.3 8.6-4C19.2 10.3 15.9 8 12 8Zm0 1.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z",
    eyeOff:
      "m4.3 3 16.7 16.7-1.4 1.4-2.7-2.7A12.6 12.6 0 0 1 12 18c-5.1 0-9.3-3.3-10.8-6A14.7 14.7 0 0 1 6 7.2L2.9 4.1 4.3 3Zm3.2 5.9A8.9 8.9 0 0 0 3.4 12C4.8 13.7 8.1 16 12 16c1.2 0 2.2-.2 3.2-.6l-1.8-1.8a3.5 3.5 0 0 1-4.8-4.8L7.5 8.9Zm4.8-2.9c5.1 0 9.3 3.3 10.8 6a14 14 0 0 1-3.8 4.2l-1.4-1.4A10.2 10.2 0 0 0 20.6 12C19.2 10.3 15.9 8 12 8c-.3 0-.7 0-1 .1L9.4 6.5c.8-.3 1.7-.5 2.6-.5Z",
    bold: "M8 5h5.5a4 4 0 0 1 2.3 7.3A4.2 4.2 0 0 1 13.2 20H8V5Zm3 6h2.1a1.8 1.8 0 1 0 0-3.6H11V11Zm0 6.2h2.5a2 2 0 0 0 0-4H11v4Z",
    italic: "M10 5h9v2h-3.2l-3.6 10H15v2H6v-2h3.2l3.6-10H10V5Z",
    quote: "M7.5 9A2.5 2.5 0 0 1 10 11.5c0 2.6-2 4.7-4.5 4.9v-2A2.9 2.9 0 0 0 8 11.7H5.5V9h2Zm8 0A2.5 2.5 0 0 1 18 11.5c0 2.6-2 4.7-4.5 4.9v-2A2.9 2.9 0 0 0 16 11.7h-2.5V9h2Z",
    checklist: "M9 7 7.6 5.6 6.2 7 9 9.8 13.8 5 12.4 3.6 9 7Zm0 10-1.4-1.4-1.4 1.4L9 19.8l4.8-4.8-1.4-1.4L9 17Zm6-9h5v2h-5V8Zm0 8h5v2h-5v-2Z",
    timeline: "M7 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm10 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM6 7h2v10H6V7Zm10 0h2v10h-2V7ZM9 10h6v2H9v-2Z",
    note: "M6 4h12a2 2 0 0 1 2 2v10l-4 4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4v2h8V8H8Zm0 4v2h5v-2H8Z"
  } as const;

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <path d={paths[name]} fill="currentColor" />
    </svg>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const normalizedLabel = typeof children === "string" ? children.replaceAll("_", " ") : children;
  return <span className="section-label">{normalizedLabel}</span>;
}

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const session = await apiRequest<AuthSession>("/auth/refresh", { method: "POST" });
        if (!cancelled) {
          setAuthSession(session);
        }
      } catch {
        if (!cancelled) {
          setAuthSession(null);
        }
      } finally {
        if (!cancelled) {
          setIsAuthReady(true);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLatestAccessToken(authSession?.accessToken ?? null);
  }, [authSession?.accessToken]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncSession = (event: Event) => {
      const session = (event as CustomEvent<AuthSession>).detail;
      if (session?.accessToken) {
        setAuthSession(session);
      }
    };

    window.addEventListener("histora-auth-session", syncSession as EventListener);
    return () => window.removeEventListener("histora-auth-session", syncSession as EventListener);
  }, []);

  useEffect(() => {
    if (!authSession?.accessToken) {
      return;
    }

    void syncPushAlerts(authSession.accessToken, false).catch(() => undefined);
  }, [authSession?.accessToken]);

  const handleAuthenticated = (session: AuthSession) => {
    setAuthSession(session);
  };

  const isLoggedIn = Boolean(authSession?.accessToken && authSession.user);

  if (!isAuthReady) {
    return (
      <AppShell IconComponent={Icon} SectionLabelComponent={SectionLabel} isLoggedIn={false}>
        <main className="feed-reader-shell">
          <article className="story-reader-stage card">
            <SectionLabel>AUTH_LOADING</SectionLabel>
            <h1>Restoring your session...</h1>
          </article>
        </main>
      </AppShell>
    );
  }

  return (
    <Fragment>
      {authSession ? (
        <FeedRealtimeBridge accessToken={authSession.accessToken} currentUserId={authSession.user.id} />
      ) : null}
      <AppShell IconComponent={Icon} SectionLabelComponent={SectionLabel} isLoggedIn={isLoggedIn}>
        <Routes>
        <Route
          element={
            isLoggedIn && authSession ? (
              <FeedPage
                IconComponent={Icon}
                SectionLabelComponent={SectionLabel}
                accessToken={authSession.accessToken}
                currentUserId={authSession.user.id}
              />
            ) : (
              <OnboardingPage IconComponent={Icon} SectionLabelComponent={SectionLabel} />
            )
          }
          path="/"
        />
        <Route
          element={
            authSession ? (
              <FeedPage
                IconComponent={Icon}
                SectionLabelComponent={SectionLabel}
                accessToken={authSession.accessToken}
                currentUserId={authSession.user.id}
              />
            ) : (
              <OnboardingPage IconComponent={Icon} SectionLabelComponent={SectionLabel} />
            )
          }
          path="/feed"
        />
        <Route
          element={
            authSession ? (
              <FeedStoryPage
                IconComponent={Icon}
                SectionLabelComponent={SectionLabel}
                accessToken={authSession.accessToken}
                currentUserId={authSession.user.id}
              />
            ) : (
              <RequireCurrentLocationSignInRedirect />
            )
          }
          path="/feed/story/:storySlug"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? (
                <AnonymousHubPage
                  IconComponent={Icon}
                  SectionLabelComponent={SectionLabel}
                  accessToken={authSession.accessToken}
                  currentUser={authSession.user}
                />
              )
              : <RequireSignInRedirect redirectTo="/anonymous" />
          }
          path="/anonymous"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? (
                <AnonymousInboxComposePage
                  IconComponent={Icon}
                  SectionLabelComponent={SectionLabel}
                  accessToken={authSession.accessToken}
                />
              )
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/anonymous/write/:recipientSlug"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? (
                <AnonymousStatusPage
                  IconComponent={Icon}
                  SectionLabelComponent={SectionLabel}
                  accessToken={authSession.accessToken}
                />
              )
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/anonymous/status/:shareSlug"
        />
        <Route
          element={
            isLoggedIn && authSession
              ? (
                <AnonymousStoryPage
                  IconComponent={Icon}
                  SectionLabelComponent={SectionLabel}
                  accessToken={authSession.accessToken}
                />
              )
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/anonymous/:shareSlug"
        />
        <Route
          element={
            authSession ? (
              <ProfilePage
                IconComponent={Icon}
                SectionLabelComponent={SectionLabel}
                accessToken={authSession.accessToken}
              />
            ) : <RequireCurrentLocationSignInRedirect />
          }
          path="/profile"
        />
        <Route
          element={
            authSession ? (
              <EditProfilePage
                IconComponent={Icon}
                SectionLabelComponent={SectionLabel}
                accessToken={authSession.accessToken}
              />
            ) : <RequireCurrentLocationSignInRedirect />
          }
          path="/profile/edit"
        />
        <Route
          element={authSession ? <StudioPreviewPage accessToken={authSession.accessToken} /> : <RequireCurrentLocationSignInRedirect />}
          path="/studio/preview"
        />
        <Route
          element={
            authSession
              ? <StudioPage accessToken={authSession.accessToken} currentUser={authSession.user as ProfileDashboard["user"]} IconComponent={Icon} SectionLabelComponent={SectionLabel} />
              : <RequireCurrentLocationSignInRedirect />
          }
          path="/studio"
        />
        <Route element={<PricingPage IconComponent={Icon} SectionLabelComponent={SectionLabel} />} path="/pricing" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="signin" onAuthenticated={handleAuthenticated} />} path="/signin" />
        <Route element={<Navigate replace to="/signin" />} path="/login" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="signup" onAuthenticated={handleAuthenticated} />} path="/signup" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="forgot" onAuthenticated={handleAuthenticated} />} path="/forgot-password" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="reset" onAuthenticated={handleAuthenticated} />} path="/reset-password" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="verify" onAuthenticated={handleAuthenticated} />} path="/verify-email" />
        <Route element={<AuthPage IconComponent={Icon} SectionLabelComponent={SectionLabel} mode="device" onAuthenticated={handleAuthenticated} />} path="/verify-device" />
        </Routes>
      </AppShell>
    </Fragment>
  );
}
