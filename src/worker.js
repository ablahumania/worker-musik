import "dotenv/config";
import { processLyrics } from "./lib/lyrics-pipeline.js";

const POLL_INTERVAL = 15000;
const MAX_BACKOFF = 300000; // 5 minutes max
const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is required");
}

let consecutiveErrors = 0;

async function convexQuery(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Query failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.value;
}

async function convexMutation(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Mutation failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.value;
}

async function poll() {
  try {
    const songsWithoutLyrics = await convexQuery("lyrics:getSongsWithoutLyrics", {});

    if (!songsWithoutLyrics || songsWithoutLyrics.length === 0) {
      consecutiveErrors = 0;
      return;
    }

    console.log(`[Worker] Found ${songsWithoutLyrics.length} song(s) without lyrics`);

    for (const song of songsWithoutLyrics) {
      console.log(`[Worker] Processing: "${song.title}" by "${song.artist}"`);
      try {
        const result = await processLyrics(song.songId, {
          artist: song.artist,
          title: song.title,
          duration: song.duration,
          audioUrl: song.audioUrl,
        });
        if (result) {
          console.log(`[Worker] Done: "${song.title}"`);
        } else {
          console.log(`[Worker] No lyrics found: "${song.title}"`);
        }
      } catch (err) {
        console.error(`[Worker] Failed: "${song.title}" —`, err.message);
      }
      // Pause between songs to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    const backoff = Math.min(POLL_INTERVAL * Math.pow(2, consecutiveErrors), MAX_BACKOFF);
    console.error(`[Worker] Poll error (${consecutiveErrors}):`, err.message);
    console.log(`[Worker] Retrying in ${Math.round(backoff / 1000)}s...`);
    await new Promise((r) => setTimeout(r, backoff));
  }
}

console.log("[Worker] Starting lyrics worker (Convex polling mode)...");
console.log(`[Worker] Convex URL: ${CONVEX_URL}`);
console.log(`[Worker] Groq API: ${process.env.GROQ_API_KEY ? "configured" : "NOT SET"}`);
console.log(`[Worker] Poll interval: ${POLL_INTERVAL}ms`);

async function run() {
  while (true) {
    await poll();
    if (consecutiveErrors === 0) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }
  }
}

run();
