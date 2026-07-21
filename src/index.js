import "dotenv/config";
import { createLyricsWorker } from "./lib/queue.js";

console.log("[Worker] Starting lyrics worker...");
console.log(`[Worker] Convex URL: ${process.env.CONVEX_URL}`);
const keyCount = [process.env.GROQ_API_KEY_1, process.env.GROQ_API_KEY_2, process.env.GROQ_API_KEY_3].filter(Boolean).length;
console.log(`[Worker] Groq API keys: ${keyCount > 0 ? `${keyCount} configured` : "NOT SET"}`);
console.log(`[Worker] Redis: ${process.env.REDIS_URL || "redis://localhost:6379"}`);

const worker = createLyricsWorker();

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
});

console.log("[Worker] Ready and listening for lyrics jobs");
