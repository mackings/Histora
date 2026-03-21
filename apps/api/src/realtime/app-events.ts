import type { IncomingMessage, Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";

import { isTrustedBrowserOrigin, normalizeOriginValue } from "../config/cors.js";
import { env } from "../config/env.js";
import { getRedisClient, getRedisSubscriber, safeRedisConnect } from "../services/redis.service.js";

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

const getUserIdFromToken = (request: IncomingMessage) => {
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

    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; typ?: string };
    if (payload.typ !== "access" || !payload.sub) {
      return undefined;
    }

    return payload.sub;
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

    eventsServer.handleUpgrade(request, socket, head, (clientSocket) => {
      eventsServer.emit("connection", clientSocket, request);
    });
  });

  eventsServer.on("connection", (socket, request) => {
    const client: ClientContext = {
      socket,
      userId: getUserIdFromToken(request),
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
      try {
        const payload = JSON.parse(message.toString()) as {
          type?: string;
          channel?: string;
        };

        if (payload.type !== "subscribe" || !payload.channel) {
          return;
        }

        if (!canSubscribeToChannel(payload.channel, client.userId)) {
          socket.send(JSON.stringify({ type: "error", error: "Unauthorized channel subscription." }));
          return;
        }

        // Keep subscriptions explicit so private inbox traffic never leaks into public channels.
        client.channels.add(payload.channel);
        socket.send(JSON.stringify({ type: "subscribed", channel: payload.channel }));
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "Invalid realtime payload." }));
      }
    });

    socket.on("close", () => {
      eventClients.delete(client);
    });

    socket.on("error", () => {
      eventClients.delete(client);
    });
  });
}
