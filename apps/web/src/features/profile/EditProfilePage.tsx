import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import {
  type ApiStory,
  apiRequest,
  type ProfileDashboard,
  type ProfileSession,
  type ProfileTrustedDevice,
  type PushSyncResult,
  uploadMediaAsset
} from "../../lib/api-client";
import {
  disablePushAlerts,
  getErrorMessage,
  getStoredDeviceIdentity,
  supportsBrowserPush,
  syncPushAlerts
} from "../../lib/browser-client";
import { type FeedIconComponent, type FeedSectionLabelComponent } from "../feed/ui-types";
import type { ContributorInviteRecord } from "./types";

export function EditProfilePage({
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
  const [sessions, setSessions] = useState<ProfileSession[]>([]);
  const [devices, setDevices] = useState<ProfileTrustedDevice[]>([]);
  const [formFeedback, setFormFeedback] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteCircle, setInviteCircle] = useState<"family" | "friend">("family");
  const [stories, setStories] = useState<ApiStory[]>([]);
  const [inviteStoryId, setInviteStoryId] = useState("");
  const [contributorInvites, setContributorInvites] = useState<ContributorInviteRecord[]>([]);
  const [pushState, setPushState] = useState<PushSyncResult>({
    supported: false,
    enabled: false,
    message: "Checking browser alert support..."
  });
  const [isPushBusy, setIsPushBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    username: "",
    bio: "",
    location: "",
    avatarUrl: "",
    profileVisibility: "public",
    defaultStoryVisibility: "selected",
    allowCommentsByDefault: true,
    allowHelpRequests: true,
    hideReadCounts: false,
    showAnonymousActivity: true
  });

  useEffect(() => {
    let cancelled = false;

    void apiRequest<ProfileDashboard>("/profile/me", { accessToken })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setDashboard(payload);
        setProfileForm({
          fullName: payload.user.fullName,
          username: payload.user.username,
          bio: payload.user.bio,
          location: payload.user.location,
          avatarUrl: payload.user.avatarUrl ?? "",
          profileVisibility: payload.user.profileVisibility,
          defaultStoryVisibility: payload.user.defaultStoryVisibility,
          allowCommentsByDefault: payload.user.allowCommentsByDefault,
          allowHelpRequests: payload.user.allowHelpRequests,
          hideReadCounts: payload.user.hideReadCounts,
          showAnonymousActivity: payload.user.showAnonymousActivity
        });
      })
      .catch(() => undefined);

    void apiRequest<ApiStory[]>("/stories/mine", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setStories(payload);
          setInviteStoryId(payload[0]?.id ?? "");
        }
      })
      .catch(() => undefined);

    void apiRequest<{ invites: ContributorInviteRecord[] }>("/profile/invites", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setContributorInvites(payload.invites);
        }
      })
      .catch(() => undefined);

    void apiRequest<{ sessions: ProfileSession[] }>("/profile/sessions", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setSessions(payload.sessions);
        }
      })
      .catch(() => undefined);

    void apiRequest<{ devices: ProfileTrustedDevice[] }>("/profile/devices", { accessToken })
      .then((payload) => {
        if (!cancelled) {
          setDevices(payload.devices);
        }
      })
      .catch(() => undefined);

    void syncPushAlerts(accessToken, false)
      .then((result) => {
        if (!cancelled) {
          setPushState(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPushState({
            supported: supportsBrowserPush(),
            enabled: false,
            message: "Could not confirm push-alert status on this device."
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleInviteContributor = () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail || !inviteStoryId) {
      return;
    }

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
        setInviteStoryId(stories[0]?.id ?? inviteStoryId);
      })
      .catch((error) => {
        setFormFeedback(getErrorMessage(error, "Could not create invite."));
      });
  };

  const handleRemoveInvite = (inviteId: string) => {
    void apiRequest<{ invite: ContributorInviteRecord }>(`/profile/invites/${inviteId}`, {
      method: "DELETE",
      accessToken
    })
      .then((payload) => {
        setContributorInvites((current) =>
          current.map((invite) => (invite.id === inviteId ? payload.invite : invite))
        );
      })
      .catch((error) => {
        setFormFeedback(getErrorMessage(error, "Could not revoke invite."));
      });
  };

  const handleProfileInput = (field: keyof typeof profileForm, value: string | boolean) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const handleProfileAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setFormFeedback("Uploading profile photo...");
      const uploaded = await uploadMediaAsset(accessToken, {
        blob: file,
        fileName: file.name || "profile-photo",
        contentType: file.type || "image/jpeg"
      });

      setProfileForm((current) => ({ ...current, avatarUrl: uploaded.objectKey }));
      setDashboard((current) =>
        current
          ? {
              ...current,
              user: {
                ...current.user,
                avatarUrl: uploaded.readUrl
              }
            }
          : current
      );
      setFormFeedback("Profile photo uploaded. Save profile to keep it.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not upload profile photo."));
    }
  };

  const saveProfile = async () => {
    try {
      const result = await apiRequest<{ user: ProfileDashboard["user"] }>("/profile/me", {
        method: "PATCH",
        accessToken,
        body: profileForm
      });
      setProfileForm((current) => ({
        ...current,
        fullName: result.user.fullName,
        username: result.user.username,
        avatarUrl: result.user.avatarUrl ?? current.avatarUrl
      }));
      setDashboard((current) => (current ? { ...current, user: result.user } : current));
      setFormFeedback("Profile saved.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not save profile."));
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const payload = await apiRequest<{ session: ProfileSession }>(`/profile/sessions/${sessionId}/revoke`, {
        method: "POST",
        accessToken
      });
      setSessions((current) =>
        current.map((session) => (session.id === sessionId ? payload.session : session))
      );
      setFormFeedback("Session revoked.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not revoke session."));
    }
  };

  const renameDevice = async (deviceId: string, currentLabel: string) => {
    const nextLabel = window.prompt("Rename trusted device", currentLabel)?.trim();
    if (!nextLabel || nextLabel === currentLabel) {
      return;
    }

    try {
      const payload = await apiRequest<{ device: ProfileTrustedDevice }>(`/profile/devices/${deviceId}`, {
        method: "PATCH",
        accessToken,
        body: { label: nextLabel }
      });
      setDevices((current) => current.map((device) => (device.id === deviceId ? payload.device : device)));
      setFormFeedback("Device renamed.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not rename device."));
    }
  };

  const revokeDevice = async (deviceId: string) => {
    try {
      const payload = await apiRequest<{ device: ProfileTrustedDevice }>(`/profile/devices/${deviceId}/revoke`, {
        method: "POST",
        accessToken
      });
      setDevices((current) => current.map((device) => (device.id === deviceId ? payload.device : device)));
      setFormFeedback("Device revoked.");
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not revoke device."));
    }
  };

  const enablePushOnThisDevice = async () => {
    setIsPushBusy(true);
    try {
      const result = await syncPushAlerts(accessToken, true);
      setPushState(result);
      if (result.enabled) {
        const deviceIdentity = getStoredDeviceIdentity();
        setDevices((current) =>
          current.map((device) =>
            device.label === deviceIdentity.deviceName ? { ...device, pushEnabled: true } : device
          )
        );
      }
      setFormFeedback(result.message);
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not enable push alerts on this device."));
    } finally {
      setIsPushBusy(false);
    }
  };

  const disablePushOnThisDevice = async () => {
    setIsPushBusy(true);
    try {
      const result = await disablePushAlerts(accessToken);
      setPushState(result);
      const deviceIdentity = getStoredDeviceIdentity();
      setDevices((current) =>
        current.map((device) =>
          device.label === deviceIdentity.deviceName ? { ...device, pushEnabled: false } : device
        )
      );
      setFormFeedback(result.message);
    } catch (error) {
      setFormFeedback(getErrorMessage(error, "Could not disable push alerts on this device."));
    } finally {
      setIsPushBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="profile-edit-back">
        <NavLink className="ghost-action" to="/profile">
          <IconComponent className="button-icon" name="arrow" />
          BACK
        </NavLink>
      </div>

      <section className="profile-editor-stage card">
        <div className="profile-editor-stage-copy">
          <SectionLabelComponent>IDENTITY_AND_ACCESS</SectionLabelComponent>
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
              <SectionLabelComponent>EDIT_PROFILE</SectionLabelComponent>
              <h2>Identity and visibility</h2>
              <span>Update the public details, location, bio, and default archive visibility for new chapters.</span>
            </div>
            <div className="profile-editor-avatar-row">
              {dashboard?.user.avatarUrl ? (
                <img alt={dashboard.user.fullName} className="profile-avatar-xl profile-avatar-image" src={dashboard.user.avatarUrl} />
              ) : (
                <span className="profile-avatar-xl">{(profileForm.fullName || "H").slice(0, 1).toUpperCase()}</span>
              )}
              <div className="profile-editor-avatar-copy">
                <strong>Profile photo</strong>
                <span>Upload a clear image for your profile identity.</span>
              </div>
              <button className="ghost-action" onClick={() => avatarInputRef.current?.click()} type="button">
                UPLOAD PHOTO
              </button>
              <input
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden-media-input"
                onChange={(event) => void handleProfileAvatarUpload(event)}
                ref={avatarInputRef}
                type="file"
              />
            </div>
            <div className="profile-form-grid">
              <label>
                Display name
                <input onChange={(event) => handleProfileInput("fullName", event.target.value)} value={profileForm.fullName} />
              </label>
              <label>
                Username
                <input onChange={(event) => handleProfileInput("username", event.target.value.replace(/^@/, ""))} value={`@${profileForm.username}`} />
              </label>
              <label>
                Bio
                <textarea onChange={(event) => handleProfileInput("bio", event.target.value)} value={profileForm.bio} />
              </label>
              <label>
                Location
                <input onChange={(event) => handleProfileInput("location", event.target.value)} value={profileForm.location} />
              </label>
              <label>
                Profile visibility
                <select onChange={(event) => handleProfileInput("profileVisibility", event.target.value)} value={profileForm.profileVisibility}>
                  <option value="public">Public</option>
                  <option value="selected">Selected readers</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <label>
                Default chapter visibility
                <select onChange={(event) => handleProfileInput("defaultStoryVisibility", event.target.value)} value={profileForm.defaultStoryVisibility}>
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
                <SectionLabelComponent>CONTRIBUTOR_INVITES</SectionLabelComponent>
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
                  <select onChange={(event) => setInviteStoryId(event.target.value)} value={inviteStoryId}>
                    {stories.map((story) => (
                      <option key={story.id} value={story.id}>
                        {story.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="chapter-controls profile-editor-actions">
                <button className="primary-action" onClick={handleInviteContributor} type="button">
                  SEND INVITE
                  <IconComponent className="button-icon" name="arrow" />
                </button>
              </div>
              <div className="profile-settings-list">
                {contributorInvites.length ? (
                  contributorInvites.map((invite) => (
                    <div className="profile-setting-row" key={invite.id}>
                      <strong>{invite.email}</strong>
                      <span>
                        {invite.circle === "family" ? "Family" : "Friend"} // {invite.story}
                      </span>
                      <small>{invite.status}</small>
                      <button className="ghost-action slim-action" onClick={() => handleRemoveInvite(invite.id)} type="button">
                        REVOKE
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="profile-setting-row">
                    <strong>No contributor invites</strong>
                    <span>Send an invite to let family or friends contribute to a story.</span>
                  </div>
                )}
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>PROFILE_CONTROLS</SectionLabelComponent>
                <h2>Profile controls</h2>
              </div>
              <div className="profile-toggle-stack">
                <label className="toggle-row">
                  <input checked={profileForm.allowCommentsByDefault} onChange={(event) => handleProfileInput("allowCommentsByDefault", event.target.checked)} type="checkbox" />
                  <span>Allow comments on published chapters</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.allowHelpRequests} onChange={(event) => handleProfileInput("allowHelpRequests", event.target.checked)} type="checkbox" />
                  <span>Let readers request to help through consent-fee flow</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.hideReadCounts} onChange={(event) => handleProfileInput("hideReadCounts", event.target.checked)} type="checkbox" />
                  <span>Hide read counts from public profile view</span>
                </label>
                <label className="toggle-row">
                  <input checked={profileForm.showAnonymousActivity} onChange={(event) => handleProfileInput("showAnonymousActivity", event.target.checked)} type="checkbox" />
                  <span>Show anonymous advice activity inside profile dashboard</span>
                </label>
              </div>
              {formFeedback ? <p className="status-feedback">{formFeedback}</p> : null}
              <div className="chapter-controls">
                <button className="ghost-action" onClick={() => navigate("/profile")} type="button">CANCEL</button>
                <button className="primary-action" onClick={() => void saveProfile()} type="button">
                  SAVE PROFILE
                  <IconComponent className="button-icon" name="arrow" />
                </button>
              </div>
            </div>
          </article>

          <article className="profile-panel card profile-editor-card">
            <div className="profile-panel-body">
              <div className="profile-section-copy">
                <SectionLabelComponent>SECURITY_AND_ACCESS</SectionLabelComponent>
                <h2>Security and access</h2>
              </div>
              <div className="profile-settings-list">
                <div className="profile-setting-row">
                  <strong>Email verification</strong>
                  <span>{dashboard?.user.email ?? "Loading email..."}</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Password</strong>
                  <span>Last changed 14 days ago</span>
                </div>
                <div className="profile-setting-row">
                  <strong>Browser sign-in alerts</strong>
                  <span>{pushState.message}</span>
                  <div className="profile-row-actions">
                    <button
                      className="ghost-action slim-action"
                      disabled={isPushBusy || !pushState.supported}
                      onClick={() => void enablePushOnThisDevice()}
                      type="button"
                    >
                      {isPushBusy ? "WORKING..." : pushState.enabled ? "REFRESH" : "ENABLE"}
                    </button>
                    <button
                      className="ghost-action slim-action"
                      disabled={isPushBusy || !pushState.enabled}
                      onClick={() => void disablePushOnThisDevice()}
                      type="button"
                    >
                      DISABLE
                    </button>
                  </div>
                </div>
                {devices.length ? (
                  devices.map((device) => (
                    <div className="profile-setting-row" key={device.id}>
                      <strong>{device.label}</strong>
                      <span>
                        {device.active ? "Trusted device" : "Revoked"}
                        {device.pushEnabled ? " // Push alerts on" : ""}
                        {device.ipAddress ? ` // ${device.ipAddress}` : ""}
                      </span>
                      <small>{device.userAgent}</small>
                      <div className="profile-row-actions">
                        <button className="ghost-action slim-action" onClick={() => void renameDevice(device.id, device.label)} type="button">
                          RENAME
                        </button>
                        <button className="ghost-action slim-action" onClick={() => void revokeDevice(device.id)} type="button">
                          {device.active ? "REMOVE" : "REMOVED"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="profile-setting-row">
                    <strong>No trusted devices yet</strong>
                    <span>Your approved browsers and phones will appear here.</span>
                  </div>
                )}
                {sessions.length ? (
                  sessions.map((session) => (
                    <div className="profile-setting-row" key={session.id}>
                      <strong>{session.userAgent}</strong>
                      <span>{session.active ? "Active session" : "Revoked"}{session.ipAddress ? ` // ${session.ipAddress}` : ""}</span>
                      <button className="ghost-action slim-action" onClick={() => void revokeSession(session.id)} type="button">
                        {session.active ? "REVOKE" : "REVOKED"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="profile-setting-row">
                    <strong>No active sessions returned</strong>
                    <span>Signed-in browsers and app sessions will appear here.</span>
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
