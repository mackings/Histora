import { createServer } from "http";

import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { registerAppEventsRelay } from "./realtime/app-events.js";
import { registerTranscriptionRelay } from "./realtime/transcription-relay.js";
import { registerQueueWorkers } from "./services/queue.service.js";
import {
  getRedisClient,
  getRedisSubscriber,
  safeRedisConnect
} from "./services/redis.service.js";

async function connectOptionalRedisClients() {
  await Promise.allSettled([
    safeRedisConnect(getRedisClient()),
    safeRedisConnect(getRedisSubscriber())
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === "rejected") {
        console.warn("Histora Redis connection unavailable; continuing without Redis-backed realtime fanout, queues, or rate-limit storage.", result.reason);
      }
    });
  });
}

async function bootstrap() {
  await connectDatabase();
  await connectOptionalRedisClients();

  const app = createApp();
  const server = createServer(app);
  const queueWorker = registerQueueWorkers();
  registerAppEventsRelay(server);
  registerTranscriptionRelay(server);

  queueWorker?.on("error", (error: Error) => {
    console.error("Histora queue worker error", error);
  });

  server.listen(env.PORT, () => {
    console.log(`Histora API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start Histora API", error);
  process.exit(1);
});
