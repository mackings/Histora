import { Redis } from "ioredis";

import { env } from "../config/env.js";

let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

export function getRedisClient() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  }

  return redisClient;
}

export function getRedisSubscriber() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (!redisSubscriber) {
    redisSubscriber = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  }

  return redisSubscriber;
}

export async function safeRedisConnect(client: Redis | null) {
  if (!client || client.status === "ready" || client.status === "connecting") {
    return;
  }

  await client.connect();
}
