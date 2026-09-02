const FIREBASE_DB_URL = "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app";

export async function onRequestPost({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return json({ error: 'Expected multipart/form-data' }, 400, corsHeaders);
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return json({ error: 'Missing file field' }, 400, corsHeaders);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName.toLowerCase().endsWith('.mp3')) {
    return json({ error: 'Only MP3 files are allowed' }, 400, corsHeaders);
  }

  const arrayBuf = await file.arrayBuffer();
  const base64Content = arrayBufferToBase64(arrayBuf);

  try {
    // 1) Upload MP3 to GitHub
    const ghRes = await ghPutFile(env, `songs/${safeName}`, base64Content, `Add ${safeName}`);
    const fileSha = ghRes.content?.sha;

    // 2) Get current songs to determine next id
    const fbListRes = await fetch(`${FIREBASE_DB_URL}/songs.json`);
    const fbList = fbListRes.ok ? await fbListRes.json() : null;
    const songs = fbList ? Object.values(fbList).filter(Boolean) : [];
    const nextId = String(songs.length > 0
      ? Math.max(...songs.map((s) => parseInt(s?.id, 10) || 0)) + 1
      : 1);

    const track = {
      id: nextId,
      title: prettyTitle(safeName.replace(/\.mp3$/i, '')),
      artist: 'Unknown Artist',
      url: `https://raw.githubusercontent.com/ADDA2002/Music-Storage-Folder/main/songs/${encodeURIComponent(safeName)}`,
      sha: fileSha,
      addedAt: Date.now(),
    };

    // 3) Write to Firebase — instant in the app
    const fbRes = await fetch(`${FIREBASE_DB_URL}/songs/${nextId}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    if (!fbRes.ok) {
      const err = await fbRes.text();
      throw new Error(`Firebase write failed: ${fbRes.status} ${err}`);
    }

    return json({ ok: true, file: safeName, id: nextId }, 200, corsHeaders);
  } catch (err) {
    return json({ error: err.message || 'Upload failed' }, 500, corsHeaders);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function prettyTitle(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

async function ghGetFile(env, path) {
  const res = await fetch(
    `https://api.github.com/repos/ADDA2002/Music-Storage-Folder/contents/${path}?ref=main`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  return res.json();
}

async function ghPutFile(env, path, base64Content, message) {
  const existing = await ghGetFile(env, path);
  const body = { message, content: base64Content, branch: 'main' };
  if (existing?.sha) body.sha = existing.sha;
  const res = await fetch(
    `https://api.github.com/repos/ADDA2002/Music-Storage-Folder/contents/${path}`,
    { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(body) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`GitHub PUT ${path} failed: ${res.status} ${err.message || ''}`);
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

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
