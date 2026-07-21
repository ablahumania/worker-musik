import Groq from "groq-sdk";

// Collect all available API keys from env
const API_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
].filter(Boolean);

// Fallback: also support single GROQ_API_KEY for backward compat
if (API_KEYS.length === 0 && process.env.GROQ_API_KEY) {
  API_KEYS.push(process.env.GROQ_API_KEY);
}

if (API_KEYS.length === 0) {
  console.warn("[Whisper] No GROQ_API_KEY found! Whisper transcription will fail.");
}

let currentIndex = 0;
const keyFailures = new Map(); // track consecutive failures per key
const MAX_FAILURESBeforeSkip = 3;

function getNextClient() {
  if (API_KEYS.length === 0) {
    throw new Error("No GROQ_API_KEY configured. Add GROQ_API_KEY_1, GROQ_API_KEY_2, etc. to .env");
  }

  // Find next key that hasn't failed too many times
  const startIndex = currentIndex;
  let attempts = 0;

  while (attempts < API_KEYS.length) {
    const key = API_KEYS[currentIndex];
    const failures = keyFailures.get(currentIndex) || 0;

    if (failures < MAX_FAILURESBeforeSkip) {
      const client = new Groq({ apiKey: key });
      const idx = currentIndex;
      // Advance for next call
      currentIndex = (currentIndex + 1) % API_KEYS.length;
      return { client, keyIndex: idx };
    }

    currentIndex = (currentIndex + 1) % API_KEYS.length;
    attempts++;
  }

  // All keys exhausted — reset failures and try the first one
  console.log("[Whisper] All keys exhausted, resetting failure counts");
  keyFailures.clear();
  currentIndex = startIndex;
  const client = new Groq({ apiKey: API_KEYS[currentIndex] });
  const idx = currentIndex;
  currentIndex = (currentIndex + 1) % API_KEYS.length;
  return { client, keyIndex: idx };
}

function markKeyFailed(keyIndex) {
  const failures = (keyFailures.get(keyIndex) || 0) + 1;
  keyFailures.set(keyIndex, failures);
  console.log(`[Whisper] Key #${keyIndex + 1} failed (${failures}/${MAX_FAILURESBeforeSkip} before skip)`);
}

function markKeySuccess(keyIndex) {
  keyFailures.set(keyIndex, 0);
}

function isRateLimitError(err) {
  return err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("rate limit");
}

function isTokenLimitError(err) {
  const msg = err?.message?.toLowerCase() || "";
  return msg.includes("token") && (msg.includes("limit") || msg.includes("exceed"));
}

function isLatinText(text) {
  const latinChars = text.replace(/[\s\d.,!?'"():;-]/g, "");
  if (latinChars.length === 0) return true;
  const latinCount = [...latinChars].filter((c) => c.charCodeAt(0) <= 0x024F).length;
  return latinCount / latinChars.length > 0.7;
}

async function doTranscribe(client, audioFile, language) {
  const opts = {
    file: audioFile,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  };
  if (language) opts.language = language;
  return client.audio.transcriptions.create(opts);
}

async function transcribeWithRetry(audioFile, title, language, maxRetries = API_KEYS.length + 1) {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { client, keyIndex } = getNextClient();

    try {
      console.log(`[Whisper] Transcribing with key #${keyIndex + 1} (attempt ${attempt + 1})...`);
      const result = await doTranscribe(client, audioFile, language);
      markKeySuccess(keyIndex);
      return result;
    } catch (err) {
      lastError = err;
      markKeyFailed(keyIndex);

      if (isRateLimitError(err)) {
        console.log(`[Whisper] Rate limited on key #${keyIndex + 1}, rotating to next key...`);
        continue;
      }

      if (isTokenLimitError(err)) {
        console.log(`[Whisper] Token limit hit on key #${keyIndex + 1}, rotating to next key...`);
        continue;
      }

      // For other errors (network, 500, etc), also retry with next key
      console.log(`[Whisper] Error on key #${keyIndex + 1}: ${err.message}`);
      if (attempt < maxRetries - 1) {
        continue;
      }
    }
  }

  throw lastError;
}

export async function transcribeAudio(audioUrl, title) {
  console.log(`[Whisper] Downloading audio: ${title}`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Groq has a 25MB file size limit
  const MAX_SIZE = 25 * 1024 * 1024;
  if (buffer.length > MAX_SIZE) {
    console.log(`[Whisper] Audio too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB), splitting...`);
    // For now, just try with the full file — Groq might still accept it
    // A proper implementation would split the audio into chunks
  }

  const audioFile = new File([buffer], `${title}.mp3`, { type: "audio/mpeg" });

  console.log(`[Whisper] Transcribing with Groq Whisper (${API_KEYS.length} keys available, language: id)...`);
  let transcription = await transcribeWithRetry(audioFile, title, "id");

  const detectedLang = transcription.language || "id";
  console.log(`[Whisper] Detected language: ${detectedLang}`);

  if (!isLatinText(transcription.text || "")) {
    console.log(`[Whisper] Non-Latin result detected, retrying with English...`);
    transcription = await transcribeWithRetry(audioFile, title, "en");
  }

  console.log(
    `[Whisper] Transcription complete: ${transcription.segments?.length || 0} segments`
  );

  const timestamps = (transcription.segments || []).map((seg) => ({
    time: seg.start,
    text: seg.text.trim(),
  }));

  return {
    content: transcription.text || "",
    timestamps: timestamps.length > 0 ? timestamps : undefined,
    language: transcription.language || undefined,
  };
}
