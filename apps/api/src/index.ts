import { connectDatabase } from "./config/db.js";
import { createApp } from "./app.js";

const app = createApp();

let connectionPromise: Promise<unknown> | null = null;

function ensureDatabaseConnection() {
  if (!connectionPromise) {
    connectionPromise = connectDatabase();
  }

  return connectionPromise;
}

export default async function handler(request: Parameters<typeof app>[0], response: Parameters<typeof app>[1]) {
  await ensureDatabaseConnection();
  return app(request, response);
}
