import { createServer } from "http";

import { createApp } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { registerTranscriptionRelay } from "./realtime/transcription-relay.js";

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = createServer(app);
  registerTranscriptionRelay(server);

  server.listen(env.PORT, () => {
    console.log(`Histora API listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start Histora API", error);
  process.exit(1);
});
