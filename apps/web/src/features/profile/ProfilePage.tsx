import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { type ApiStory, apiRequest, type ProfileDashboard } from "../../lib/api-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";

export function ProfilePage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);
  const [savedStories, setSavedStories] = useState<ApiStory[]>([]);

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ProfileDashboard>("/profile/me", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setDashboard(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboard(null);
        }
      });

    void apiRequest<{ stories: ApiStory[] }>("/profile/saved", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setSavedStories(payload.stories);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const profileStoriesData = dashboard?.stories ?? [];
  const profileActivityData = dashboard?.activity ?? [];
  const profileMetrics = dashboard?.metrics;
  const profileUser = dashboard?.user;
  const accountControls = [
    {
      title: "Profile visibility",
      detail:
        profileUser?.profileVisibility === "selected"
          ? "Only selected readers can view your profile."
          : profileUser?.profileVisibility === "private"
            ? "Your profile is private."
            : "Your profile is visible publicly."
    },
    {
      title: "Default chapter access",
      detail:
        profileUser?.defaultStoryVisibility === "anonymous"
          ? "New chapters default to anonymous advice visibility."
          : profileUser?.defaultStoryVisibility === "selected"
            ? "New chapters default to selected readers."
            : profileUser?.defaultStoryVisibility === "private"
              ? "New chapters default to private."
              : "New chapters default to public."
    },
    {
      title: "Comments",
      detail: profileUser?.allowCommentsByDefault ? "Comments are on by default." : "Comments are off by default."
    },
    {
      title: "Help requests",
      detail: profileUser?.allowHelpRequests ? "Readers can request to help." : "Reader help requests are disabled."
    }
  ];
  const planSummary = profileUser?.subscriptionTier === "premium" ? "Premium" : "Free";
  const planDescription =
    profileUser?.subscriptionTier === "premium"
      ? "Expanded media slots, more chapters, and wider archive controls are active on your account."
      : "You are on the free plan. Upgrade when you need more chapters, media slots, and archive controls.";

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
            <IconComponent className="button-icon" name="arrow" />
          </NavLink>
        </div>
      </section>

      <section className="profile-stage card">
        <div className="profile-stage-copy">
          <h1>{profileUser?.fullName ?? "Loading profile..."}</h1>
          <strong>{profileUser ? `@${profileUser.username}` : "@..."}</strong>
          <p>{profileUser?.bio || "Update your profile to describe your archive."}</p>
        </div>

        <div className="profile-header">
          {profileUser?.avatarUrl ? (
            <img alt={profileUser.fullName} className="profile-avatar-xl profile-avatar-image" src={profileUser.avatarUrl} />
          ) : (
            <span className="profile-avatar-xl">{(profileUser?.fullName ?? "H").slice(0, 1).toUpperCase()}</span>
          )}
          <div className="profile-header-copy">
            <div className="profile-header-meta">
              <span className="story-tag">{(profileUser?.profileVisibility ?? "public").toUpperCase()} PROFILE</span>
              <span className="story-tag">{(profileUser?.subscriptionTier ?? "free").toUpperCase()} PLAN</span>
            </div>
            <p>{profileUser?.location || "Add your location in profile settings."}</p>
          </div>
          <div className="profile-header-actions">
            <NavLink className="primary-action" to="/profile/edit">
              EDIT PROFILE
              <IconComponent className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/studio">
              OPEN STUDIO
            </NavLink>
          </div>
        </div>
      </section>

      <section className="profile-metric-strip">
        <article className="profile-stat-card">
          <span>Published stories</span>
          <strong>{profileMetrics?.publishedStories ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Total chapters</span>
          <strong>{profileMetrics?.totalChapters ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Total reads</span>
          <strong>{profileMetrics?.totalReads ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Anonymous posts</span>
          <strong>{profileMetrics?.anonymousPosts ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Followers</span>
          <strong>{profileMetrics?.followers ?? 0}</strong>
        </article>
      </section>

      <section className="profile-content-grid">
        <div className="profile-primary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>PUBLISHED_STORIES</SectionLabelComponent>
                <h2>Stories and chapter packs</h2>
              </div>
              <div className="profile-story-list">
                {profileStoriesData.length ? (
                  profileStoriesData.map((story) => (
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
                  ))
                ) : (
                  <div className="profile-story-card">
                    <div className="profile-story-copy">
                      <strong>No published stories yet</strong>
                      <span>Your published stories will appear here once they are live.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>RECENT_ACTIVITY</SectionLabelComponent>
                <h2>Archive notifications</h2>
              </div>
              <div className="profile-activity-list">
                {profileActivityData.length ? (
                  profileActivityData.map((item) => (
                    <div className="profile-activity-row" key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <small>{item.time}</small>
                    </div>
                  ))
                ) : (
                  <div className="profile-activity-row">
                    <strong>No recent activity</strong>
                    <span>Comments, reactions, and new archive updates will appear here.</span>
                    <small>Live</small>
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>

        <div className="profile-secondary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>ACCOUNT_CONTROLS</SectionLabelComponent>
                <h2>What you can manage</h2>
              </div>
              <div className="profile-settings-list">
                {accountControls.map((item) => (
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
                <SectionLabelComponent>ANON_AND_HELP</SectionLabelComponent>
                <h2>Anonymous posts and help requests</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Anonymous advice posts</strong>
                  <span>{profileMetrics?.anonymousPosts ?? 0} active anonymous messages tied to your account.</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Consent-fee requests</strong>
                  <span>{profileUser?.allowHelpRequests ? "Help requests are enabled on your account." : "Help requests are disabled on your account."}</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Comment defaults</strong>
                  <span>{profileUser?.allowCommentsByDefault ? "Comments are enabled by default for new stories." : "Comments are disabled by default for new stories."}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>SAVED_AND_PREMIUM</SectionLabelComponent>
                <h2>Saved reading and plan status</h2>
              </div>
              <div className="profile-story-list">
                {savedStories.length ? (
                  savedStories.map((story) => (
                    <div className="profile-story-card" key={story.id}>
                      <div className="profile-story-copy">
                        <strong>{story.title}</strong>
                        <span>{story.readCount} reads</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="profile-story-card">
                    <div className="profile-story-copy">
                      <strong>No saved stories yet</strong>
                      <span>Stories you bookmark will appear here.</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="profile-premium-card">
                <span className="story-tag">{planSummary.toUpperCase()} PLAN</span>
                <strong>{planSummary} account</strong>
                <p>{planDescription}</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
