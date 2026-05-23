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

async function bootstrap() {
  const app = createApp();
  const server = createServer(app);
  registerAppEventsRelay(server);
  registerTranscriptionRelay(server);

  server.listen(env.PORT, () => {
    console.log(`Histora API listening on port ${env.PORT}`);
  });

  await connectDatabase();
  await Promise.all([
    safeRedisConnect(getRedisClient()),
    safeRedisConnect(getRedisSubscriber())
  ]);

  const queueWorker = registerQueueWorkers();
  queueWorker?.on("error", (error: Error) => {
    console.error("Histora queue worker error", error);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start Histora API", error);
  process.exit(1);
});
