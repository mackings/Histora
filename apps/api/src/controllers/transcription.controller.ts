import { env } from "../config/env.js";
import { AppError } from "../utils/app-error.js";
import { asyncHandler } from "../utils/async-handler.js";

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";
const ASSEMBLYAI_UPLOAD_URL = "https://api.assemblyai.com/v2/upload";
const ASSEMBLYAI_TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";
const ASSEMBLYAI_STREAMING_TOKEN_URL = "https://streaming.assemblyai.com/v3/token";
const ASSEMBLYAI_POLL_INTERVAL_MS = 900;
const ASSEMBLYAI_POLL_TIMEOUT_MS = 30_000;

type TranscriptionResult = {
  text: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildAudioFile = (audioBuffer: Buffer, mimeType: string) => {
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : mimeType.includes("ogg") ? "ogg" : "webm";
  return new File([new Uint8Array(audioBuffer)], `studio-transcription.${ext}`, { type: mimeType });
};

const mapAssemblyLanguageCode = (language: string) => {
  if (language === "en-US") {
    return "en_us";
  }

  if (language === "ar-SA") {
    return "ar";
  }

  return null;
};

const transcribeWithOpenAI = async (audioBuffer: Buffer, mimeType: string, language: string): Promise<TranscriptionResult> => {
  if (!env.OPENAI_API_KEY) {
    throw new AppError("OpenAI transcription is not configured on the server.", 500);
  }

  const formData = new FormData();
  formData.append("file", buildAudioFile(audioBuffer, mimeType));
  formData.append("model", "gpt-4o-mini-transcribe");
  formData.append("language", language);

  const openAIResponse = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: formData
  });

  if (!openAIResponse.ok) {
    const errorText = await openAIResponse.text();
    throw new AppError(`Transcription failed: ${errorText}`, openAIResponse.status);
  }

  const payload = (await openAIResponse.json()) as { text?: string };

  return {
    text: payload.text ?? ""
  };
};

const uploadToAssemblyAI = async (audioBuffer: Buffer) => {
  const uploadResponse = await fetch(ASSEMBLYAI_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: env.ASSEMBLYAI_API_KEY as string,
      "Content-Type": "application/octet-stream"
    },
    body: new Uint8Array(audioBuffer)
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new AppError(`AssemblyAI upload failed: ${errorText}`, uploadResponse.status);
  }

  const payload = (await uploadResponse.json()) as { upload_url?: string };

  if (!payload.upload_url) {
    throw new AppError("AssemblyAI did not return an upload URL.", 502);
  }

  return payload.upload_url;
};

const createAssemblyTranscript = async (uploadUrl: string, language: string) => {
  const assemblyLanguageCode = mapAssemblyLanguageCode(language);
  const transcriptResponse = await fetch(ASSEMBLYAI_TRANSCRIPT_URL, {
    method: "POST",
    headers: {
      Authorization: env.ASSEMBLYAI_API_KEY as string,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      ...(assemblyLanguageCode ? { language_code: assemblyLanguageCode } : { language_detection: true })
    })
  });

  if (!transcriptResponse.ok) {
    const errorText = await transcriptResponse.text();
    throw new AppError(`AssemblyAI transcription request failed: ${errorText}`, transcriptResponse.status);
  }

  const payload = (await transcriptResponse.json()) as { id?: string };

  if (!payload.id) {
    throw new AppError("AssemblyAI did not return a transcript id.", 502);
  }

  return payload.id;
};

const pollAssemblyTranscript = async (transcriptId: string): Promise<TranscriptionResult> => {
  const deadline = Date.now() + ASSEMBLYAI_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const pollResponse = await fetch(`${ASSEMBLYAI_TRANSCRIPT_URL}/${transcriptId}`, {
      headers: {
        Authorization: env.ASSEMBLYAI_API_KEY as string
      }
    });

    if (!pollResponse.ok) {
      const errorText = await pollResponse.text();
      throw new AppError(`AssemblyAI polling failed: ${errorText}`, pollResponse.status);
    }

    const payload = (await pollResponse.json()) as { status?: string; text?: string; error?: string };

    if (payload.status === "completed") {
      return {
        text: payload.text ?? ""
      };
    }

    if (payload.status === "error") {
      throw new AppError(payload.error || "AssemblyAI transcription failed.", 502);
    }

    await sleep(ASSEMBLYAI_POLL_INTERVAL_MS);
  }

  throw new AppError("AssemblyAI transcription timed out.", 504);
};

const transcribeWithAssemblyAI = async (audioBuffer: Buffer, language: string): Promise<TranscriptionResult> => {
  if (!env.ASSEMBLYAI_API_KEY) {
    throw new AppError("AssemblyAI transcription is not configured on the server.", 500);
  }

  const uploadUrl = await uploadToAssemblyAI(audioBuffer);
  const transcriptId = await createAssemblyTranscript(uploadUrl, language);
  return pollAssemblyTranscript(transcriptId);
};

export const createAssemblyStreamingTokenController = asyncHandler(async (request, response) => {
  if (!env.ASSEMBLYAI_API_KEY) {
    throw new AppError("AssemblyAI transcription is not configured on the server.", 500);
  }

  const expiresInSeconds = Math.max(
    1,
    Math.min(600, Number.parseInt(String(request.query.expiresInSeconds ?? "300"), 10) || 300)
  );
  const maxSessionDurationSeconds = Math.max(
    60,
    Math.min(10_800, Number.parseInt(String(request.query.maxSessionDurationSeconds ?? "1800"), 10) || 1800)
  );

  const tokenUrl = new URL(ASSEMBLYAI_STREAMING_TOKEN_URL);
  tokenUrl.searchParams.set("expires_in_seconds", String(expiresInSeconds));
  tokenUrl.searchParams.set("max_session_duration_seconds", String(maxSessionDurationSeconds));

  const tokenResponse = await fetch(tokenUrl, {
    headers: {
      Authorization: env.ASSEMBLYAI_API_KEY
    }
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new AppError(`AssemblyAI token generation failed: ${errorText}`, tokenResponse.status);
  }

  const payload = (await tokenResponse.json()) as { token?: string; expires_in_seconds?: number };

  if (!payload.token) {
    throw new AppError("AssemblyAI did not return a streaming token.", 502);
  }

  response.status(200).json({
    token: payload.token,
    expiresInSeconds: payload.expires_in_seconds ?? expiresInSeconds
  });
});

export const createTranscriptionController = asyncHandler(async (request, response) => {
  const audioBuffer = request.body;

  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new AppError("Audio payload is required for transcription.", 400);
  }

  const language = typeof request.query.language === "string" ? request.query.language : "en-US";
  const mimeType = request.header("content-type") || "audio/webm";
  const useAssemblyAI = env.TRANSCRIPTION_PROVIDER === "assemblyai";

  const payload = useAssemblyAI
    ? await transcribeWithAssemblyAI(audioBuffer, language)
    : await transcribeWithOpenAI(audioBuffer, mimeType, language);

  response.status(200).json(payload);
});
