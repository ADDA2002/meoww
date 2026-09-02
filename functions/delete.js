const FIREBASE_DB_URL = "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app";
const GITHUB_REPO = "ADDA2002/Music-Storage-Folder";
const GITHUB_BRANCH = "main";

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get("trackId");

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!trackId) {
    return json({ error: "Missing trackId" }, 400, corsHeaders);
  }

  try {
    // 1. Get the song metadata from Firebase to find the URL
    const fbRes = await fetch(`${FIREBASE_DB_URL}/songs/${trackId}.json`);
    if (!fbRes.ok) throw new Error("Song not found in Firebase");
    const song = await fbRes.json();
    if (!song) return json({ ok: true, deleted: false }, 200, corsHeaders);

    // 2. Delete the MP3 from GitHub
    if (song.url) {
      const fileName = song.url.split('/songs/')[1]?.split('?')[0];
      if (fileName) {
        const path = `songs/${decodeURIComponent(fileName)}`;
        const meta = await ghGetFile(env, path);
        if (meta?.sha) {
          await ghDeleteFile(env, path, meta.sha);
        }
      }
    }

    // 3. Delete from Firebase
    await fetch(`${FIREBASE_DB_URL}/songs/${trackId}.json`, { method: "DELETE" });

    return json({ ok: true, trackId }, 200, corsHeaders);
  } catch (err) {
    return json({ error: err.message || "Delete failed" }, 500, corsHeaders);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function ghGetFile(env, path) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  return res.json();
}

async function ghDeleteFile(env, path, sha) {
  const body = { message: `Delete ${path}`, sha, branch: GITHUB_BRANCH };
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
    { method: "DELETE", headers: ghHeaders(env), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${err.message || ''}`);
  }
  return res.json();
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'meoww-pages-function',
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
