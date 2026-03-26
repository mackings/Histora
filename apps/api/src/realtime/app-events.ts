import type { IncomingMessage, Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { WebSocket, WebSocketServer } from "ws";

import { isTrustedBrowserOrigin, normalizeOriginValue } from "../config/cors.js";
import { StoryModel } from "../models/story.model.js";
import { UserModel } from "../models/user.model.js";
import { getRedisClient, getRedisSubscriber, safeRedisConnect } from "../services/redis.service.js";
import { authenticateAccessToken } from "../services/session-auth.service.js";

type EventEnvelope = {
  type: "event";
  channel: string;
  payload: unknown;
  eventId: string;
};

type ClientContext = {
  socket: WebSocket;
  userId?: string;
  channels: Set<string>;
};

type StoryDraftUpdateMessage = {
  type: "story-draft-update";
  storyId?: string;
  draftSessionId?: string;
  reason?: string;
  snapshot?: unknown;
};

const eventClients = new Set<ClientContext>();
const redisEventChannel = "histora:events";
let redisSubscriptionReady = false;
const deliveredEventIds = new Map<string, number>();
const deliveredEventTtlMs = 60_000;

function rememberDeliveredEvent(eventId: string) {
  const now = Date.now();
  deliveredEventIds.set(eventId, now);

  for (const [key, timestamp] of deliveredEventIds) {
    if (now - timestamp > deliveredEventTtlMs) {
      deliveredEventIds.delete(key);
    }
  }
}

const isEventsUpgradeRequest = (request: IncomingMessage) => {
  const host = request.headers.host;

  if (!host || !request.url) {
    return false;
  }

  const requestUrl = new URL(request.url, `http://${host}`);
  return requestUrl.pathname === "/ws/events";
};

const getUserIdFromToken = async (request: IncomingMessage) => {
  const host = request.headers.host;

  if (!host || !request.url) {
    return undefined;
  }

  try {
    const requestUrl = new URL(request.url, `http://${host}`);
    const token = requestUrl.searchParams.get("token");

    if (!token) {
      return undefined;
    }

    const auth = await authenticateAccessToken(token);
    return auth.userId;
  } catch {
    return undefined;
  }
};

const hasTrustedUpgradeOrigin = (request: IncomingMessage) => {
  const origin = request.headers.origin;
  return !!origin && !!normalizeOriginValue(origin) && isTrustedBrowserOrigin(origin);
};

const canSubscribeToChannel = (channel: string, userId?: string) => {
  if (channel === "feed" || channel === "anonymous:public") {
    return true;
  }

  if (channel.startsWith("user:")) {
    return channel === `user:${userId}`;
  }

  if (channel.startsWith("anonymous:inbox:")) {
    return channel === `anonymous:inbox:${userId}`;
  }

  return false;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const canPublishStoryDraftUpdate = async (storyId: string, userId?: string) => {
  if (!userId) {
    return null;
  }

  const story = await StoryModel.findById(storyId).select("authorId collaborators");
  if (!story) {
    return null;
  }

  const isEditor =
    String(story.authorId) === userId ||
    story.collaborators.some((collaborator) => String(collaborator.userId) === userId);

  return isEditor ? story : null;
};

const isValidStoryDraftUpdateMessage = (payload: unknown): payload is StoryDraftUpdateMessage => {
  if (!isObjectRecord(payload) || payload.type !== "story-draft-update") {
    return false;
  }

  return typeof payload.storyId === "string" && payload.storyId.length > 0 && isObjectRecord(payload.snapshot);
};

async function handleStoryDraftUpdate(client: ClientContext, payload: StoryDraftUpdateMessage) {
  if (!payload.storyId || !client.userId || !payload.snapshot || !isObjectRecord(payload.snapshot)) {
    client.socket.send(JSON.stringify({ type: "error", error: "Invalid collaborative draft update." }));
    return;
  }

  const serializedPayload = JSON.stringify(payload.snapshot);
  if (Buffer.byteLength(serializedPayload, "utf8") > 60_000) {
    client.socket.send(JSON.stringify({ type: "error", error: "Collaborative draft update is too large." }));
    return;
  }

  const [story, actor] = await Promise.all([
    canPublishStoryDraftUpdate(payload.storyId, client.userId),
    UserModel.findById(client.userId).select("fullName username")
  ]);

  if (!story || !actor) {
    client.socket.send(JSON.stringify({ type: "error", error: "Unauthorized collaborative draft update." }));
    return;
  }

  const participantIds = new Set([
    String(story.authorId),
    ...story.collaborators.map((collaborator) => String(collaborator.userId))
  ]);

  for (const participantId of participantIds) {
    broadcastAppEvent(`user:${participantId}`, {
      kind: "story.collaboration.draft.updated",
      storyId: payload.storyId,
      draftSessionId: typeof payload.draftSessionId === "string" ? payload.draftSessionId : "",
      reason: typeof payload.reason === "string" ? payload.reason : "draft-update",
      updatedAt: new Date().toISOString(),
      updatedByName: actor.fullName,
      updatedByUsername: actor.username,
      snapshot: payload.snapshot
    });
  }
}

export function broadcastAppEvent(channel: string, payload: unknown) {
  const envelope: EventEnvelope = { type: "event", channel, payload, eventId: randomUUID() };
  const serialized = JSON.stringify(envelope);

  const redis = getRedisClient();
  if (redis) {
    deliverEvent(serialized, envelope);
    void safeRedisConnect(redis)
      .then(() => redis.publish(redisEventChannel, serialized))
      .catch(() => undefined);
    return;
  }

  deliverEvent(serialized, envelope);
}

function deliverEvent(serialized: string, envelope: EventEnvelope) {
  if (deliveredEventIds.has(envelope.eventId)) {
    return;
  }

  rememberDeliveredEvent(envelope.eventId);
  const { channel } = envelope;

  for (const client of eventClients) {
    // Only deliver to sockets that explicitly subscribed to the channel.
    if (!client.channels.has(channel) || client.socket.readyState !== WebSocket.OPEN) {
      continue;
    }

    client.socket.send(serialized);
  }
}

async function ensureRedisSubscription() {
  const subscriber = getRedisSubscriber();
  if (!subscriber || redisSubscriptionReady) {
    return;
  }

  await safeRedisConnect(subscriber);
  await subscriber.subscribe(redisEventChannel);
  subscriber.on("message", (receivedChannel: string, message: string) => {
    if (receivedChannel !== redisEventChannel) {
      return;
    }

    try {
      const envelope = JSON.parse(message) as EventEnvelope;
      deliverEvent(message, envelope);
    } catch {
      return;
    }
  });
  redisSubscriptionReady = true;
}

export function registerAppEventsRelay(server: HttpServer) {
  const eventsServer = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  void ensureRedisSubscription();

  server.on("upgrade", (request, socket, head) => {
    if (!isEventsUpgradeRequest(request)) {
      return;
    }

    if (!hasTrustedUpgradeOrigin(request)) {
      socket.destroy();
      return;
    }

    void getUserIdFromToken(request).then((userId) => {
      eventsServer.handleUpgrade(request, socket, head, (clientSocket) => {
        eventsServer.emit("connection", clientSocket, request, userId);
      });
    }).catch(() => {
      socket.destroy();
    });
  });

  eventsServer.on("connection", (socket, _request, userId?: string) => {
    const client: ClientContext = {
      socket,
      userId,
      channels: new Set()
    };

    eventClients.add(client);

    socket.send(
      JSON.stringify({
        type: "ready",
        channels: ["feed", "anonymous:public"]
      })
    );

    socket.on("message", (message) => {
      void (async () => {
        const payload = JSON.parse(message.toString()) as {
          type?: string;
          channel?: string;
        };

        if (payload.type === "subscribe" && payload.channel) {
          if (!canSubscribeToChannel(payload.channel, client.userId)) {
            socket.send(JSON.stringify({ type: "error", error: "Unauthorized channel subscription." }));
            return;
          }

          // Keep subscriptions explicit so private inbox traffic never leaks into public channels.
          client.channels.add(payload.channel);
          socket.send(JSON.stringify({ type: "subscribed", channel: payload.channel }));
          return;
        }

        if (isValidStoryDraftUpdateMessage(payload)) {
          await handleStoryDraftUpdate(client, payload);
          return;
        }

        socket.send(JSON.stringify({ type: "error", error: "Invalid realtime payload." }));
      })().catch(() => {
        socket.send(JSON.stringify({ type: "error", error: "Invalid realtime payload." }));
      });
    });

    socket.on("close", () => {
      eventClients.delete(client);
    });

    socket.on("error", () => {
      eventClients.delete(client);
    });
  });
}
