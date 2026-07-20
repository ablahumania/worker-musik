import "dotenv/config";
import { processLyrics } from "../lib/lyrics-pipeline.js";

const songId = process.argv[2];
const artist = process.argv[3];
const title = process.argv[4];
const duration = parseInt(process.argv[5] || "0", 10);
const audioUrl = process.argv[6] || "";

if (!songId || !artist || !title) {
  console.log("Usage: node process-lyrics.js <songId> <artist> <title> [duration] [audioUrl]");
  console.log("Example: node process-lyrics.js abc123 KALLA Nak 213 https://...");
  process.exit(1);
}

console.log(`Processing: "${title}" by "${artist}"`);
console.log(`Song ID: ${songId}`);
console.log(`Duration: ${duration}s`);
console.log(`Audio URL: ${audioUrl || "none"}`);
console.log("---");

try {
  const result = await processLyrics(songId, {
    artist,
    title,
    duration,
    audioUrl,
  });

  if (result) {
    console.log(`\nSuccess! Lyrics saved: ${result}`);
  } else {
    console.log(`\nNo lyrics found for this song.`);
  }
} catch (err) {
  console.error(`\nError:`, err.message);
  process.exit(1);
}
