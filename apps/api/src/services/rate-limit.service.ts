import type { Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisReply } from "rate-limit-redis";

import { getRedisClient } from "./redis.service.js";

export function getRateLimitStore(prefix = "histora:rate-limit:"): Store | undefined {
  const redis = getRedisClient();
  if (!redis) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => redis.call(args[0] ?? "", ...args.slice(1)) as Promise<RedisReply>
  });
}
