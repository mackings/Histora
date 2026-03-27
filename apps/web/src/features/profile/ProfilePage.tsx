import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { type ApiStory, apiRequest, type ProfileDashboard } from "../../lib/api-client";
import { getErrorMessage } from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";
import type { ContributorInviteRecord } from "./types";

type ProfileRelationship = ProfileDashboard["followersList"][number];
type InviteCircle = "family" | "friend";
type ProfileWorkspace = ReturnType<typeof useProfileWorkspace>;

const getStoryAudienceLabel = (visibility: string) => {
  if (visibility === "private" || visibility === "PRIVATE") {
    return "Only you";
  }
  if (visibility === "selected" || visibility === "SELECTED") {
    return "Selected readers";
  }
  return "Public";
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "No recent update";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
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

const getRelationshipButtonLabel = (
  person: ProfileRelationship,
  activeTab: "followers" | "following",
  isBusy: boolean
) => {
  if (isBusy) {
    return "UPDATING...";
  }

  if (activeTab === "following") {
    return "FOLLOWING";
  }

  return person.followingBack ? "FOLLOWING" : "FOLLOW BACK";
};

function useProfileWorkspace(accessToken: string) {
  const [dashboard, setDashboard] = useState<ProfileDashboard | null>(null);
  const [savedStories, setSavedStories] = useState<ApiStory[]>([]);
  const [ownedStories, setOwnedStories] = useState<ApiStory[]>([]);
  const [collaborativeStories, setCollaborativeStories] = useState<ApiStory[]>([]);
  const [contributorInvites, setContributorInvites] = useState<ContributorInviteRecord[]>([]);
  const [followers, setFollowers] = useState<ProfileRelationship[]>([]);
  const [following, setFollowing] = useState<ProfileRelationship[]>([]);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [isRequestingVerification, setIsRequestingVerification] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [isCreatingCollaborationDraft, setIsCreatingCollaborationDraft] = useState(false);
  const [pendingRelationshipActions, setPendingRelationshipActions] = useState<Record<string, boolean>>({});
  const [pendingInviteActions, setPendingInviteActions] = useState<Record<string, boolean>>({});
  const [profileToast, setProfileToast] = useState("");

  const loadDashboard = async () => {
    const payload = await apiRequest<ProfileDashboard>("/profile/me", { accessToken });
    setDashboard(payload);
  };

  const loadSavedStories = async () => {
    const payload = await apiRequest<{ stories: ApiStory[] }>("/profile/saved", { accessToken });
    setSavedStories(payload.stories);
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
    const [storiesPayload, collaborativePayload, invitePayload] = await Promise.all([
      apiRequest<ApiStory[]>("/stories/mine", { accessToken }),
      apiRequest<ApiStory[]>("/stories/collaborative", { accessToken }),
      apiRequest<{ invites: ContributorInviteRecord[] }>("/profile/invites", { accessToken })
    ]);

    setOwnedStories(storiesPayload);
    setCollaborativeStories(collaborativePayload);
    setContributorInvites(invitePayload.invites);
  };

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      loadDashboard(),
      loadSavedStories(),
      loadRelationships(),
      loadCollaborationWorkspace()
    ]).catch(() => {
      if (!cancelled) {
        setDashboard(null);
      }
    });

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

  const createCollaborationDraft = async () => {
    if (isCreatingCollaborationDraft) {
      return null;
    }

    setIsCreatingCollaborationDraft(true);
    try {
      const story = await apiRequest<ApiStory>("/stories", {
        method: "POST",
        accessToken,
        body: buildCollaborationDraftPayload()
      });
      setOwnedStories((current) => [story, ...current.filter((entry) => entry.id !== story.id)]);
      setProfileToast("Collaboration draft created. It is now in your studio library and ready for invites.");
      return story;
    } catch (error) {
      setProfileToast(getErrorMessage(error, "Could not create a collaboration draft right now."));
      return null;
    } finally {
      setIsCreatingCollaborationDraft(false);
    }
  };

  const sendInvite = async (input: { email: string; circle: InviteCircle; storyId: string }) => {
    if (isSendingInvite) {
      return false;
    }

    setIsSendingInvite(true);
    try {
      const payload = await apiRequest<{ invite: ContributorInviteRecord }>("/profile/invites", {
        method: "POST",
        accessToken,
        body: input
      });
      setContributorInvites((current) => [payload.invite, ...current]);
      setProfileToast(
        payload.invite.deliveryState === "sent"
          ? `Collaboration invite sent to ${input.email}.`
          : `Invite saved for ${input.email}. The in-app collaboration request is live, but email delivery is not configured on this server.`
      );
      return true;
    } catch (error) {
      setProfileToast(getErrorMessage(error, "Could not send this collaboration invite."));
      return false;
    } finally {
      setIsSendingInvite(false);
    }
  };

  const revokeInvite = (inviteId: string) => {
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

  return {
    dashboard,
    savedStories,
    ownedStories,
    collaborativeStories,
    contributorInvites,
    followers,
    following,
    isLoadingRelationships,
    isRequestingVerification,
    isSendingInvite,
    isCreatingCollaborationDraft,
    pendingRelationshipActions,
    pendingInviteActions,
    profileToast,
    requestVerification,
    toggleRelationship,
    createCollaborationDraft,
    sendInvite,
    revokeInvite
  };
}

function ProfileToast({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="bottom-toast" role="status">
      {message}
    </div>
  );
}

function ProfileTopbar({
  title,
  detail,
  primaryTo,
  primaryLabel,
  secondaryTo = "/profile",
  secondaryLabel = "BACK TO PROFILE",
  IconComponent
}: {
  title: string;
  detail: string;
  primaryTo?: string;
  primaryLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
  IconComponent: FeedIconComponent;
}) {
  return (
    <section className="topbar card profile-utility-bar">
      <div className="topbar-copy profile-topbar-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <div className="topbar-actions profile-topbar-actions">
        <NavLink className="ghost-action" to={secondaryTo}>
          {secondaryLabel}
        </NavLink>
        {primaryTo && primaryLabel ? (
          <NavLink className="primary-action" to={primaryTo}>
            {primaryLabel}
            <IconComponent className="button-icon" name="arrow" />
          </NavLink>
        ) : null}
      </div>
    </section>
  );
}

function ProfileHero({
  workspace,
  IconComponent
}: {
  workspace: ProfileWorkspace;
  IconComponent: FeedIconComponent;
}) {
  const profileMetrics = workspace.dashboard?.metrics;
  const profileUser = workspace.dashboard?.user;

  return (
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
    </section>
  );
}

function ProfileRouteCards({
  workspace,
  SectionLabelComponent
}: {
  workspace: ProfileWorkspace;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const collaborativeOwnedStories = workspace.ownedStories.filter(
    (story) => Boolean(story.collaborators?.length) || Boolean(story.collaborative)
  );
  const collaborativeCount = new Set([
    ...collaborativeOwnedStories.map((story) => story.id),
    ...workspace.collaborativeStories.map((story) => story.id)
  ]).size;
  const cards = [
    {
      to: "/profile/network",
      label: "NETWORK",
      title: "Followers and following",
      count: workspace.dashboard?.metrics.followers ?? 0,
      detail: `${workspace.dashboard?.metrics.following ?? 0} following`
    },
    {
      to: "/profile/collaborations",
      label: "COLLABORATIONS",
      title: "Shared stories and invites",
      count: collaborativeCount,
      detail: `${workspace.contributorInvites.filter((invite) => invite.status.toLowerCase() === "pending").length} pending invites`
    },
    {
      to: "/profile/analytics",
      label: "ANALYTICS",
      title: "Story performance",
      count: workspace.dashboard?.stories.length ?? 0,
      detail: `${workspace.dashboard?.metrics.totalReads ?? 0} total reads`
    },
    {
      to: "/profile/activity",
      label: "ACTIVITY",
      title: "Archive updates",
      count: workspace.dashboard?.activity.length ?? 0,
      detail: "Followers, reactions, and account events"
    }
  ];

  return (
    <article className="profile-panel card">
      <div className="profile-panel-body">
        <div className="profile-section-copy">
          <SectionLabelComponent>NAVIGATE_PROFILE</SectionLabelComponent>
          <h2>Open the profile sections that matter right now</h2>
          <span>The main profile stays light on mobile. Heavy views live in their own pages.</span>
        </div>
        <div className="profile-route-grid">
          {cards.map((card) => (
            <NavLink className="profile-route-card" key={card.to} to={card.to}>
              <span className="story-tag">{card.label}</span>
              <strong>{card.title}</strong>
              <div className="profile-route-count">{card.count}</div>
              <small>{card.detail}</small>
            </NavLink>
          ))}
        </div>
      </div>
    </article>
  );
}

function ProfileVerificationPanel({
  workspace,
  SectionLabelComponent
}: {
  workspace: ProfileWorkspace;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const profileUser = workspace.dashboard?.user;

  return (
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
            disabled={workspace.isRequestingVerification || profileUser?.verificationStatus === "verified" || !profileUser?.emailVerified}
            onClick={workspace.requestVerification}
            type="button"
          >
            {profileUser?.verificationStatus === "verified"
              ? "BLUE TICK ACTIVE"
              : workspace.isRequestingVerification
                ? "REQUESTING..."
                : "REQUEST BLUE TICK"}
          </button>
        </div>
      </div>
    </article>
  );
}

function SavedStoriesPreview({
  workspace,
  SectionLabelComponent
}: {
  workspace: ProfileWorkspace;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const previewStories = workspace.savedStories.slice(0, 3);

  return (
    <article className="profile-panel card">
      <div className="profile-panel-body">
        <div className="profile-section-copy">
          <SectionLabelComponent>SAVED_ARCHIVE</SectionLabelComponent>
          <h2>Saved stories</h2>
          <span>Quick access to the stories you bookmarked for later reading.</span>
        </div>
        <div className="profile-story-list">
          {previewStories.length ? (
            previewStories.map((story) => (
              <div className="profile-story-card" key={story.id}>
                <div className="profile-story-head">
                  <div className="profile-story-copy">
                    <strong>{story.title}</strong>
                    <span>{story.summary}</span>
                  </div>
                  <span className="story-tag">{story.status === "published" ? "LIVE" : "DRAFT"}</span>
                </div>
                <div className="profile-story-metrics">
                  <span>{story.readCount} reads</span>
                  <span>{story.likesCount} likes</span>
                  <span>{story.commentsCount} comments</span>
                </div>
              </div>
            ))
          ) : (
            <div className="profile-story-card">
              <div className="profile-story-copy">
                <strong>No saved stories yet</strong>
                <span>Bookmark stories from the feed and they will appear here.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RelationshipList({
  relationships,
  activeTab,
  pendingRelationshipActions,
  toggleRelationship
}: {
  relationships: ProfileRelationship[];
  activeTab: "followers" | "following";
  pendingRelationshipActions: Record<string, boolean>;
  toggleRelationship: (username: string) => void;
}) {
  if (!relationships.length) {
    return (
      <div className="profile-network-empty">
        <strong>{activeTab === "followers" ? "No followers yet" : "Not following anyone yet"}</strong>
        <span>
          {activeTab === "followers"
            ? "When readers follow your archive, they will appear here."
            : "Follow writers from the feed to build your network."}
        </span>
      </div>
    );
  }

  return (
    <div className="profile-twitter-list">
      {relationships.map((person) => {
        const isBusy = pendingRelationshipActions[person.username];

        return (
          <article className="profile-twitter-card" key={`${activeTab}-${person.id}`}>
            <div className="profile-twitter-avatar-shell">
              {person.avatarUrl ? (
                <img alt={person.fullName} className="profile-avatar-large profile-avatar-image" src={person.avatarUrl} />
              ) : (
                <span className="profile-avatar-large">{person.fullName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="profile-twitter-copy">
              <div className="profile-twitter-head">
                <strong>
                  {person.fullName}
                  {person.verified ? <span className="verified-badge verified-badge-inline">Verified</span> : null}
                </strong>
                <span>@{person.username}</span>
              </div>
              <p>
                {activeTab === "followers"
                  ? `Followed you on ${formatDate(person.followedAt)}.`
                  : `You followed this archive on ${formatDate(person.followedAt)}.`}
              </p>
              <div className="profile-twitter-meta">
                {person.followingBack ? <small>Mutual follow</small> : null}
                <small>{activeTab === "followers" ? "Reader in your audience" : "Archive in your following list"}</small>
              </div>
            </div>
            <div className="profile-twitter-actions">
              <button
                className={person.followingBack || activeTab === "following" ? "ghost-action" : "primary-action"}
                disabled={isBusy}
                onClick={() => toggleRelationship(person.username)}
                type="button"
              >
                {getRelationshipButtonLabel(person, activeTab, isBusy)}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CollaborationStoryCard({
  story,
  navigate,
  isJoinedStory
}: {
  story: ApiStory;
  navigate: ReturnType<typeof useNavigate>;
  isJoinedStory: boolean;
}) {
  const editorsCount = 1 + (story.collaborators?.length ?? 0);

  return (
    <article className="profile-story-card profile-collaboration-story-card">
      <div className="profile-story-head">
        <div className="profile-story-copy">
          <strong>{story.title}</strong>
          <span>{story.summary}</span>
        </div>
        <span className="story-tag">{story.status === "published" ? "LIVE" : "DRAFT"}</span>
      </div>
      <div className="profile-story-metrics">
        <span>{editorsCount} editors</span>
        <span>{story.chapters.length} chapters</span>
        <span>{story.readCount} reads</span>
        <span>{story.commentsCount} comments</span>
        <span>{story.sharesCount} shares</span>
      </div>
      <div className="profile-collaboration-meta-grid">
        <small>{isJoinedStory ? "Shared with you" : "Owned by you"}</small>
        <small>{getStoryAudienceLabel(story.visibility)}</small>
        <small>
          {story.lastEditedByName ? `Last update by ${story.lastEditedByName}` : "No collaborator activity yet"}
        </small>
        <small>{story.lastEditedAt ? formatDate(story.lastEditedAt) : formatDate(story.updatedAt)}</small>
      </div>
      <div className="profile-action-row">
        <button
          className="primary-action"
          onClick={() => navigate(`/studio?storyId=${encodeURIComponent(story.id)}`)}
          type="button"
        >
          OPEN STUDIO
        </button>
        {story.status === "published" ? (
          <button
            className="ghost-action"
            onClick={() => navigate(`/feed/story/${encodeURIComponent(story.slug)}`)}
            type="button"
          >
            OPEN LIVE STORY
          </button>
        ) : null}
      </div>
    </article>
  );
}

function AccountControlsPanel({
  workspace,
  SectionLabelComponent
}: {
  workspace: ProfileWorkspace;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const profileUser = workspace.dashboard?.user;
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

  return (
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
  );
}

function ProfileBasePage({
  accessToken,
  IconComponent,
  SectionLabelComponent,
  title,
  detail,
  primaryTo,
  primaryLabel,
  secondaryTo,
  secondaryLabel,
  children
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
  title: string;
  detail: string;
  primaryTo?: string;
  primaryLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
  children: (workspace: ProfileWorkspace) => ReactNode;
}) {
  const workspace = useProfileWorkspace(accessToken);

  return (
    <>
      <main className="page-shell">
        <ProfileTopbar
          IconComponent={IconComponent}
          detail={detail}
          primaryLabel={primaryLabel}
          primaryTo={primaryTo}
          secondaryLabel={secondaryLabel}
          secondaryTo={secondaryTo}
          title={title}
        />
        {children(workspace)}
      </main>
      <ProfileToast message={workspace.profileToast} />
    </>
  );
}

export function ProfilePage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  return (
    <ProfileBasePage
      accessToken={accessToken}
      detail="Identity, archive reach, and quick entry points into profile sections."
      IconComponent={IconComponent}
      primaryLabel="EDIT PROFILE"
      primaryTo="/profile/edit"
      SectionLabelComponent={SectionLabelComponent}
      secondaryLabel="BACK TO FEED"
      secondaryTo="/feed"
      title="Profile archive"
    >
      {(workspace) => (
        <>
          <ProfileHero IconComponent={IconComponent} workspace={workspace} />

          <section className="profile-content-grid profile-home-grid">
            <div className="profile-primary-column">
              <ProfileRouteCards SectionLabelComponent={SectionLabelComponent} workspace={workspace} />
              <SavedStoriesPreview SectionLabelComponent={SectionLabelComponent} workspace={workspace} />
            </div>
            <div className="profile-secondary-column">
              <ProfileVerificationPanel SectionLabelComponent={SectionLabelComponent} workspace={workspace} />
              <AccountControlsPanel SectionLabelComponent={SectionLabelComponent} workspace={workspace} />
            </div>
          </section>
        </>
      )}
    </ProfileBasePage>
  );
}

export function ProfileNetworkPage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const [activeTab, setActiveTab] = useState<"followers" | "following">("followers");

  return (
    <ProfileBasePage
      accessToken={accessToken}
      detail="A denser follower graph with mobile-friendly cards and Twitter-style relationship actions."
      IconComponent={IconComponent}
      primaryLabel="EDIT PROFILE"
      primaryTo="/profile/edit"
      SectionLabelComponent={SectionLabelComponent}
      title="Network"
    >
      {(workspace) => {
        const activeRelationships = activeTab === "followers" ? workspace.followers : workspace.following;

        return (
          <section className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>FOLLOW_GRAPH</SectionLabelComponent>
                <h2>Followers and following in one focused view</h2>
                <span>Built for scanning fast on mobile without burying the action buttons.</span>
              </div>

              <div className="profile-network-tabs" role="tablist">
                <button
                  className={activeTab === "followers" ? "profile-network-tab active-tab" : "profile-network-tab"}
                  onClick={() => setActiveTab("followers")}
                  type="button"
                >
                  FOLLOWERS <span>{workspace.followers.length}</span>
                </button>
                <button
                  className={activeTab === "following" ? "profile-network-tab active-tab" : "profile-network-tab"}
                  onClick={() => setActiveTab("following")}
                  type="button"
                >
                  FOLLOWING <span>{workspace.following.length}</span>
                </button>
              </div>

              <RelationshipList
                activeTab={activeTab}
                pendingRelationshipActions={workspace.pendingRelationshipActions}
                relationships={activeRelationships}
                toggleRelationship={workspace.toggleRelationship}
              />

              {workspace.isLoadingRelationships ? <p className="status-feedback">Refreshing follow lists...</p> : null}
            </div>
          </section>
        );
      }}
    </ProfileBasePage>
  );
}

export function ProfileCollaborationsPage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  const navigate = useNavigate();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCircle, setInviteCircle] = useState<InviteCircle>("family");
  const [inviteStoryId, setInviteStoryId] = useState("");

  return (
    <ProfileBasePage
      accessToken={accessToken}
      detail="Collaborative stories, shared editors, invite management, and direct studio entry points."
      IconComponent={IconComponent}
      primaryLabel="OPEN STUDIO"
      primaryTo="/studio"
      SectionLabelComponent={SectionLabelComponent}
      title="Collaborations"
    >
      {(workspace) => {
        const collaborativeOwnedStories = workspace.ownedStories.filter(
          (story) => Boolean(story.collaborators?.length) || Boolean(story.collaborative)
        );
        const joinedStories = workspace.collaborativeStories.filter(
          (story) => !workspace.ownedStories.some((ownedStory) => ownedStory.id === story.id)
        );
        const allCollaborationStories = [...collaborativeOwnedStories, ...joinedStories];
        const pendingInvites = workspace.contributorInvites.filter(
          (invite) => invite.status.toLowerCase() === "pending"
        );
        const resolvedInviteStoryId = pickPreferredInviteStoryId(workspace.ownedStories, inviteStoryId);
        const selectedInviteStory = workspace.ownedStories.find((story) => story.id === resolvedInviteStoryId) ?? null;

        const openSelectedStoryInStudio = () => {
          if (!resolvedInviteStoryId) {
            return;
          }

          navigate(`/studio?storyId=${encodeURIComponent(resolvedInviteStoryId)}`);
        };

        const handleCreateDraftAndSelect = async () => {
          const story = await workspace.createCollaborationDraft();
          if (story) {
            setInviteStoryId(story.id);
          }
        };

        const handleInviteContributor = async () => {
          const trimmedEmail = inviteEmail.trim();
          if (!trimmedEmail || !resolvedInviteStoryId) {
            return;
          }

          const sent = await workspace.sendInvite({
            email: trimmedEmail,
            circle: inviteCircle,
            storyId: resolvedInviteStoryId
          });

          if (sent) {
            setInviteEmail("");
            setInviteCircle("family");
          }
        };

        return (
          <section className="profile-content-grid">
            <div className="profile-primary-column">
              <article className="profile-panel card">
                <div className="profile-panel-body">
                  <div className="profile-section-copy">
                    <SectionLabelComponent>COLLAB_OVERVIEW</SectionLabelComponent>
                    <h2>Count, open, and manage your collaborations</h2>
                    <span>Each collaboration card shows the editor count, studio activity, and story reach at a glance.</span>
                  </div>
                  <div className="profile-route-grid profile-collaboration-stats">
                    <div className="profile-route-card static-card">
                      <span className="story-tag">ACTIVE</span>
                      <strong>Collaboration stories</strong>
                      <div className="profile-route-count">{allCollaborationStories.length}</div>
                      <small>Owned and joined stories combined</small>
                    </div>
                    <div className="profile-route-card static-card">
                      <span className="story-tag">INVITES</span>
                      <strong>Pending invites</strong>
                      <div className="profile-route-count">{pendingInvites.length}</div>
                      <small>Outstanding collaboration requests</small>
                    </div>
                    <div className="profile-route-card static-card">
                      <span className="story-tag">EDITORS</span>
                      <strong>Total collaborator seats</strong>
                      <div className="profile-route-count">
                        {allCollaborationStories.reduce((total, story) => total + 1 + (story.collaborators?.length ?? 0), 0)}
                      </div>
                      <small>Writers currently attached to shared stories</small>
                    </div>
                  </div>
                </div>
              </article>

              <article className="profile-panel card">
                <div className="profile-panel-body">
                  <div className="profile-section-copy">
                    <SectionLabelComponent>STORY_COLLABORATION</SectionLabelComponent>
                    <h2>Create a draft, invite someone, then open the right studio</h2>
                    <span>Start here when you want a new shared writing space.</span>
                  </div>
                  <div className="profile-form-grid profile-invite-grid">
                    <label>
                      Invite email
                      <input onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" value={inviteEmail} />
                    </label>
                    <label>
                      Invite type
                      <select onChange={(event) => setInviteCircle(event.target.value as InviteCircle)} value={inviteCircle}>
                        <option value="family">Family</option>
                        <option value="friend">Friend</option>
                      </select>
                    </label>
                    <label>
                      Story to collaborate on
                      <select onChange={(event) => setInviteStoryId(event.target.value)} value={resolvedInviteStoryId}>
                        {workspace.ownedStories.length ? (
                          workspace.ownedStories.map((story) => (
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
                    <button
                      className="ghost-action"
                      disabled={workspace.isCreatingCollaborationDraft}
                      onClick={() => void handleCreateDraftAndSelect()}
                      type="button"
                    >
                      {workspace.isCreatingCollaborationDraft ? "CREATING..." : "CREATE COLLAB DRAFT"}
                    </button>
                    <button className="ghost-action" disabled={!resolvedInviteStoryId} onClick={openSelectedStoryInStudio} type="button">
                      OPEN SELECTED STORY
                    </button>
                    <button
                      className="primary-action"
                      disabled={workspace.isSendingInvite || !inviteEmail.trim() || !resolvedInviteStoryId}
                      onClick={() => void handleInviteContributor()}
                      type="button"
                    >
                      {workspace.isSendingInvite ? "SENDING..." : "SEND INVITE"}
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
                        <span>{selectedInviteStory.chapters.length} chapters</span>
                        <span>{1 + (selectedInviteStory.collaborators?.length ?? 0)} editors</span>
                        <span>{getStoryAudienceLabel(selectedInviteStory.visibility)}</span>
                      </div>
                      <small>
                        {selectedInviteStory.collaborators?.length
                          ? "This story already has multiple editors and will open in collaborative studio."
                          : "This story is ready for its first collaborator."}
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
                </div>
              </article>

              <article className="profile-panel card">
                <div className="profile-panel-body">
                  <div className="profile-section-copy">
                    <SectionLabelComponent>ACTIVE_STORIES</SectionLabelComponent>
                    <h2>Every collaboration story with analytics and activity</h2>
                  </div>
                  <div className="profile-story-list">
                    {allCollaborationStories.length ? (
                      allCollaborationStories.map((story) => (
                        <CollaborationStoryCard
                          isJoinedStory={joinedStories.some((joinedStory) => joinedStory.id === story.id)}
                          key={story.id}
                          navigate={navigate}
                          story={story}
                        />
                      ))
                    ) : (
                      <div className="profile-story-card">
                        <div className="profile-story-copy">
                          <strong>No active collaborations yet</strong>
                          <span>Create a draft or accept an invite to start collaborating on a story.</span>
                        </div>
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
                    <SectionLabelComponent>INVITE_ACTIVITY</SectionLabelComponent>
                    <h2>Collaboration invite activity</h2>
                  </div>
                  <div className="profile-settings-list">
                    {workspace.contributorInvites.length ? (
                      workspace.contributorInvites.map((invite) => (
                        <div className="profile-setting-row" key={invite.id}>
                          <strong>{invite.email}</strong>
                          <span>
                            {invite.circle === "family" ? "Family" : "Friend"} // {invite.story}
                          </span>
                          <small>{invite.status} // {formatDate(invite.createdAt)}</small>
                          <button
                            className="ghost-action slim-action"
                            disabled={workspace.pendingInviteActions[invite.id] || invite.status.toLowerCase() === "revoked"}
                            onClick={() => workspace.revokeInvite(invite.id)}
                            type="button"
                          >
                            {workspace.pendingInviteActions[invite.id]
                              ? "UPDATING..."
                              : invite.status.toLowerCase() === "revoked"
                                ? "REVOKED"
                                : "REVOKE"}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="profile-setting-row">
                        <strong>No collaboration invites yet</strong>
                        <span>Create a draft and send the first collaboration invite from this page.</span>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </div>
          </section>
        );
      }}
    </ProfileBasePage>
  );
}

export function ProfileAnalyticsPage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  return (
    <ProfileBasePage
      accessToken={accessToken}
      detail="A dedicated page for story reads, likes, shares, bookmarks, and chapter output."
      IconComponent={IconComponent}
      primaryLabel="OPEN STUDIO"
      primaryTo="/studio"
      SectionLabelComponent={SectionLabelComponent}
      title="Analytics"
    >
      {(workspace) => {
        const stories = workspace.dashboard?.stories ?? [];
        const topStory = [...stories].sort((left, right) => right.readsCount - left.readsCount)[0] ?? null;

        return (
          <section className="profile-content-grid">
            <div className="profile-primary-column">
              <article className="profile-panel card">
                <div className="profile-panel-body">
                  <div className="profile-section-copy">
                    <SectionLabelComponent>TOP_PERFORMANCE</SectionLabelComponent>
                    <h2>Story analytics at reading depth</h2>
                    <span>Reads, reactions, bookmarks, shares, and comments live here instead of crowding the main profile.</span>
                  </div>
                  {topStory ? (
                    <div className="profile-story-card profile-analytics-highlight">
                      <div className="profile-story-head">
                        <div className="profile-story-copy">
                          <strong>{topStory.title}</strong>
                          <span>{topStory.chapters}</span>
                        </div>
                        <span className="story-tag">TOP STORY</span>
                      </div>
                      <div className="profile-story-metrics">
                        <span>{topStory.readsCount} reads</span>
                        <span>{topStory.likesCount} likes</span>
                        <span>{topStory.bookmarksCount} bookmarks</span>
                        <span>{topStory.sharesCount} shares</span>
                        <span>{topStory.commentsCount} comments</span>
                      </div>
                      <small>{topStory.status} // updated {formatDate(topStory.updatedAt)}</small>
                    </div>
                  ) : (
                    <div className="profile-story-card">
                      <div className="profile-story-copy">
                        <strong>No stories yet</strong>
                        <span>Your analytics will appear once your archive starts growing.</span>
                      </div>
                    </div>
                  )}
                </div>
              </article>

              <article className="profile-panel card">
                <div className="profile-panel-body">
                  <div className="profile-section-copy">
                    <SectionLabelComponent>STORY_ANALYTICS</SectionLabelComponent>
                    <h2>How each story is performing</h2>
                  </div>
                  <div className="profile-story-list">
                    {stories.length ? (
                      stories.map((story) => (
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
                          <small>{story.status} // updated {formatDate(story.updatedAt)}</small>
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
            </div>

            <div className="profile-secondary-column">
              <AccountControlsPanel SectionLabelComponent={SectionLabelComponent} workspace={workspace} />
            </div>
          </section>
        );
      }}
    </ProfileBasePage>
  );
}

export function ProfileActivityPage({
  accessToken,
  IconComponent,
  SectionLabelComponent
}: {
  accessToken: string;
  IconComponent: FeedIconComponent;
  SectionLabelComponent: FeedSectionLabelComponent;
}) {
  return (
    <ProfileBasePage
      accessToken={accessToken}
      detail="A cleaner activity timeline for archive events, reactions, and growth updates."
      IconComponent={IconComponent}
      primaryLabel="OPEN FEED"
      primaryTo="/feed"
      SectionLabelComponent={SectionLabelComponent}
      title="Activity"
    >
      {(workspace) => {
        const activity = workspace.dashboard?.activity ?? [];

        return (
          <section className="profile-panel card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>RECENT_ACTIVITY</SectionLabelComponent>
                <h2>Archive notifications and account movement</h2>
                <span>New followers, reactions, collaboration updates, and archive changes are grouped into one mobile-friendly timeline.</span>
              </div>
              <div className="profile-activity-list profile-activity-timeline">
                {activity.length ? (
                  activity.map((item) => (
                    <div className="profile-activity-row profile-activity-timeline-row" key={`${item.title}-${item.detail}`}>
                      <span className="profile-activity-dot" />
                      <div className="profile-activity-timeline-copy">
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                        <small>{item.time}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="profile-activity-row profile-activity-timeline-row">
                    <span className="profile-activity-dot" />
                    <div className="profile-activity-timeline-copy">
                      <strong>No recent activity</strong>
                      <span>New followers, reactions, and archive updates will appear here.</span>
                      <small>Live</small>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      }}
    </ProfileBasePage>
  );
}
