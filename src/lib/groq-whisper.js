import Groq from "groq-sdk";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

let groqClient = null;

function getClient() {
  if (!groqClient) {
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is required for Whisper transcription");
    }
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

function isLatinText(text) {
  const latinChars = text.replace(/[\s\d.,!?'"():;-]/g, "");
  if (latinChars.length === 0) return true;
  const latinCount = [...latinChars].filter((c) => c.charCodeAt(0) <= 0x024F).length;
  return latinCount / latinChars.length > 0.7;
}

async function doTranscribe(audioFile, language) {
  const client = getClient();
  const opts = {
    file: audioFile,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  };
  if (language) opts.language = language;
  return client.audio.transcriptions.create(opts);
}

export async function transcribeAudio(audioUrl, title) {
  console.log(`[Whisper] Downloading audio: ${title}`);

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const audioFile = new File([buffer], `${title}.mp3`, { type: "audio/mpeg" });

  console.log(`[Whisper] Transcribing with Groq Whisper (language: id)...`);
  let transcription = await doTranscribe(audioFile, "id");

  const detectedLang = transcription.language || "id";
  console.log(`[Whisper] Detected language: ${detectedLang}`);

  if (!isLatinText(transcription.text || "")) {
    console.log(`[Whisper] Non-Latin result detected, retrying with English...`);
    transcription = await doTranscribe(audioFile, "en");
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
