import { getRedisClient, safeRedisConnect } from "./redis.service.js";

const cacheKeyPrefix = "histora";

const buildKey = (key: string) => `${cacheKeyPrefix}:${key}`;

export async function readJsonCache<T>(key: string) {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  await safeRedisConnect(redis);
  const payload = await redis.get(buildKey(key));
  return payload ? (JSON.parse(payload) as T) : null;
}

export async function writeJsonCache(key: string, value: unknown, ttlSeconds: number) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await safeRedisConnect(redis);
  await redis.set(buildKey(key), JSON.stringify(value), "EX", ttlSeconds);
}

export async function deleteCache(key: string) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await safeRedisConnect(redis);
  await redis.del(buildKey(key));
}

export async function deleteCacheByPrefix(prefix: string) {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  await safeRedisConnect(redis);
  const keys = await redis.keys(buildKey(`${prefix}*`));
  if (keys.length === 0) {
    return;
  }

  await redis.del(...keys);
}
