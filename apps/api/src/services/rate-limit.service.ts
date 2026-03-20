import type { Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisReply } from "rate-limit-redis";

import { getRedisClient } from "./redis.service.js";

let sharedStore: Store | undefined;

export function getRateLimitStore() {
  const redis = getRedisClient();
  if (!redis) {
    return undefined;
  }

  if (!sharedStore) {
    sharedStore = new RedisStore({
      sendCommand: (...args: string[]) => redis.call(args[0] ?? "", ...args.slice(1)) as Promise<RedisReply>
    });
  }

  return sharedStore;
}
