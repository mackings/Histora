import net from "net";

import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";

const chunkSize = 64 * 1024;

function shouldScanMedia() {
  return Boolean(env.CLAMAV_HOST);
}

function toUInt32Buffer(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

export async function scanMediaBuffer(body: Uint8Array) {
  if (!shouldScanMedia()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({
      host: env.CLAMAV_HOST,
      port: env.CLAMAV_PORT
    });

    let settled = false;
    let response = "";

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      handler();
    };

    socket.setTimeout(env.CLAMAV_TIMEOUT_MS);

    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0", "utf8"));

      for (let offset = 0; offset < body.byteLength; offset += chunkSize) {
        const chunk = body.subarray(offset, Math.min(offset + chunkSize, body.byteLength));
        socket.write(toUInt32Buffer(chunk.byteLength));
        socket.write(Buffer.from(chunk));
      }

      socket.write(toUInt32Buffer(0));
    });

    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");

      if (!response.includes("\0")) {
        return;
      }

      const normalized = response.replace(/\0/g, "").trim();

      if (normalized.endsWith("OK")) {
        finish(resolve);
        return;
      }

      if (normalized.includes("FOUND")) {
        finish(() => reject(new AppError("Upload failed the malware scan.", 400)));
        return;
      }

      finish(() => reject(new AppError("Media scan returned an invalid response.", 502)));
    });

    socket.on("timeout", () => {
      finish(() => reject(new AppError("Media scan timed out.", 503)));
    });

    socket.on("error", () => {
      finish(() => reject(new AppError("Media scan is unavailable.", 503)));
    });

    socket.on("end", () => {
      if (!settled) {
        finish(() => reject(new AppError("Media scan closed unexpectedly.", 502)));
      }
    });
  });
}
