import { ContributorInviteModel } from "../models/contributor-invite.model.js";
import { PushSubscriptionModel } from "../models/push-subscription.model.js";
import { TrustedDeviceModel } from "../models/trusted-device.model.js";
import { FollowModel } from "../models/follow.model.js";
import { AnonymousMessageModel } from "../models/anonymous-message.model.js";
import { SessionModel } from "../models/session.model.js";
import { StoryModel } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import type { ContributorInviteInput, DeviceRenameInput, ProfileUpdateInput } from "../shared/index.js";
import { AppError } from "../utils/app-error.js";
import { listBookmarkedStories } from "./story.service.js";
import { resolveStoredObjectUrl } from "./storage.service.js";

function formatSessionDevice(session: {
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  id?: string;
  _id?: unknown;
}) {
  return {
    id: session.id ?? String(session._id ?? ""),
    userAgent: session.userAgent ?? "Unknown device",
    ipAddress: session.ipAddress ?? null,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    revokedAt: session.revokedAt ?? null,
    active: !session.revokedAt
  };
}

export async function getProfileDashboard(userId: string) {
  const user = await UserModel.findById(userId).select(
    "fullName username email bio location avatarUrl subscriptionTier profileVisibility defaultStoryVisibility allowCommentsByDefault allowHelpRequests hideReadCounts showAnonymousActivity"
  );
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const [stories, anonymousInboxCount, anonymousSentCount, activeSessionCount, followerCount, followingCount] = await Promise.all([
    StoryModel.find({ authorId: userId })
      .sort({ updatedAt: -1 })
      .select("title visibility status readCount chapters updatedAt"),
    AnonymousMessageModel.countDocuments({ recipientUserId: userId }),
    AnonymousMessageModel.countDocuments({ senderUserId: userId }),
    SessionModel.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }),
    FollowModel.countDocuments({ followeeUserId: userId }),
    FollowModel.countDocuments({ followerUserId: userId })
  ]);

  const avatarUrl = await resolveStoredObjectUrl(user.avatarUrl ?? null);

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      bio: user.bio ?? "",
      location: user.location ?? "",
      avatarUrl,
      subscriptionTier: user.subscriptionTier,
      profileVisibility: user.profileVisibility,
      defaultStoryVisibility: user.defaultStoryVisibility,
      allowCommentsByDefault: user.allowCommentsByDefault,
      allowHelpRequests: user.allowHelpRequests,
      hideReadCounts: user.hideReadCounts,
      showAnonymousActivity: user.showAnonymousActivity
    },
    metrics: {
      publishedStories: stories.filter((story) => story.status === "published").length,
      totalChapters: stories.reduce((sum, story) => sum + story.chapters.length, 0),
      totalReads: stories.reduce((sum, story) => sum + story.readCount, 0),
      anonymousPosts: anonymousSentCount,
      followers: followerCount,
      following: followingCount
    },
    stories: stories.map((story) => ({
      id: story.id,
      title: story.title,
      visibility: story.visibility.toUpperCase(),
      chapters: `${story.chapters.length} chapter${story.chapters.length === 1 ? "" : "s"}`,
      reads: `${story.readCount} reads`,
      status: story.status === "published" ? "Live" : "Draft",
      updatedAt: story.updatedAt
    })),
    activity: [
      {
        title: "Anonymous inbox",
        detail: `${anonymousInboxCount} anonymous message${anonymousInboxCount === 1 ? "" : "s"} received.`,
        time: "Live"
      },
      {
        title: "Anonymous posts sent",
        detail: `${anonymousSentCount} anonymous message${anonymousSentCount === 1 ? "" : "s"} created.`,
        time: "Live"
      },
      {
        title: "Active sessions",
        detail: `${activeSessionCount} active session${activeSessionCount === 1 ? "" : "s"} on your account.`,
        time: "Live"
      }
    ]
  };
}

export async function updateProfile(userId: string, input: ProfileUpdateInput) {
  const existingUser = await UserModel.findOne({
    _id: { $ne: userId },
    username: input.username.toLowerCase()
  }).select("_id");

  if (existingUser) {
    throw new AppError("Username already exists", 409);
  }

  const user = await UserModel.findByIdAndUpdate(
    userId,
    {
      $set: {
        fullName: input.fullName,
        username: input.username.toLowerCase(),
        bio: input.bio,
        location: input.location,
        avatarUrl: input.avatarUrl ?? "",
        profileVisibility: input.profileVisibility,
        defaultStoryVisibility: input.defaultStoryVisibility,
        allowCommentsByDefault: input.allowCommentsByDefault,
        allowHelpRequests: input.allowHelpRequests,
        hideReadCounts: input.hideReadCounts,
        showAnonymousActivity: input.showAnonymousActivity
      }
    },
    { new: true }
  ).select(
    "fullName username email bio location avatarUrl subscriptionTier profileVisibility defaultStoryVisibility allowCommentsByDefault allowHelpRequests hideReadCounts showAnonymousActivity"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  await StoryModel.updateMany(
    { authorId: userId, anonymous: false },
    {
      $set: {
        authorName: user.fullName,
        authorUsername: user.username
      }
    }
  );

  const avatarUrl = await resolveStoredObjectUrl(user.avatarUrl ?? null);

  return {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    bio: user.bio ?? "",
    location: user.location ?? "",
    avatarUrl,
    subscriptionTier: user.subscriptionTier,
    profileVisibility: user.profileVisibility,
    defaultStoryVisibility: user.defaultStoryVisibility,
    allowCommentsByDefault: user.allowCommentsByDefault,
    allowHelpRequests: user.allowHelpRequests,
    hideReadCounts: user.hideReadCounts,
    showAnonymousActivity: user.showAnonymousActivity
  };
}

export async function listContributorInvites(userId: string) {
  const invites = await ContributorInviteModel.find({ ownerUserId: userId })
    .sort({ updatedAt: -1 })
    .limit(50)
    .select("email circle storyTitle status createdAt");

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    circle: invite.circle,
    story: invite.storyTitle,
    status: invite.status[0].toUpperCase() + invite.status.slice(1),
    createdAt: invite.createdAt
  }));
}

export async function createContributorInvite(userId: string, input: ContributorInviteInput) {
  const story = await StoryModel.findOne({ _id: input.storyId, authorId: userId }).select("title");
  if (!story) {
    throw new AppError("Story not found", 404);
  }

  const invite = await ContributorInviteModel.create({
    ownerUserId: userId,
    email: input.email.toLowerCase(),
    circle: input.circle,
    storyId: input.storyId,
    storyTitle: story.title,
    status: "pending"
  });

  return {
    id: invite.id,
    email: invite.email,
    circle: invite.circle,
    story: invite.storyTitle,
    status: "Pending",
    createdAt: invite.createdAt
  };
}

export async function revokeContributorInvite(userId: string, inviteId: string) {
  const invite = await ContributorInviteModel.findOneAndUpdate(
    { _id: inviteId, ownerUserId: userId },
    { $set: { status: "revoked" } },
    { new: true }
  ).select("email circle storyTitle status createdAt");

  if (!invite) {
    throw new AppError("Invite not found", 404);
  }

  return {
    id: invite.id,
    email: invite.email,
    circle: invite.circle,
    story: invite.storyTitle,
    status: "Revoked",
    createdAt: invite.createdAt
  };
}

export async function listSavedStories(userId: string) {
  return listBookmarkedStories(userId);
}

export async function toggleFollowUser(followerUserId: string, username: string) {
  const followee = await UserModel.findOne({ username: username.toLowerCase() }).select("_id username");
  if (!followee) {
    throw new AppError("User not found", 404);
  }

  if (followee.id === followerUserId) {
    throw new AppError("You cannot follow yourself", 400);
  }

  const existingFollow = await FollowModel.findOne({
    followerUserId,
    followeeUserId: followee.id
  });

  let active = false;

  if (existingFollow) {
    await existingFollow.deleteOne();
  } else {
    await FollowModel.create({
      followerUserId,
      followeeUserId: followee.id
    });
    active = true;
  }

  return {
    username: followee.username,
    active
  };
}

export async function listUserSessions(userId: string) {
  const sessions = await SessionModel.find({ userId })
    .sort({ lastSeenAt: -1 })
    .limit(20)
    .select("userAgent ipAddress createdAt lastSeenAt revokedAt");

  return sessions.map((session) => formatSessionDevice(session));
}

export async function revokeUserSession(userId: string, sessionId: string) {
  const session = await SessionModel.findOneAndUpdate(
    { _id: sessionId, userId },
    { $set: { revokedAt: new Date() } },
    { new: true }
  ).select("userAgent ipAddress createdAt lastSeenAt revokedAt");

  if (!session) {
    throw new AppError("Session not found", 404);
  }

  return formatSessionDevice(session);
}

export async function listTrustedDevices(userId: string) {
  const devices = await TrustedDeviceModel.find({ userId })
    .sort({ lastSeenAt: -1 })
    .limit(30)
    .select("label userAgent lastIpAddress approvedAt lastSeenAt revokedAt deviceKeyHash");

  const pushEnabledDeviceKeys = new Set(
    (
      await PushSubscriptionModel.find({ userId, revokedAt: null })
        .select("deviceKeyHash")
        .lean()
    ).map((subscription) => subscription.deviceKeyHash)
  );

  return devices.map((device) => ({
    id: device.id,
    label: device.label,
    userAgent: device.userAgent ?? "Unknown device",
    ipAddress: device.lastIpAddress ?? null,
    approvedAt: device.approvedAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt ?? null,
    active: !device.revokedAt,
    pushEnabled: pushEnabledDeviceKeys.has(device.deviceKeyHash)
  }));
}

export async function renameTrustedDevice(userId: string, deviceId: string, input: DeviceRenameInput) {
  const device = await TrustedDeviceModel.findOneAndUpdate(
    { _id: deviceId, userId },
    { $set: { label: input.label } },
    { new: true }
  ).select("label userAgent lastIpAddress approvedAt lastSeenAt revokedAt");

  if (!device) {
    throw new AppError("Device not found", 404);
  }

  return {
    id: device.id,
    label: device.label,
    userAgent: device.userAgent ?? "Unknown device",
    ipAddress: device.lastIpAddress ?? null,
    approvedAt: device.approvedAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt ?? null,
    active: !device.revokedAt
  };
}

export async function revokeTrustedDevice(userId: string, deviceId: string) {
  const device = await TrustedDeviceModel.findOneAndUpdate(
    { _id: deviceId, userId },
    { $set: { revokedAt: new Date() } },
    { new: true }
  ).select("label userAgent lastIpAddress approvedAt lastSeenAt revokedAt deviceKeyHash");

  if (!device) {
    throw new AppError("Device not found", 404);
  }

  await SessionModel.updateMany(
    { userId, deviceKeyHash: device.deviceKeyHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  await PushSubscriptionModel.updateMany(
    { userId, deviceKeyHash: device.deviceKeyHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  return {
    id: device.id,
    label: device.label,
    userAgent: device.userAgent ?? "Unknown device",
    ipAddress: device.lastIpAddress ?? null,
    approvedAt: device.approvedAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt ?? null,
    active: !device.revokedAt,
    pushEnabled: false
  };
}
