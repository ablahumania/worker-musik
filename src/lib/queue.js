import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { processLyrics } from "./lyrics-pipeline.js";

function createRedisConnection() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
  }

  const hostname = new URL(url).hostname;

  return new IORedis({
    host: hostname,
    port: 6379,
    password: token,
    tls: {},
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const connection = createRedisConnection();

export const lyricsQueue = new Queue("lyrics", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export function createLyricsWorker() {
  const workerConnection = createRedisConnection();

  const worker = new Worker(
    "lyrics",
    async (job) => {
      const { songId, artist, title, duration, audioUrl } = job.data;
      console.log(`[Worker] Processing job ${job.id}: "${title}" by "${artist}"`);

      try {
        const result = await processLyrics(songId, {
          artist,
          title,
          duration,
          audioUrl,
        });

        if (result) {
          console.log(`[Worker] Job ${job.id} completed`);
          return { success: true, lyricsId: result };
        } else {
          console.log(`[Worker] Job ${job.id}: no lyrics found`);
          return { success: false, reason: "not_found" };
        }
      } catch (err) {
        console.error(`[Worker] Job ${job.id} failed:`, err.message);
        throw err;
      }
    },
    {
      connection: workerConnection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} finished`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
