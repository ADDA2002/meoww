import { useState, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, get } from "firebase/database";
import { Upload, Music, CheckCircle, XCircle, Loader } from "lucide-react";

// Firebase config (same as main app)
const firebaseConfig = {
  apiKey: "AIzaSyC-a_AcGt2LJ3A6O0gyKBI6wg_FfJRyP30",
  authDomain: "meoww-audio.firebaseapp.com",
  databaseURL: "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "meoww-audio",
  storageBucket: "meoww-audio.firebasestorage.app",
  messagingSenderId: "768504750699",
  appId: "1:768504750699:web:fe655aaa0435aa1c04072e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Upload endpoint â€” our Cloudflare Worker that pushes to GitHub
const UPLOAD_API = "https://meoww-upload-worker.<your-subdomain>.workers.dev/upload";

const GITHUB_REPO = "ADDA2002/Music-Storage-Folder";

type FileStatus = "queued" | "uploading" | "done" | "error";

interface FileItem {
  file: File;
  status: FileStatus;
  message: string;
}

function prettyTitle(name: string): string {
  return name
    .replace(/\.mp3$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function randomCover(): string {
  const covers = [
    "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=300&q=80",
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80",
    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=300&q=80",
    "https://images.unsplash.com/photo-1483412033650-1015ddeb83d1?auto=format&fit=crop&w=300&q=80",
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=300&q=80",
  ];
  return covers[Math.floor(Math.random() * covers.length)];
}

export default function Upload() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get the next numeric ID for the song
  const getNextId = useCallback(async () => {
    try {
      const snap = await get(ref(db, "songs"));
      if (snap.exists()) {
        const data = snap.val();
        const ids = Object.values(data)
          .map((s: { id?: string }) => parseInt(s.id || "0"))
          .filter(n => !isNaN(n));
        return ids.length > 0 ? Math.max(...ids) + 1 : 1;
      }
      return 1;
    } catch {
      return null;
    }
  }, []);

  const uploadFiles = useCallback(async (files: File[]) => {
    const mp3s = files.filter(f =>
      f.type === "audio/mpeg" ||
      f.type === "audio/mp3" ||
      /\.mp3$/i.test(f.name)
    );

    if (mp3s.length === 0) return;

    const newItems: FileItem[] = mp3s.map(f => ({ file: f, status: "queued", message: "" }));
    const baseIdx = items.length;
    setItems(prev => [...prev, ...newItems]);

    const startId = await getNextId();

    for (let i = 0; i < mp3s.length; i++) {
      const item = newItems[i];
      const idx = baseIdx + i;
      const songId = startId !== null ? String(startId + i) : String(idx + 1);

      setItems(prev => prev.map((it, j) =>
        j === idx ? { ...it, status: "uploading", message: "uploading..." } : it
      ));

      try {
        // Step 1: Upload MP3 to GitHub via Worker
        const formData = new FormData();
        formData.append("file", item.file);

        const res = await fetch(UPLOAD_API, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        // Get the raw GitHub URL for the uploaded file
        const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/songs/${encodeURIComponent(safeName)}`;

        // Step 2: Write song metadata to Firebase
        await push(ref(db, "songs"), {
          id: songId,
          title: prettyTitle(item.file.name),
          artist: "Unknown Artist",
          url: rawUrl,
          cover: randomCover(),
          addedAt: Date.now(),
        });

        setItems(prev => prev.map((it, j) =>
          j === idx ? { ...it, status: "done", message: `âœ“ #${songId} added` } : it
        ));
      } catch (err) {
        setItems(prev => prev.map((it, j) =>
          j === idx ? { ...it, status: "error", message: String(err) } : it
        ));
      }
    }
  }, [items.length, getNextId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  }, [uploadFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    void uploadFiles(Array.from(e.target.files));
    e.target.value = "";
  }, [uploadFiles]);

  const handleClear = () => setItems([]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <span className="font-bold tracking-widest uppercase text-lg">Meoww</span>
        <a href="/" className="text-xs font-mono text-white/40 hover:text-white/70 transition-colors">
          â† Back to app
        </a>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-center mb-2">Upload Songs</h1>
          <p className="text-white/50 text-sm text-center mb-8">
            Drop MP3 files â€” they'll be added to the shared playlist
          </p>

          {/* Drop zone */}
          <div
            className={`
              border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
              ${dragOver
                ? "border-white bg-white/5"
                : "border-white/20 hover:border-white/40 bg-white/[0.02]"
              }
            `}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="audio/mpeg,audio/mp3,.mp3"
              className="hidden"
              onChange={handleFileInput}
            />
            <Music className="w-10 h-10 mx-auto mb-3 text-white/40" />
            <p className="font-semibold mb-1">Drop MP3 files here</p>
            <p className="text-white/40 text-sm">or click to browse</p>
          </div>

          {/* File list */}
          {items.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  {items.length} file{items.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={handleClear}
                  className="text-xs font-mono text-white/40 hover:text-white/70 transition-colors"
                >
                  Clear
                </button>
              </div>
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-lg"
                >
                  {item.status === "uploading" ? (
                    <Loader className="w-4 h-4 text-yellow-400 animate-spin flex-shrink-0" />
                  ) : item.status === "done" ? (
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                  ) : item.status === "error" ? (
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  ) : (
                    <Music className="w-4 h-4 text-white/30 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{item.file.name}</span>
                  <span className={`text-xs font-mono flex-shrink-0 ${
                    item.status === "done" ? "text-green-400" :
                    item.status === "error" ? "text-red-400" :
                    item.status === "uploading" ? "text-yellow-400" : "text-white/30"
                  }`}>
                    {item.message || item.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/5 py-4 text-center text-xs text-white/20 font-mono">
        Songs are stored in Firebase Realtime Database
      </footer>
    </div>
  );
}
