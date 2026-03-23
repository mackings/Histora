import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { type ApiStory, apiRequest, type ProfileDashboard } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";
import type { ContributorInviteRecord } from "./types";

type ProfileRelationship = ProfileDashboard["followersList"][number];

const getStoryAudienceLabel = (visibility: string) => {
  if (visibility === "private" || visibility === "PRIVATE") {
    return "Only you";
  }
  if (visibility === "selected" || visibility === "SELECTED") {
    return "Selected readers";
  }
  return "Public";
};

const buildCollaborationDraftPayload = () => {
  const stamp = new Date().toLocaleDateString();

  return {
    title: `Collaboration draft ${stamp}`,
    summary:
      "This collaboration draft is ready for planning, chapter writing, timeline edits, and shared revisions before you publish the finished story for readers everywhere.",
    visibility: "private" as const,
    anonymous: false,
    allowedViewerIds: [],
    tags: [],
    links: [],
    status: "draft" as const,
    chapters: [
      {
        title: "Opening chapter",
        body:
          "<p>This starter chapter is here so you and your collaborator can begin safely. Rewrite the title, expand the summary, add timeline moments, and keep refining the story together before you publish it for readers.</p>",
        type: "memory" as const,
        order: 1,
        imageUrls: [],
        moments: []
      }
    ]
  };
};

const pickPreferredInviteStoryId = (stories: ApiStory[], currentStoryId: string) => {
  if (currentStoryId && stories.some((story) => story.id === currentStoryId)) {
    return currentStoryId;
  }

  return stories.find((story) => story.status === "draft")?.id ?? stories[0]?.id ?? "";
};

export function ProfilePage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);
  const [savedStories, setSavedStories] = useState<ApiStory[]>([]);
  const [ownedStories, setOwnedStories] = useState<ApiStory[]>([]);
  const [contributorInvites, setContributorInvites] = useState<ContributorInviteRecord[]>([]);
  const [followers, setFollowers] = useState<ProfileRelationship[]>([]);
  const [following, setFollowing] = useState<ProfileRelationship[]>([]);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [isRequestingVerification, setIsRequestingVerification] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [isCreatingCollaborationDraft, setIsCreatingCollaborationDraft] = useState(false);
  const [pendingRelationshipActions, setPendingRelationshipActions] = useState<Record<string, boolean>>({});
  const [pendingInviteActions, setPendingInviteActions] = useState<Record<string, boolean>>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCircle, setInviteCircle] = useState<"family" | "friend">("family");
  const [inviteStoryId, setInviteStoryId] = useState("");
  const [profileToast, setProfileToast] = useState("");

  const loadDashboard = async () => {
    const payload = await apiRequest<ProfileDashboard>("/profile/me", { accessToken });
    setDashboard(payload);
  };

  const loadRelationships = async () => {
    setIsLoadingRelationships(true);
    try {
      const [nextFollowers, nextFollowing] = await Promise.all([
        apiRequest<{ followers: ProfileRelationship[] }>("/profile/followers", { accessToken }),
        apiRequest<{ following: ProfileRelationship[] }>("/profile/following", { accessToken })
      ]);
      setFollowers(nextFollowers.followers);
      setFollowing(nextFollowing.following);
    } finally {
      setIsLoadingRelationships(false);
    }
  };

  const loadCollaborationWorkspace = async () => {
    const [storiesPayload, invitePayload] = await Promise.all([
      apiRequest<ApiStory[]>("/stories/mine", { accessToken }),
      apiRequest<{ invites: ContributorInviteRecord[] }>("/profile/invites", { accessToken })
    ]);

    setOwnedStories(storiesPayload);
    setContributorInvites(invitePayload.invites);
    setInviteStoryId((current) => pickPreferredInviteStoryId(storiesPayload, current));
  };

  useEffect(() => {
    let cancelled = false;

    void loadDashboard()
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

    void loadRelationships().catch(() => undefined);
    void loadCollaborationWorkspace().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!profileToast) {
      return;
    }

    const timer = window.setTimeout(() => setProfileToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [profileToast]);

  const requestVerification = () => {
    if (isRequestingVerification || !dashboard) {
      return;
    }

    setIsRequestingVerification(true);
    void apiRequest<{ verificationStatus: "verified"; verifiedAt: string | null }>("/profile/verification/request", {
      method: "POST",
      accessToken,
      body: {}
    })
      .then(async () => {
        await loadDashboard();
        setProfileToast("Blue tick activated on your account.");
      })
      .catch((error) => {
        setProfileToast(getErrorMessage(error, "Could not request verification right now."));
      })
      .finally(() => {
        setIsRequestingVerification(false);
      });
  };

  const toggleRelationship = (username: string) => {
    if (pendingRelationshipActions[username]) {
      return;
    }

    setPendingRelationshipActions((current) => ({ ...current, [username]: true }));
    void apiRequest<{ username: string; active: boolean }>(`/profile/follows/${username}/toggle`, {
      method: "POST",
      accessToken
    })
      .then(async (result) => {
        await Promise.all([loadDashboard(), loadRelationships()]);
        setProfileToast(result.active ? `You are now following @${result.username}.` : `You unfollowed @${result.username}.`);
      })
      .catch((error) => {
        setProfileToast(getErrorMessage(error, "Could not update this follow relationship."));
      })
      .finally(() => {
        setPendingRelationshipActions((current) => ({ ...current, [username]: false }));
      });
  };

  const createCollaborationDraft = () => {
    if (isCreatingCollaborationDraft) {
      return;
    }

    setIsCreatingCollaborationDraft(true);
    void apiRequest<ApiStory>("/stories", {
      method: "POST",
      accessToken,
      body: buildCollaborationDraftPayload()
    })
      .then((story) => {
        setOwnedStories((current) => [story, ...current.filter((entry) => entry.id !== story.id)]);
        setInviteStoryId(story.id);
        setProfileToast("Collaboration draft created. It is now in your studio library and ready for invites.");
      })
      .catch((error) => {
        setProfileToast(getErrorMessage(error, "Could not create a collaboration draft right now."));
      })
      .finally(() => {
        setIsCreatingCollaborationDraft(false);
      });
  };

  const handleInviteContributor = () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail || !inviteStoryId || isSendingInvite) {
      return;
    }

    setIsSendingInvite(true);
    void apiRequest<{ invite: ContributorInviteRecord }>("/profile/invites", {
      method: "POST",
      accessToken,
      body: {
        email: trimmedEmail,
        circle: inviteCircle,
        storyId: inviteStoryId
      }
    })
      .then((payload) => {
        setContributorInvites((current) => [payload.invite, ...current]);
        setInviteEmail("");
        setInviteCircle("family");
        setProfileToast(
          payload.invite.deliveryState === "sent"
            ? `Collaboration invite sent to ${trimmedEmail}.`
            : `Invite saved for ${trimmedEmail}. The in-app collaboration request is live, but email delivery is not configured on this server.`
        );
      })
      .catch((error) => {
        setProfileToast(getErrorMessage(error, "Could not send this collaboration invite."));
      })
      .finally(() => {
        setIsSendingInvite(false);
      });
  };

  const handleRemoveInvite = (inviteId: string) => {
    if (pendingInviteActions[inviteId]) {
      return;
    }

    setPendingInviteActions((current) => ({ ...current, [inviteId]: true }));
    void apiRequest<{ invite: ContributorInviteRecord }>(`/profile/invites/${inviteId}`, {
      method: "DELETE",
      accessToken
    })
      .then((payload) => {
        setContributorInvites((current) =>
          current.map((invite) => (invite.id === inviteId ? payload.invite : invite))
        );
        setProfileToast("Collaboration invite revoked.");
      })
      .catch((error) => {
        setProfileToast(getErrorMessage(error, "Could not revoke this collaboration invite."));
      })
      .finally(() => {
        setPendingInviteActions((current) => ({ ...current, [inviteId]: false }));
      });
  };

  const openSelectedStoryInStudio = () => {
    if (!inviteStoryId) {
      return;
    }

    navigate(`/studio?storyId=${encodeURIComponent(inviteStoryId)}`);
  };

  const profileStoriesData = dashboard?.stories ?? [];
  const profileActivityData = dashboard?.activity ?? [];
  const profileMetrics = dashboard?.metrics;
  const profileUser = dashboard?.user;
  const selectedInviteStory = useMemo(
    () => ownedStories.find((story) => story.id === inviteStoryId) ?? null,
    [ownedStories, inviteStoryId]
  );
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
          <span>Identity, archive reach, followers, and story analytics.</span>
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
          <h1>
            {profileUser?.fullName ?? "Loading profile..."}
            {profileUser?.verificationStatus === "verified" ? <span className="verified-badge">Verified</span> : null}
          </h1>
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
              {profileUser?.emailVerified ? <span className="story-tag">EMAIL VERIFIED</span> : <span className="story-tag">VERIFY EMAIL</span>}
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
          <span>Followers</span>
          <strong>{profileMetrics?.followers ?? 0}</strong>
        </article>
        <article className="profile-stat-card">
          <span>Following</span>
          <strong>{profileMetrics?.following ?? 0}</strong>
        </article>
      </section>

      <section className="profile-content-grid">
        <div className="profile-primary-column">
          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>VERIFICATION_AND_REACH</SectionLabelComponent>
                <h2>Blue tick and audience signals</h2>
              </div>
              <div className="profile-verification-card">
                <strong>
                  {profileUser?.verificationStatus === "verified"
                    ? "Your profile is verified."
                    : "Request an official Histora blue tick."}
                </strong>
                <p>
                  {profileUser?.verificationStatus === "verified"
                    ? "Your verified badge already shows across feed cards, story readers, and status surfaces."
                    : profileUser?.emailVerified
                      ? "Email verification is complete. Request the blue tick and it will show on your account immediately for now."
                      : "Verify your email first, then request a blue tick from here."}
                </p>
                <button
                  className={profileUser?.verificationStatus === "verified" ? "ghost-action" : "primary-action"}
                  disabled={isRequestingVerification || profileUser?.verificationStatus === "verified" || !profileUser?.emailVerified}
                  onClick={requestVerification}
                  type="button"
                >
                  {profileUser?.verificationStatus === "verified"
                    ? "BLUE TICK ACTIVE"
                    : isRequestingVerification
                      ? "REQUESTING..."
                      : "REQUEST BLUE TICK"}
                </button>
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>STORY_COLLABORATION</SectionLabelComponent>
                <h2>Create a draft, invite someone, then open the right studio</h2>
                <span>Start with a collaboration draft here. It will appear in studio immediately, and accepted stories will open in collaborative studio automatically.</span>
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
                  Story to collaborate on
                  <select onChange={(event) => setInviteStoryId(event.target.value)} value={inviteStoryId}>
                    {ownedStories.length ? (
                      ownedStories.map((story) => (
                        <option key={story.id} value={story.id}>
                          {story.title}
                        </option>
                      ))
                    ) : (
                      <option value="">Create a draft first</option>
                    )}
                  </select>
                </label>
              </div>
              <div className="profile-action-row">
                <button className="ghost-action" disabled={isCreatingCollaborationDraft} onClick={createCollaborationDraft} type="button">
                  {isCreatingCollaborationDraft ? "CREATING..." : "CREATE COLLAB DRAFT"}
                </button>
                <button className="ghost-action" disabled={!inviteStoryId} onClick={openSelectedStoryInStudio} type="button">
                  OPEN SELECTED STORY
                </button>
                <button
                  className="primary-action"
                  disabled={isSendingInvite || !inviteEmail.trim() || !inviteStoryId}
                  onClick={handleInviteContributor}
                  type="button"
                >
                  {isSendingInvite ? "SENDING..." : "SEND INVITE"}
                  <IconComponent className="button-icon" name="arrow" />
                </button>
              </div>
              {selectedInviteStory ? (
                <div className="profile-story-card profile-collaboration-preview">
                  <div className="profile-story-head">
                    <div className="profile-story-copy">
                      <strong>{selectedInviteStory.title}</strong>
                      <span>{selectedInviteStory.summary}</span>
                    </div>
                    <span className="story-tag">
                      {selectedInviteStory.collaborators?.length ? "COLLAB STORY" : selectedInviteStory.status === "published" ? "LIVE" : "DRAFT"}
                    </span>
                  </div>
                  <div className="profile-story-metrics">
                    <span>{selectedInviteStory.chapters.length} chapter{selectedInviteStory.chapters.length === 1 ? "" : "s"}</span>
                    <span>{selectedInviteStory.collaborators?.length ? `${selectedInviteStory.collaborators.length + 1} editors` : "Only you can edit for now"}</span>
                    <span>{getStoryAudienceLabel(selectedInviteStory.visibility)}</span>
                  </div>
                  <small>
                    {selectedInviteStory.collaborators?.length
                      ? "This story will open in collaborative studio because another editor is already attached."
                      : "This story will open in the normal writing studio until someone accepts your invite."}
                  </small>
                </div>
              ) : (
                <div className="profile-story-card">
                  <div className="profile-story-copy">
                    <strong>No collaboration draft selected</strong>
                    <span>Create a collaboration draft here first, then pick it and send the invite right away.</span>
                  </div>
                </div>
              )}
              <div className="profile-settings-list">
                {contributorInvites.length ? (
                  contributorInvites.map((invite) => (
                    <div className="profile-setting-row" key={invite.id}>
                      <strong>{invite.email}</strong>
                      <span>
                        {invite.circle === "family" ? "Family" : "Friend"} // {invite.story}
                      </span>
                      <small>{invite.status}</small>
                      <button
                        className="ghost-action slim-action"
                        disabled={pendingInviteActions[invite.id] || invite.status.toLowerCase() === "revoked"}
                        onClick={() => handleRemoveInvite(invite.id)}
                        type="button"
                      >
                        {pendingInviteActions[invite.id] ? "UPDATING..." : invite.status.toLowerCase() === "revoked" ? "REVOKED" : "REVOKE"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="profile-setting-row">
                    <strong>No collaboration invites yet</strong>
                    <span>Create a draft and send the first collaboration invite from this card.</span>
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>STORY_ANALYTICS</SectionLabelComponent>
                <h2>How each story is performing</h2>
              </div>
              <div className="profile-story-list">
                {profileStoriesData.length ? (
                  profileStoriesData.map((story) => (
                    <div className="profile-story-card" key={story.id}>
                      <div className="profile-story-head">
                        <div className="profile-story-copy">
                          <strong>{story.title}</strong>
                          <span>{story.chapters}</span>
                        </div>
                        <span className="story-tag">{getStoryAudienceLabel(story.visibility)}</span>
                      </div>
                      <div className="profile-story-metrics">
                        <span>{story.readsCount} reads</span>
                        <span>{story.likesCount} likes</span>
                        <span>{story.bookmarksCount} bookmarks</span>
                        <span>{story.sharesCount} shares</span>
                        <span>{story.commentsCount} comments</span>
                      </div>
                      <small>{story.status} // updated {new Date(story.updatedAt).toLocaleDateString()}</small>
                    </div>
                  ))
                ) : (
                  <div className="profile-story-card">
                    <div className="profile-story-copy">
                      <strong>No stories yet</strong>
                      <span>Your stories and analytics will appear here once your archive starts growing.</span>
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
                    <div className="profile-activity-row" key={`${item.title}-${item.detail}`}>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <small>{item.time}</small>
                    </div>
                  ))
                ) : (
                  <div className="profile-activity-row">
                    <strong>No recent activity</strong>
                    <span>New followers, reactions, and archive updates will appear here.</span>
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
                <SectionLabelComponent>FOLLOWERS</SectionLabelComponent>
                <h2>People following your archive</h2>
              </div>
              <div className="profile-people-list">
                {followers.length ? (
                  followers.map((person) => (
                    <div className="profile-person-row" key={`follower-${person.id}`}>
                      <div className="profile-person-copy">
                        <strong>
                          {person.fullName}
                          {person.verified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
                        </strong>
                        <span>@{person.username}</span>
                        <small>Followed {new Date(person.followedAt).toLocaleDateString()}</small>
                      </div>
                      <button
                        className={person.followingBack ? "ghost-action" : "primary-action"}
                        disabled={pendingRelationshipActions[person.username]}
                        onClick={() => toggleRelationship(person.username)}
                        type="button"
                      >
                        {pendingRelationshipActions[person.username]
                          ? "UPDATING..."
                          : person.followingBack
                            ? "FOLLOWING"
                            : "FOLLOW BACK"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="profile-person-row profile-person-empty">
                    <strong>No followers yet</strong>
                    <span>When people follow you, they will appear here.</span>
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>FOLLOWING</SectionLabelComponent>
                <h2>People you are following</h2>
              </div>
              <div className="profile-people-list">
                {following.length ? (
                  following.map((person) => (
                    <div className="profile-person-row" key={`following-${person.id}`}>
                      <div className="profile-person-copy">
                        <strong>
                          {person.fullName}
                          {person.verified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
                        </strong>
                        <span>@{person.username}</span>
                        <small>Following since {new Date(person.followedAt).toLocaleDateString()}</small>
                      </div>
                      <button
                        className="ghost-action"
                        disabled={pendingRelationshipActions[person.username]}
                        onClick={() => toggleRelationship(person.username)}
                        type="button"
                      >
                        {pendingRelationshipActions[person.username] ? "UPDATING..." : "UNFOLLOW"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="profile-person-row profile-person-empty">
                    <strong>You are not following anyone yet</strong>
                    <span>Follow writers from the feed to see them here and receive their archive updates.</span>
                  </div>
                )}
              </div>
              {isLoadingRelationships ? <p className="status-feedback">Refreshing follow lists...</p> : null}
            </div>
          </article>

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
                <div className="profile-setting-row">
                  <strong>Follower alerts</strong>
                  <span>Enable browser notifications on a trusted device to receive follow alerts when someone follows you.</span>
                </div>
              </div>
            </div>
          </article>

          <article className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>SAVED_AND_PLAN</SectionLabelComponent>
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

      {profileToast ? (
        <div className="bottom-toast" role="status">
          {profileToast}
        </div>
      ) : null}
    </main>
  );
}
