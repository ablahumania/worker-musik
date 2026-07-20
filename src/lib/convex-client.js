const CONVEX_URL = process.env.CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error("CONVEX_URL is required");
}

export async function queryFn(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex query failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.value;
}

export async function mutationFn(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Convex mutation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.value;
}

export async function getLyrics(songId) {
  return queryFn("lyrics:getLyrics", { songId });
}

export async function saveLyrics({
  songId,
  content,
  timestamps,
  language,
  source,
}) {
  return mutationFn("lyrics:saveLyrics", {
    songId,
    content,
    timestamps,
    language,
    source,
  });
}

export async function getSongById(songId) {
  return queryFn("songs:getSongById", { songId });
}

export async function getAllSongs(userId) {
  return queryFn("songs:getUserSongs", { userId });
}
