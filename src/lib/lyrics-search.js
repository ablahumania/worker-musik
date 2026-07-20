function parseLRC(lrc) {
  const lines = lrc.split("\n");
  const result = [];

  for (const line of lines) {
    const matches = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (matches) {
      const minutes = parseInt(matches[1], 10);
      const seconds = parseInt(matches[2], 10);
      const rawMs = matches[3];
      const centis =
        rawMs.length === 2 ? parseInt(rawMs, 10) * 10 : parseInt(rawMs, 10);
      const time = minutes * 60 + seconds + centis / 1000;
      const text = matches[4].trim();
      if (text.length > 0) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

function cleanTitle(title) {
  return title
    .replace(/\s*\(.*?demo.*?\)\s*/gi, " ")
    .replace(/\s*\[.*?demo.*?\]\s*/gi, " ")
    .replace(/\s*\(.*?guide.*?\)\s*/gi, " ")
    .replace(/\s*\[.*?guide.*?\]\s*/gi, " ")
    .replace(/\s*\(.*?version.*?\)\s*/gi, " ")
    .replace(/\s*\[.*?version.*?\]\s*/gi, " ")
    .replace(/\s*V\.\d+\s*/gi, " ")
    .replace(/\s*-\s*Copy\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtist(artist) {
  return artist
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function lrclibGet(artist, trackName, duration) {
  const params = { artist, track_name: trackName };
  if (duration) params.duration = String(Math.round(duration));

  try {
    const res = await fetch(
      `https://lrclib.net/api/get?${new URLSearchParams(params).toString()}`,
      { headers: { "User-Agent": "MusicPlayer/1.0" } }
    );

    if (res.status === 429) {
      console.log(`[lrclib] Rate limited, waiting 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
      return null;
    }

    if (!res.ok) return null;
    const data = await res.json();

    if (data.syncedLyrics) {
      return {
        content: data.plainLyrics || "",
        timestamps: parseLRC(data.syncedLyrics),
        language: data.language || undefined,
      };
    }

    if (data.plainLyrics) {
      return { content: data.plainLyrics, language: data.language || undefined };
    }

    return null;
  } catch {
    return null;
  }
}

async function lrclibSearch(query) {
  try {
    const res = await fetch(
      `https://lrclib.net/api/search?${new URLSearchParams({ q: query }).toString()}`,
      { headers: { "User-Agent": "MusicPlayer/1.0" } }
    );

    if (res.status === 429) {
      console.log(`[lrclib] Rate limited on search, waiting 3s...`);
      await new Promise((r) => setTimeout(r, 3000));
      return null;
    }

    if (!res.ok) return null;
    const results = await res.json();

    if (!Array.isArray(results) || results.length === 0) return null;

    const best = results[0];
    if (best.syncedLyrics) {
      return {
        content: best.plainLyrics || "",
        timestamps: parseLRC(best.syncedLyrics),
        language: best.language || undefined,
      };
    }

    if (best.plainLyrics) {
      return { content: best.plainLyrics, language: best.language || undefined };
    }

    return null;
  } catch {
    return null;
  }
}

export async function searchLyrics({ artist, title, duration }) {
  const clean = cleanTitle(title);
  const cleanArt = cleanArtist(artist);

  // Try exact match with cleaned title
  let result = await lrclibGet(cleanArt, clean, duration);
  if (result) return { ...result, source: "searched" };

  // Try exact match with original title
  if (clean !== title) {
    result = await lrclibGet(artist, title, duration);
    if (result) return { ...result, source: "searched" };
  }

  // Try without duration
  result = await lrclibGet(cleanArt, clean);
  if (result) return { ...result, source: "searched" };

  // Try search endpoint with cleaned query
  result = await lrclibSearch(`${cleanArt} ${clean}`);
  if (result) return { ...result, source: "searched" };

  // Try search with original
  if (clean !== title || cleanArt !== artist) {
    result = await lrclibSearch(`${artist} ${title}`);
    if (result) return { ...result, source: "searched" };
  }

  return null;
}
