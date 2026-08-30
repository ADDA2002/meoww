interface CobaltResponse {
  status: "tunnel" | "redirect" | "picker" | "error";
  url?: string;
  filename?: string;
  error?: { code: string; message?: string };
}

interface Mp3Result {
  url: string;
  filename: string;
}

/**
 * Converts a YouTube (or other video) URL into a direct MP3 stream URL
 * using the free cobalt.tools API.
 *
 * Returns { url, filename } where url is a tunneled MP3 link ready to be
 * added to the queue, or throws on failure.
 */
export async function fetchMp3FromYouTube(youtubeUrl: string): Promise<Mp3Result> {
  const trimmed = youtubeUrl.trim();
  if (!trimmed) {
    throw new Error("Please paste a YouTube URL.");
  }

  // YouTube URL sanity check
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//i.test(trimmed)) {
    throw new Error("That doesn't look like a YouTube URL.");
  }

  // Try multiple cobalt instances (free public ones) as fallback
  const instances = [
    "https://api.cobalt.tools/",
    "https://co.wuk.sh/",
    "https://api.dvon.dev/",
  ];

  const payload = {
    url: trimmed,
    vQuality: "128",          // not used for audio-only but required
    aFormat: "mp3",
    isAudioOnly: true,
    filenameStyle: "classic",
  };

  let lastError: string = "All download services are currently unavailable.";

  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}api/json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        lastError = `Server responded with ${res.status}.`;
        continue;
      }

      const data: CobaltResponse = await res.json();

      if (data.status === "error") {
        lastError = data.error?.message || "Conversion failed.";
        continue;
      }

      if ((data.status === "tunnel" || data.status === "redirect") && data.url) {
        // Pull a nice filename from the cobalt-provided one if present
        const fname = data.filename?.replace(/\.[^/.]+$/, "") || "YouTube Audio";
        return { url: data.url, filename: fname };
      }

      lastError = "Unexpected response from server.";
    } catch (err) {
      lastError = "Network error while reaching the download service.";
      continue;
    }
  }

  throw new Error(lastError);
}