import webpush from "web-push";

import { env } from "../config/env.js";
import { PushSubscriptionModel } from "../models/push-subscription.model.js";
import { TrustedDeviceModel, hashDeviceKey } from "../models/trusted-device.model.js";
import { AppError } from "../utils/app-error.js";

type BrowserPushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type PushSubscriptionPayload = {
  subscription: BrowserPushSubscriptionInput;
  deviceId: string;
  deviceName: string;
};

type PushRequestContext = {
  userAgent?: string;
};

let vapidConfigured = false;

const hasPushConfig = () => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

function ensurePushConfigured() {
  if (!hasPushConfig()) {
    throw new AppError("Web push is not configured on the server.", 503, "PUSH_NOT_CONFIGURED");
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    vapidConfigured = true;
  }
}

export function getPushPublicKey() {
  return hasPushConfig() ? env.VAPID_PUBLIC_KEY! : null;
}

export async function savePushSubscription(userId: string, payload: PushSubscriptionPayload, context?: PushRequestContext) {
  ensurePushConfigured();

  const deviceKeyHash = hashDeviceKey(payload.deviceId);
  const trustedDevice = await TrustedDeviceModel.findOne({
    userId,
    deviceKeyHash,
    revokedAt: null
  }).select("_id");

  if (!trustedDevice) {
    throw new AppError("Only trusted devices can register push alerts.", 403, "UNTRUSTED_DEVICE");
  }

  const existingSubscription = await PushSubscriptionModel.findOne({
    endpoint: payload.subscription.endpoint
  }).select("userId");

  if (existingSubscription && String(existingSubscription.userId) !== userId) {
    throw new AppError("This push subscription is already bound to another account.", 409, "PUSH_SUBSCRIPTION_CONFLICT");
  }

  const subscription = await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: payload.subscription.endpoint, userId },
    {
      $set: {
        userId,
        deviceKeyHash,
        expirationTime: payload.subscription.expirationTime ?? null,
        p256dh: payload.subscription.keys.p256dh,
        auth: payload.subscription.keys.auth,
        userAgent: context?.userAgent,
        lastSeenAt: new Date(),
        revokedAt: null
      }
    },
    { upsert: true, new: true }
  ).select("endpoint");

  return {
    ok: true,
    endpoint: subscription.endpoint
  };
}

export async function revokePushSubscription(userId: string, endpoint: string) {
  const subscription = await PushSubscriptionModel.findOneAndUpdate(
    { userId, endpoint, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  ).select("endpoint");

  if (!subscription) {
    return { ok: true };
  }

  return {
    ok: true,
    endpoint: subscription.endpoint
  };
}

async function revokeBrokenSubscription(endpoint: string) {
  await PushSubscriptionModel.updateOne({ endpoint, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function sendUserPushNotification(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag: string;
    data?: Record<string, string>;
  }
) {
  if (!hasPushConfig()) {
    return;
  }

  ensurePushConfigured();

  const subscriptions = await PushSubscriptionModel.find({
    userId,
    revokedAt: null
  }).select("endpoint p256dh auth expirationTime");

  if (!subscriptions.length) {
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime ?? null,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          body,
          {
            TTL: 120,
            urgency: "high"
          }
        );
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await revokeBrokenSubscription(subscription.endpoint);
        }
      }
    })
  );
}

export async function sendDeviceVerificationPush(
  userId: string,
  payload: {
    email: string;
    challengeId: string;
    requestedDeviceName: string;
  }
) {
  if (!hasPushConfig()) {
    return;
  }

  const maskedEmail = payload.email.replace(/^(.{2}).+(@.+)$/, "$1***$2");
  await sendUserPushNotification(userId, {
    title: "Histora sign-in attempt",
    body: `A new device wants access. The 5-digit code was sent to ${maskedEmail}.`,
    tag: `histora-device-${payload.challengeId}`,
    data: {
      url: `/verify-device?email=${encodeURIComponent(payload.email)}&challengeId=${encodeURIComponent(payload.challengeId)}&deviceName=${encodeURIComponent(payload.requestedDeviceName)}`,
      challengeId: payload.challengeId,
      deviceName: payload.requestedDeviceName
    }
  });
}

export async function sendFollowNotificationPush(
  userId: string,
  payload: {
    followerName: string;
    followerUsername: string;
  }
) {
  await sendUserPushNotification(userId, {
    title: "New Histora follower",
    body: `${payload.followerName} (@${payload.followerUsername}) followed your archive.`,
    tag: `histora-follow-${payload.followerUsername}`,
    data: {
      url: "/profile"
    }
  });
}

export async function sendStatusReactionNotificationPush(
  userId: string,
  payload: {
    reactorName: string;
    reactorUsername: string;
  }
) {
  await sendUserPushNotification(userId, {
    title: "New status reaction",
    body: `${payload.reactorName} (@${payload.reactorUsername}) reacted to your status.`,
    tag: `histora-status-reaction-${payload.reactorUsername}`,
    data: {
      url: "/feed"
    }
  });
}

export async function sendGenericNotificationPush(
  userId: string,
  payload: {
    title: string;
    body: string;
    tag: string;
    url?: string;
  }
) {
  await sendUserPushNotification(userId, {
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    data: payload.url
      ? {
          url: payload.url
        }
      : undefined
  });
}
