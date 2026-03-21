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
import { broadcastAppEvent } from "../realtime/app-events.js";
import { sendFollowNotificationPush } from "./push.service.js";

type ProfileRelationshipUser = {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  verified: boolean;
};

type ProfileRelationshipEntry = ProfileRelationshipUser & {
  followedAt: Date;
  followingBack: boolean;
};

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

async function buildRelationshipUserMap(userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, ProfileRelationshipUser>();
  }

  const users = await UserModel.find({ _id: { $in: userIds } })
    .select("fullName username avatarUrl verificationStatus")
    .lean();

  const entries = await Promise.all(
    users.map(async (user) => {
      const mappedUser: ProfileRelationshipUser = {
        id: String(user._id),
        fullName: user.fullName,
        username: user.username,
        avatarUrl: await resolveStoredObjectUrl(user.avatarUrl ?? null),
        verified: user.verificationStatus === "verified"
      };

      return [mappedUser.id, mappedUser] as const;
    })
  );

  return new Map<string, ProfileRelationshipUser>(entries);
}

export async function getProfileDashboard(userId: string) {
  const user = await UserModel.findById(userId).select(
    "fullName username email bio location avatarUrl subscriptionTier profileVisibility defaultStoryVisibility allowCommentsByDefault allowHelpRequests hideReadCounts showAnonymousActivity verificationStatus verifiedAt emailVerified"
  );
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const [
    stories,
    anonymousInboxCount,
    anonymousSentCount,
    activeSessionCount,
    followerCount,
    followingCount,
    recentFollowers,
    recentFollowing
  ] = await Promise.all([
    StoryModel.find({ authorId: userId })
      .sort({ updatedAt: -1 })
      .select("title visibility status readCount likesCount bookmarksCount sharesCount commentsCount chapters updatedAt"),
    AnonymousMessageModel.countDocuments({ recipientUserId: userId }),
    AnonymousMessageModel.countDocuments({ senderUserId: userId }),
    SessionModel.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }),
    FollowModel.countDocuments({ followeeUserId: userId }),
    FollowModel.countDocuments({ followerUserId: userId }),
    FollowModel.find({ followeeUserId: userId }).sort({ createdAt: -1 }).limit(12).select("followerUserId createdAt").lean(),
    FollowModel.find({ followerUserId: userId }).sort({ createdAt: -1 }).limit(12).select("followeeUserId createdAt").lean()
  ]);

  const avatarUrl = await resolveStoredObjectUrl(user.avatarUrl ?? null);
  const followerIds = recentFollowers.map((follow) => String(follow.followerUserId));
  const followingIds = recentFollowing.map((follow) => String(follow.followeeUserId));
  const relatedUserIds = [...new Set([...followerIds, ...followingIds])];
  const relatedUsersById = await buildRelationshipUserMap(relatedUserIds);
  const followingIdSet = new Set(followingIds);
  const followersList = recentFollowers
    .map((follow) => {
      const follower = relatedUsersById.get(String(follow.followerUserId));
      if (!follower) {
        return null;
      }

      const entry: ProfileRelationshipEntry = {
        ...follower,
        followedAt: follow.createdAt,
        followingBack: followingIdSet.has(follower.id)
      };

      return entry;
    })
    .filter((entry): entry is ProfileRelationshipEntry => entry !== null);
  const followingList = recentFollowing
    .map((follow) => {
      const followee = relatedUsersById.get(String(follow.followeeUserId));
      if (!followee) {
        return null;
      }

      const entry: ProfileRelationshipEntry = {
        ...followee,
        followedAt: follow.createdAt,
        followingBack: true
      };

      return entry;
    })
    .filter((entry): entry is ProfileRelationshipEntry => entry !== null);

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
      emailVerified: user.emailVerified,
      verificationStatus: user.verificationStatus,
      verifiedAt: user.verifiedAt ?? null,
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
      chapterCount: story.chapters.length,
      reads: `${story.readCount} reads`,
      readsCount: story.readCount,
      likesCount: story.likesCount,
      bookmarksCount: story.bookmarksCount,
      sharesCount: story.sharesCount,
      commentsCount: story.commentsCount,
      status: story.status === "published" ? "Live" : "Draft",
      updatedAt: story.updatedAt
    })),
    activity: [
      ...followersList.slice(0, 3).map((follower) => ({
        title: "New follower",
        detail: `${follower.fullName} (@${follower.username}) followed your archive.`,
        time: "Live"
      })),
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
    ],
    followersList,
    followingList
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
    "fullName username email bio location avatarUrl subscriptionTier profileVisibility defaultStoryVisibility allowCommentsByDefault allowHelpRequests hideReadCounts showAnonymousActivity emailVerified verificationStatus verifiedAt"
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
    emailVerified: user.emailVerified,
    verificationStatus: user.verificationStatus,
    verifiedAt: user.verifiedAt ?? null,
    profileVisibility: user.profileVisibility,
    defaultStoryVisibility: user.defaultStoryVisibility,
    allowCommentsByDefault: user.allowCommentsByDefault,
    allowHelpRequests: user.allowHelpRequests,
    hideReadCounts: user.hideReadCounts,
    showAnonymousActivity: user.showAnonymousActivity
  };
}

export async function requestVerificationBadge(userId: string) {
  const user = await UserModel.findById(userId).select(
    "emailVerified verificationStatus verifiedAt fullName username"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.emailVerified) {
    throw new AppError("Verify your email before requesting a blue tick.", 400);
  }

  if (user.verificationStatus === "verified") {
    return {
      verificationStatus: "verified" as const,
      verifiedAt: user.verifiedAt ?? new Date()
    };
  }

  user.verificationStatus = "verified";
  user.verificationRequestedAt = new Date();
  user.verifiedAt = new Date();
  await user.save();

  return {
    verificationStatus: "verified" as const,
    verifiedAt: user.verifiedAt
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
  const [followee, follower] = await Promise.all([
    UserModel.findOne({ username: username.toLowerCase() }).select("_id username fullName"),
    UserModel.findById(followerUserId).select("username fullName")
  ]);
  if (!followee) {
    throw new AppError("User not found", 404);
  }
  if (!follower) {
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

  broadcastAppEvent(`user:${followerUserId}`, {
    kind: "follow.updated",
    username: followee.username,
    active
  });
  broadcastAppEvent(`user:${followee.id}`, {
    kind: "followers.updated",
    username: follower.username,
    active
  });

  if (active) {
    broadcastAppEvent(`user:${followee.id}`, {
      kind: "notification.followed",
      username: follower.username,
      fullName: follower.fullName
    });
    void sendFollowNotificationPush(followee.id, {
      followerName: follower.fullName,
      followerUsername: follower.username
    }).catch(() => undefined);
  }

  return {
    username: followee.username,
    active
  };
}

export async function listFollowers(userId: string) {
  const follows = await FollowModel.find({ followeeUserId: userId })
    .sort({ createdAt: -1 })
    .select("followerUserId createdAt")
    .lean();

  const followerIds = follows.map((follow) => String(follow.followerUserId));
  const usersById = await buildRelationshipUserMap(followerIds);
  const followingIds = new Set(
    (
      await FollowModel.find({ followerUserId: userId, followeeUserId: { $in: followerIds } })
        .select("followeeUserId")
        .lean()
    ).map((follow) => String(follow.followeeUserId))
  );

  return follows
    .map((follow) => {
      const follower = usersById.get(String(follow.followerUserId));
      if (!follower) {
        return null;
      }

      const entry: ProfileRelationshipEntry = {
        ...follower,
        followedAt: follow.createdAt,
        followingBack: followingIds.has(follower.id)
      };

      return entry;
    })
    .filter((entry): entry is ProfileRelationshipEntry => entry !== null);
}

export async function listFollowing(userId: string) {
  const follows = await FollowModel.find({ followerUserId: userId })
    .sort({ createdAt: -1 })
    .select("followeeUserId createdAt")
    .lean();

  const followeeIds = follows.map((follow) => String(follow.followeeUserId));
  const usersById = await buildRelationshipUserMap(followeeIds);

  return follows
    .map((follow) => {
      const followee = usersById.get(String(follow.followeeUserId));
      if (!followee) {
        return null;
      }

      const entry: ProfileRelationshipEntry = {
        ...followee,
        followedAt: follow.createdAt,
        followingBack: true
      };

      return entry;
    })
    .filter((entry): entry is ProfileRelationshipEntry => entry !== null);
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
