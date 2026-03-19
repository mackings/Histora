import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";

import { env } from "../config/env.js";

const ASSEMBLYAI_STREAMING_URL = "wss://streaming.assemblyai.com/v3/ws";

const getStreamingConfig = (language: string) => {
  if (language === "en-US" || language === "en-GB") {
    return {
      speechModel: "universal-streaming-english",
      languageDetection: false
    };
  }

  if (
    language === "fr-FR" ||
    language === "es-ES" ||
    language === "de-DE" ||
    language === "pt-BR" ||
    language === "it-IT"
  ) {
    return {
      speechModel: "universal-streaming-multilingual",
      languageDetection: true
    };
  }

  if (language === "ar-SA" || language === "yo-NG" || language === "ha-NG") {
    return {
      speechModel: "whisper-rt",
      languageDetection: true
    };
  }

  return null;
};

const closeSocket = (socket: WebSocket | null | undefined) => {
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    return;
  }

  socket.close();
};

const isUpgradeRequestForRelay = (request: IncomingMessage) => {
  const host = request.headers.host;

  if (!host || !request.url) {
    return false;
  }

  const requestUrl = new URL(request.url, `http://${host}`);
  return requestUrl.pathname === "/ws/transcription";
};

export function registerTranscriptionRelay(server: HttpServer) {
  const relayServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (!isUpgradeRequestForRelay(request)) {
      return;
    }

    relayServer.handleUpgrade(request, socket, head, (clientSocket) => {
      relayServer.emit("connection", clientSocket, request);
    });
  });

  relayServer.on("connection", (clientSocket, request) => {
    if (!env.ASSEMBLYAI_API_KEY) {
      clientSocket.send(
        JSON.stringify({
          type: "Error",
          error: "AssemblyAI is not configured on the server."
        })
      );
      clientSocket.close();
      return;
    }

    const host = request.headers.host;
    const requestUrl = new URL(request.url ?? "/ws/transcription", `http://${host ?? "localhost"}`);
    const language = requestUrl.searchParams.get("language") ?? "en-US";
    const streamingConfig = getStreamingConfig(language) ?? {
      speechModel: "universal-streaming-multilingual",
      languageDetection: true
    };

    const assemblyUrl = new URL(ASSEMBLYAI_STREAMING_URL);
    assemblyUrl.searchParams.set("sample_rate", "16000");
    assemblyUrl.searchParams.set("encoding", "pcm_s16le");
    assemblyUrl.searchParams.set("format_turns", "true");
    assemblyUrl.searchParams.set("speech_model", streamingConfig.speechModel);
    assemblyUrl.searchParams.set("inactivity_timeout", "60");
    if (streamingConfig.languageDetection) {
      assemblyUrl.searchParams.set("language_detection", "true");
    }

    const assemblySocket = new WebSocket(assemblyUrl, {
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY
      }
    });

    const teardown = () => {
      closeSocket(clientSocket);
      closeSocket(assemblySocket);
    };

    assemblySocket.on("open", () => {
      clientSocket.send(
        JSON.stringify({
          type: "RelayReady"
        })
      );
    });

    assemblySocket.on("message", (message, isBinary) => {
      if (clientSocket.readyState !== WebSocket.OPEN) {
        return;
      }

      clientSocket.send(message, { binary: isBinary });
    });

    assemblySocket.on("error", () => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(
          JSON.stringify({
            type: "Error",
            error: "The transcription relay connection failed."
          })
        );
      }
      teardown();
    });

    assemblySocket.on("close", () => {
      closeSocket(clientSocket);
    });

    clientSocket.on("message", (message, isBinary) => {
      if (assemblySocket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (isBinary) {
        assemblySocket.send(message, { binary: true });
        return;
      }

      assemblySocket.send(message.toString());
    });

    clientSocket.on("close", () => {
      if (assemblySocket.readyState === WebSocket.OPEN) {
        assemblySocket.send(JSON.stringify({ type: "Terminate" }));
      }
      closeSocket(assemblySocket);
    });

    clientSocket.on("error", () => {
      closeSocket(assemblySocket);
    });
  });
}
