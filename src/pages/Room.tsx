import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track, RoomUser, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX, Music, Plus, ArrowUp, ArrowDown, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import RoomDrawer from "@/components/RoomDrawer";
import { formatTime } from "@/lib/utils";
import { useFirebaseSync } from "@/hooks/useFirebaseSync";
import { FirebaseSyncState } from "@/lib/firebaseSignaling";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // User states
  const [myId, setMyId] = useState<string>("");
  const [userName] = useState<string>(initialName);
  const isHost = initialIsHost;

  // Queue states
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);

  // Audio state
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;

  const currentTrack = queue[currentIndex] || null;

  // Broadcast refs
  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);

  // Play a track immediately
  const handlePlayTrack = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[idx];
    if (!track) return;

    setCurrentIndex(idx);
    
    if (audio.src !== track.url) {
      audio.src = track.url;
      audio.load();
    }
    
    audio.play().catch(console.error);

    // Sync state with everyone
    updatePlaybackStateRef.current?.({
      currentTrackIndex: idx,
      queue: queueRef.current,
      isPlaying: true,
    });
  }, []);

  // Handle state changes from Firebase (for members receiving host updates)
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    if (isHost) return; // Host controls state, doesn't need to receive
    
    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];
    
    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      setQueue(newQueue);
    }
    
    const audio = audioRef.current;
    if (!audio) return;

    const track = newQueue[newIndex];
    if (track) {
      if (audio.src !== track.url) {
        audio.src = track.url;
        audio.load();
      }
      
      if (state.isPlaying) {
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    }

    setCurrentIndex(newIndex);
  }, [isHost]);

  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    // Handle messages if needed
  }, []);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (queueRef.current.length > 0) {
        const nextIdx = isShuffleRef.current
          ? Math.floor(Math.random() * queueRef.current.length)
          : (currentIndexRef.current + 1) % queueRef.current.length;
        handlePlayTrack(nextIdx);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Update audio source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();
    audio.src = currentTrack.url;
    audio.load();
  }, [currentTrack]);

  const { isConnected, updatePlaybackState } = useFirebaseSync({
    roomCode,
    myId,
    userName,
    isHost,
    queue,
    currentIndex,
    isPlaying,
    onMessage: handleIncomingMessage,
    onStateChange: handleStateChange,
  });

  useEffect(() => {
    updatePlaybackStateRef.current = updatePlaybackState;
  }, [updatePlaybackState]);

  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `host-${roomCode.toLowerCase()}`
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);
  }, [roomCode, isHost]);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    
    if (!audio.paused) {
      audio.pause();
      updatePlaybackStateRef.current?.({ isPlaying: false });
    } else {
      audio.play().catch(console.error);
      updatePlaybackStateRef.current?.({ isPlaying: true });
    }
  }, []);

  const handleNext = useCallback(() => {
    if (queueRef.current.length === 0) return;
    
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    handlePlayTrack(nextIdx);
  }, [handlePlayTrack]);

  const handlePrevious = useCallback(() => {
    if (queueRef.current.length === 0) return;
    
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    handlePlayTrack(prevIdx);
  }, [handlePlayTrack]);

  const handleTrackClick = useCallback((idx: number) => {
    handlePlayTrack(idx);
  }, [handlePlayTrack]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = parseFloat(e.target.value);
      updatePlaybackStateRef.current?.({ currentTime: parseFloat(e.target.value) });
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, [isMuted]);

  const handleAddSong = useCallback((song: { title: string; artist: string; url: string }) => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      title: song.title,
      artist: song.artist || "Independent Artist",
      url: song.url,
      addedBy: userName,
    };

    const updatedQueue = [...queueRef.current, newTrack];
    setQueue(updatedQueue);
    
    updatePlaybackStateRef.current?.({
      queue: updatedQueue,
      currentTrackIndex: currentIndexRef.current,
    });
  }, [userName]);

  const handleLocalFileUpload = useCallback((file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const newTrack: Track = {
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local)`,
      url: fileUrl,
      addedBy: userName,
      isLocalFile: true,
    };

    const updatedQueue = [...queueRef.current, newTrack];
    setQueue(updatedQueue);
    
    updatePlaybackStateRef.current?.({
      queue: updatedQueue,
      currentTrackIndex: currentIndexRef.current,
    });
  }, [userName]);

  const handleReorder = useCallback((idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queueRef.current.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queueRef.current];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];

    let newActive = currentIndexRef.current;
    if (currentIndexRef.current === idx) newActive = targetIdx;
    else if (currentIndexRef.current === targetIdx) newActive = idx;

    setQueue(newQueue);
    setCurrentIndex(newActive);
    
    updatePlaybackStateRef.current?.({
      queue: newQueue,
      currentTrackIndex: newActive,
    });
  }, []);

  const handleRemoveTrack = useCallback((idx: number) => {
    if (queueRef.current.length <= 1) return;
    const newQueue = queueRef.current.filter((_, i) => i !== idx);
    let newActive = currentIndexRef.current;
    if (idx < currentIndexRef.current) newActive = currentIndexRef.current - 1;
    else if (idx === currentIndexRef.current) newActive = Math.min(currentIndexRef.current, newQueue.length - 1);
    
    setQueue(newQueue);
    setCurrentIndex(newActive);
    
    updatePlaybackStateRef.current?.({
      queue: newQueue,
      currentTrackIndex: newActive,
    });
  }, []);

  const handleLeaveRoom = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-green-600">
            <Wifi className="w-3.5 h-3.5" />
            <span>CONNECTED</span>
          </div>
          <RoomDrawer 
            roomCode={roomCode} 
            userName={userName} 
            onLeave={handleLeaveRoom}
          />
        </div>
      </header>

      <main className={`flex-1 p-4 sm:p-6 ${isHost ? "max-w-6xl" : "max-w-lg"} mx-auto w-full`}>
        {isHost ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Player - Host */}
            <div className="lg:col-span-7">
              <div className="w-full">
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-black animate-pulse"></span>
                    <span className="font-semibold text-gray-700 uppercase">YOU ARE HOST</span>
                  </div>
                  <span className="text-gray-500">REAL-TIME SYNC</span>
                </div>

                <div className="w-full aspect-square bg-gray-100 border-2 border-black flex items-center justify-center mb-6 overflow-hidden">
                  {currentTrack?.cover ? (
                    <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
                  ) : (
                    <Music className="w-24 h-24 text-gray-400" />
                  )}
                </div>

                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold tracking-tight truncate">
                    {currentTrack?.title || "No Track"}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1 truncate">
                    {currentTrack?.artist || "Add songs to queue"}
                  </p>
                </div>

                <div className="mb-6">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full accent-black bg-gray-200 h-1.5 appearance-none border border-black cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-mono text-gray-500 mt-2">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant={isShuffle ? "default" : "ghost"}
                    size="icon"
                    onClick={() => setIsShuffle(!isShuffle)}
                    className={`border border-black transition-colors ${
                      isShuffle 
                        ? "bg-black text-white hover:bg-neutral-800" 
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    <Shuffle className="w-4 h-4" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevious}
                    className="p-3 border border-black bg-white hover:bg-gray-100 text-black"
                  >
                    <SkipBack className="w-5 h-5" />
                  </Button>
                  
                  <Button
                    onClick={handleTogglePlay}
                    className="w-16 h-16 border-2 border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center"
                  >
                    {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNext}
                    className="p-3 border border-black bg-white hover:bg-gray-100 text-black"
                  >
                    <SkipForward className="w-5 h-5" />
                  </Button>
                  
                  <Button
                    variant={isMuted ? "default" : "ghost"}
                    size="icon"
                    onClick={handleToggleMute}
                    className={`border border-black transition-colors ${
                      isMuted 
                        ? "bg-black text-white hover:bg-neutral-800" 
                        : "bg-white text-black hover:bg-gray-100"
                    }`}
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Queue Panel - Host Only */}
            <div className="lg:col-span-5">
              <HostQueuePanel
                queue={queue}
                currentIndex={currentIndex}
                onTrackClick={handleTrackClick}
                onReorder={handleReorder}
                onRemove={handleRemoveTrack}
                onAddSong={handleAddSong}
                onLocalFileUpload={handleLocalFileUpload}
              />
            </div>
          </div>
        ) : (
          /* Member View - Player Only */
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-lg">
              <div className="flex items-center justify-center mb-4 pb-2 border-b border-gray-200 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-black animate-pulse"></span>
                  <span className="font-semibold text-gray-700 uppercase">SYNCED WITH HOST</span>
                </div>
              </div>

              <div className="w-full aspect-square bg-gray-100 border-2 border-black flex items-center justify-center mb-8 overflow-hidden">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
                ) : (
                  <Music className="w-24 h-24 text-gray-400" />
                )}
              </div>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight truncate">
                  {currentTrack?.title || "No Track"}
                </h2>
                <p className="text-sm text-gray-600 mt-1 truncate">
                  {currentTrack?.artist || "Waiting for host..."}
                </p>
              </div>

              <div className="mb-6">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  readOnly
                  className="w-full accent-black bg-gray-200 h-1.5 appearance-none border border-black cursor-default"
                />
                <div className="flex justify-between text-xs font-mono text-gray-500 mt-2">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <Button
                  className="w-16 h-16 border-2 border-black bg-black text-white flex items-center justify-center opacity-90"
                  disabled
                >
                  {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                </Button>
              </div>
              <p className="text-center text-xs font-mono text-gray-400 mt-4 uppercase">Controlled by host</p>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Real-Time Audio Sync
      </footer>
    </div>
  );
};

// Host-only queue panel
const HostQueuePanel: React.FC<{
  queue: Track[];
  currentIndex: number;
  onTrackClick: (idx: number) => void;
  onReorder: (idx: number, direction: "up" | "down") => void;
  onRemove: (idx: number) => void;
  onAddSong: (song: { title: string; artist: string; url: string }) => void;
  onLocalFileUpload: (file: File) => void;
}> = ({ queue, currentIndex, onTrackClick, onReorder, onRemove, onAddSong, onLocalFileUpload }) => {
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songUrl.trim()) return;
    
    onAddSong({ title: songTitle, artist: songArtist, url: songUrl });
    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLocalFileUpload(file);
      setAddSongOpen(false);
    }
  };

  return (
    <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
        <span className="font-bold text-xs uppercase tracking-wider">Queue ({queue.length})</span>
        <Dialog open={addSongOpen} onOpenChange={setAddSongOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1">
              <Plus className="w-3.5 h-3.5 mr-1" />ADD
            </Button>
          </DialogTrigger>
          <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold tracking-tight uppercase">Add Song</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
                <Upload className="w-6 h-6 mx-auto text-black" />
                <p className="text-xs font-semibold uppercase">Upload MP3</p>
                <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800">
                  Select MP3
                  <input type="file" accept="audio/mp3,audio/*" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-gray-300"></div>
                <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or URL</span>
                <div className="flex-grow border-t border-gray-300"></div>
              </div>
              <form onSubmit={handleAddSong} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-gray-700">Title</Label>
                  <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song name" className="border-gray-300" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
                  <Input value={songArtist} onChange={(e) => setSongArtist(e.target.value)} placeholder="Artist name" className="border-gray-300" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono uppercase text-gray-700">Audio URL</Label>
                  <Input value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://..." className="border-gray-300 font-mono text-xs" />
                </div>
                <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2">Add to Queue</Button>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {queue.map((track, idx) => {
          const isCurrent = idx === currentIndex;
          return (
            <div
              key={track.id}
              className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                isCurrent ? "bg-black text-white border-black" : "bg-white text-black border-gray-200 hover:border-gray-400"
              }`}
            >
              <div 
                onClick={() => onTrackClick(idx)} 
                className="min-w-0 flex-1 cursor-pointer"
              >
                <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>{track.artist}</p>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onReorder(idx, "up")}
                  disabled={idx === 0}
                  className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"}`}
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onReorder(idx, "down")}
                  disabled={idx === queue.length - 1}
                  className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"}`}
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onRemove(idx)}
                  className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${isCurrent ? "border-white" : "border-gray-300"}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Add missing Wifi import
import { Wifi } from "lucide-react";

export default Room;