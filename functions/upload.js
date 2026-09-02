const GITHUB_REPO = "ADDA2002/Music-Storage-Folder";
const GITHUB_BRANCH = "main";
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
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return new Response(JSON.stringify({ error: 'Missing file field' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName.toLowerCase().endsWith('.mp3')) {
    return new Response(JSON.stringify({ error: 'Only MP3 files are allowed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const arrayBuf = await file.arrayBuffer();
  const base64Content = arrayBufferToBase64(arrayBuf);

  try {
    // Upload MP3 to GitHub
    await ghPutFile(env, `songs/${safeName}`, base64Content, `Add ${safeName}`);

    // Get songs.json
    const songsMeta = await ghGetFile(env, 'songs.json');
    const songs = songsMeta?.content ? JSON.parse(base64ToString(songsMeta.content)) : [];
    const songsSha = songsMeta?.sha;

    // Check if already in playlist
    const url = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/songs/${encodeURIComponent(safeName)}`;
    const existing = songs.find((s) => s.url === url);
    if (existing) {
      // Backfill Firebase if it's missing
      try {
        const fbCheck = await fetch(`${FIREBASE_DB_URL}/songs/${existing.id}.json`);
        if (fbCheck.status === 404) {
          await fetch(`${FIREBASE_DB_URL}/songs/${existing.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existing),
          });
        }
      } catch (_) { /* best-effort */ }
      return new Response(JSON.stringify({ skipped: true, reason: 'already in playlist', file: safeName, songsCount: songs.length }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add new track
    const nextId = String(
      songs.length > 0 ? Math.max(...songs.map((s) => parseInt(s.id, 10) || 0)) + 1 : 1
    );
    const covers = [
      'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=300&q=80',
      'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80',
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=300&q=80',
      'https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=300&q=80',
      'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80',
    ];
    const newTrack = {
      id: nextId,
      title: prettyTitle(safeName.replace(/\.mp3$/i, '')),
      artist: 'Unknown Artist',
      url: url,
      cover: covers[Math.floor(Math.random() * covers.length)],
      addedAt: Date.now(),
    };
    songs.push(newTrack);

    const jsonContent = btoa(unescape(encodeURIComponent(JSON.stringify(songs, null, 2))));
    await ghPutFileRaw(env, 'songs.json', jsonContent, `Add ${safeName} to playlist`, songsSha);

    // Write song metadata to Firebase Realtime Database (no auth — public DB)
    try {
      const fbRes = await fetch(`${FIREBASE_DB_URL}/songs/${nextId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTrack),
      });
      if (!fbRes.ok) {
        const fbErr = await fbRes.text();
        console.error('Firebase write failed:', fbRes.status, fbErr);
      }
    } catch (fbErr) {
      console.error('Firebase write error:', fbErr);
    }

    return new Response(JSON.stringify({ ok: true, file: safeName, songsCount: songs.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Upload failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${GITHUB_BRANCH}`,
    { headers: ghHeaders(env) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  return res.json();
}

async function ghPutFile(env, path, base64Content, message) {
  const existing = await ghGetFile(env, path);
  return ghPutFileRaw(env, path, base64Content, message, existing?.sha);
}

async function ghPutFileRaw(env, path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
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

function base64ToString(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
