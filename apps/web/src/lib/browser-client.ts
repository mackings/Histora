import { type PushPublicKeyResponse, type PushSyncResult, apiRequest } from "./api-client";

const deviceIdentityStorageKey = "histora-device-identity-v1";
const pushServiceWorkerPath = "/histora-push-sw.js";

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.trim() ? error.message : fallback;

const buildDeviceLabel = () => {
  if (typeof navigator === "undefined") {
    return "Unknown device";
  }

  const platform = navigator.platform || "Unknown platform";
  const browser = navigator.userAgent.includes("Chrome")
    ? "Chrome"
    : navigator.userAgent.includes("Safari")
      ? "Safari"
      : navigator.userAgent.includes("Firefox")
        ? "Firefox"
        : "Browser";

  return `${platform} // ${browser}`;
};

export const getStoredDeviceIdentity = () => {
  if (typeof window === "undefined") {
    return {
      deviceId: "server-render-device",
      deviceName: "Server render"
    };
  }

  const existing = window.localStorage.getItem(deviceIdentityStorageKey);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as { deviceId?: string; deviceName?: string };
      if (
        typeof parsed.deviceId === "string" &&
        typeof parsed.deviceName === "string" &&
        parsed.deviceId.trim().length >= 16 &&
        parsed.deviceId.trim().length <= 160 &&
        parsed.deviceName.trim().length >= 2 &&
        parsed.deviceName.trim().length <= 80
      ) {
        return {
          deviceId: parsed.deviceId.trim(),
          deviceName: parsed.deviceName.trim()
        };
      }
    } catch {
      // Ignore malformed local device state and replace it.
    }
  }

  const identity = {
    deviceId: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceName: buildDeviceLabel()
  };
  window.localStorage.setItem(deviceIdentityStorageKey, JSON.stringify(identity));
  return identity;
};

export const supportsBrowserPush = () =>
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const getPushRegistration = async () => {
  if (!supportsBrowserPush()) {
    return null;
  }

  const existingRegistration = await navigator.serviceWorker.getRegistration(pushServiceWorkerPath);
  if (existingRegistration) {
    return existingRegistration;
  }

  return navigator.serviceWorker.register(pushServiceWorkerPath);
};

export const syncPushAlerts = async (accessToken: string, shouldPrompt: boolean): Promise<PushSyncResult> => {
  if (!supportsBrowserPush()) {
    return {
      supported: false,
      enabled: false,
      message: "Browser push is not available on this device."
    };
  }

  const { publicKey } = await apiRequest<PushPublicKeyResponse>("/profile/push/public-key", {
    accessToken
  });

  if (!publicKey) {
    return {
      supported: true,
      enabled: false,
      message: "Push alerts are not configured on the server yet."
    };
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return {
      supported: false,
      enabled: false,
      message: "Service worker registration failed on this browser."
    };
  }

  let permission = Notification.permission;
  if (permission === "default" && shouldPrompt) {
    permission = await Notification.requestPermission();
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription && permission === "granted") {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  if (!subscription) {
    return {
      supported: true,
      enabled: false,
      message:
        permission === "denied"
          ? "Push alerts are blocked in this browser."
          : "Enable notifications on this trusted device to receive sign-in alerts."
    };
  }

  const serializedSubscription = subscription.toJSON();
  if (!serializedSubscription.endpoint || !serializedSubscription.keys?.p256dh || !serializedSubscription.keys?.auth) {
    throw new Error("Push subscription is incomplete on this browser.");
  }

  const deviceIdentity = getStoredDeviceIdentity();
  await apiRequest<{ ok: boolean }>("/profile/push/subscriptions", {
    method: "POST",
    accessToken,
    body: {
      deviceId: deviceIdentity.deviceId,
      deviceName: deviceIdentity.deviceName,
      subscription: {
        endpoint: serializedSubscription.endpoint,
        expirationTime: serializedSubscription.expirationTime ?? null,
        keys: {
          p256dh: serializedSubscription.keys.p256dh,
          auth: serializedSubscription.keys.auth
        }
      }
    }
  });

  return {
    supported: true,
    enabled: true,
    message: "Push alerts are active on this trusted device."
  };
};

export const disablePushAlerts = async (accessToken: string): Promise<PushSyncResult> => {
  if (!supportsBrowserPush()) {
    return {
      supported: false,
      enabled: false,
      message: "Browser push is not available on this device."
    };
  }

  const registration = await navigator.serviceWorker.getRegistration(pushServiceWorkerPath);
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    await apiRequest<{ ok: boolean }>("/profile/push/subscriptions", {
      method: "DELETE",
      accessToken,
      body: { endpoint: subscription.endpoint }
    });
    await subscription.unsubscribe();
  }

  return {
    supported: true,
    enabled: false,
    message: "Push alerts are off on this device."
  };
};
