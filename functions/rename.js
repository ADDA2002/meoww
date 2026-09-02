const FIREBASE_DB_URL = "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app";
const GITHUB_REPO = "ADDA2002/Music-Storage-Folder";
const GITHUB_BRANCH = "main";

function prettyTitle(slug) {
  return slug.replace(/\.mp3$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const trackId = url.searchParams.get("trackId");
  const oldFileName = url.searchParams.get("oldFileName");
  const newFileName = (url.searchParams.get("newFileName") || "").trim().replace(/\.mp3$/i, "") + ".mp3";

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (!trackId || !oldFileName || !newFileName) {
    return json({ error: "Missing trackId, oldFileName, or newFileName" }, 400, corsHeaders);
  }

  try {
    const oldPath = `songs/${decodeURIComponent(oldFileName)}`;
    const newPath = `songs/${encodeURIComponent(newFileName)}`;

    // 1. Get old file SHA + download
    const metaRes = await ghGetFile(env, oldPath);
    if (!metaRes) throw new Error("File not found on GitHub");
    const oldSha = metaRes.sha;

    // 2. Upload with new name (reuses same content)
    await ghPutFileRaw(env, newPath, metaRes.content, `Rename ${oldFileName} to ${newFileName}`);

    // 3. Delete old file
    await ghDeleteFile(env, oldPath, oldSha);

    // 4. Update Firebase
    const newUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${newPath}`;
    await fetch(`${FIREBASE_DB_URL}/songs/${trackId}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: prettyTitle(newFileName), url: newUrl }),
    });

    return json({ ok: true, oldFileName, newFileName, trackId }, 200, corsHeaders);
  } catch (err) {
    return json({ error: err.message || "Rename failed" }, 500, corsHeaders);
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

async function ghPutFileRaw(env, path, base64Content, message) {
  const existing = await ghGetFile(env, path);
  const body = { message, content: base64Content, branch: GITHUB_BRANCH };
  if (existing?.sha) body.sha = existing.sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
    { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${err.message || ''}`);
  }
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
