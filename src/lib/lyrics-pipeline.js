import { searchLyrics } from "./lyrics-search.js";
import { transcribeAudio } from "./groq-whisper.js";
import { getLyrics, saveLyrics } from "./convex-client.js";

export async function processLyrics(songId, { artist, title, duration, audioUrl }) {
  console.log(`[Lyrics] Processing: "${title}" by "${artist}" (${songId})`);

  // 1. Check if lyrics already exist
  const existing = await getLyrics(songId);
  if (existing) {
    console.log(`[Lyrics] Already exists, skipping`);
    return existing;
  }

  // 2. Search lrclib.net
  console.log(`[Lyrics] Searching lrclib.net...`);
  const lrclibResult = await searchLyrics({ artist, title, duration });

  if (lrclibResult) {
    console.log(`[Lyrics] Found on lrclib.net (${lrclibResult.timestamps ? "synced" : "plain"})`);
    const id = await saveLyrics({
      songId,
      content: lrclibResult.content,
      timestamps: lrclibResult.timestamps,
      language: lrclibResult.language,
      source: lrclibResult.source,
    });
    console.log(`[Lyrics] Saved to DB: ${id}`);
    return id;
  }

  // 3. Fallback: Groq Whisper
  if (!audioUrl) {
    console.log(`[Lyrics] No audio URL, cannot use Whisper fallback`);
    return null;
  }

  if (!process.env.GROQ_API_KEY_1 && !process.env.GROQ_API_KEY_2 && !process.env.GROQ_API_KEY_3 && !process.env.GROQ_API_KEY) {
    console.log(`[Lyrics] No GROQ_API_KEY found, cannot use Whisper fallback`);
    return null;
  }

  try {
    console.log(`[Lyrics] Falling back to Groq Whisper...`);
    const whisperResult = await transcribeAudio(audioUrl, title);
    console.log(
      `[Whisper] Result: ${whisperResult.timestamps?.length || 0} timestamped lines`
    );

    const id = await saveLyrics({
      songId,
      content: whisperResult.content,
      timestamps: whisperResult.timestamps,
      language: whisperResult.language,
      source: "whisper",
    });
    console.log(`[Lyrics] Saved to DB: ${id}`);
    return id;
  } catch (err) {
    console.error(`[Whisper] Failed:`, err.message);
    return null;
  }
}
