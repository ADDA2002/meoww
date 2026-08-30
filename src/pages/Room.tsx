import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX, Music, Wifi } from "lucide-react";

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
    <div className="min-h-screen bg-white text-black flex flex-col">
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
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            onLeave={handleLeaveRoom}
            onTrackClick={handleTrackClick}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddSong={handleAddSong}
            onLocalFileUpload={handleLocalFileUpload}
          />
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <div className="w-full">
          <div className="flex items-center justify-center mb-3 pb-2 border-b border-gray-200 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-black animate-pulse"></span>
              <span className="font-semibold text-gray-700 uppercase">
                {isHost ? "YOU ARE HOST" : "SYNCED WITH HOST"}
              </span>
            </div>
          </div>

          <div className="w-full aspect-square bg-gray-100 border-2 border-black flex items-center justify-center mb-4 overflow-hidden">
            {currentTrack?.cover ? (
              <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
            ) : (
              <Music className="w-24 h-24 text-gray-400" />
            )}
          </div>

          <div className="text-center mb-5">
            <h2 className="text-xl font-bold tracking-tight truncate">
              {currentTrack?.title || "No Track"}
            </h2>
            <p className="text-sm text-gray-600 mt-1 truncate">
              {currentTrack?.artist || (isHost ? "Add songs to queue" : "Waiting for host...")}
            </p>
          </div>

          <div className="mb-5">
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
      </main>
    </div>
  );
};

export default Room;