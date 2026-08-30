import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX, Music } from "lucide-react";

import RoomDrawer from "@/components/RoomDrawer";
import { formatTime } from "@/lib/utils";
import { useFirebaseSync } from "@/hooks/useFirebaseSync";
import { FirebaseSyncState } from "@/lib/firebaseSignaling";

const SYNC_TICK_MS = 3000; // host re-broadcasts currentTime every 3s
const RESYNC_THRESHOLD_SEC = 0.25; // member re-seeks if drift exceeds 250ms

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  const [myId, setMyId] = useState<string>("");
  const [userName] = useState<string>(initialName);
  const isHost = initialIsHost;

  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);
  const isHostRef = useRef(isHost);
  const lastSyncStateRef = useRef<FirebaseSyncState | null>(null);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;
  isHostRef.current = isHost;

  const currentTrack = queue[currentIndex] || null;

  // Play a track from the beginning — used for next/prev buttons and auto-play
  const playTrack = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[idx];
    if (!track) return;

    setCurrentIndex(idx);
    setCurrentTime(0);
    audio.currentTime = 0;

    if (audio.src !== track.url) {
      audio.src = track.url;
      audio.load();
    }

    const handleCanPlay = () => {
      audio.removeEventListener("canplay", handleCanPlay);
      audio.play().catch(console.error);
    };
    audio.addEventListener("canplay", handleCanPlay);

    updatePlaybackStateRef.current?.({
      currentTrackIndex: idx,
      queue: queueRef.current,
      isPlaying: true,
      currentTime: 0,
    });
  }, []);

  // Handle state changes from Firebase (for members receiving host updates)
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    lastSyncStateRef.current = state;

    if (isHostRef.current) return;

    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];

    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      setQueue(newQueue);
    }

    const audio = audioRef.current;
    if (!audio) return;

    const track = newQueue[newIndex];
    const targetTime = state.currentTime ?? 0;
    const wasPaused = audio.paused;
    const indexChanged = newIndex !== currentIndexRef.current;
    const urlChanged = track && audio.src !== track.url;

    // Compute expected playback time adjusted for network delay
    const expectedNow = state.isPlaying
      ? targetTime + (Date.now() - (state.currentTimeUpdatedAt || Date.now())) / 1000
      : targetTime;

    if (urlChanged || indexChanged) {
      setCurrentIndex(newIndex);
      setCurrentTime(expectedNow);
      audio.src = track.url;
      audio.load();

      const handleCanPlay = () => {
        audio.removeEventListener("canplay", handleCanPlay);
        // Only correct if drift is significant
        if (Math.abs(audio.currentTime - expectedNow) > 0.05) {
          audio.currentTime = expectedNow;
        }
        if (state.isPlaying) {
          audio.play().catch(console.error);
        } else {
          audio.pause();
        }
      };
      audio.addEventListener("canplay", handleCanPlay);
      return;
    }

    // Same track — re-sync position if drift is too large
    if (Math.abs(audio.currentTime - expectedNow) > RESYNC_THRESHOLD_SEC) {
      audio.currentTime = expectedNow;
      setCurrentTime(expectedNow);
    }

    if (state.isPlaying && wasPaused) {
      audio.play().catch(console.error);
    } else if (!state.isPlaying && !wasPaused) {
      audio.pause();
    }
  }, []);

  const handleIncomingMessage = useCallback((_msg: SyncMessage) => {
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
        playTrack(nextIdx);
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

  // Load track into audio element but keep paused
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();
    audio.src = currentTrack.url;
    audio.load();
    setCurrentTime(0);
    audio.currentTime = 0;
  }, [currentTrack]);

  const { updatePlaybackState } = useFirebaseSync({
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

  // Host: continuously re-broadcast the current playback position so members
  // can correct drift and stay in sync. Members also re-check their position
  // periodically against the latest known state to fix any accumulated drift.
  useEffect(() => {
    if (!isHost) {
      // Member side: periodically correct drift
      const interval = setInterval(() => {
        const audio = audioRef.current;
        const state = lastSyncStateRef.current;
        if (!audio || !state || !state.isPlaying) return;
        const expectedNow =
          (state.currentTime ?? 0) +
          (Date.now() - (state.currentTimeUpdatedAt || Date.now())) / 1000;
        if (Math.abs(audio.currentTime - expectedNow) > RESYNC_THRESHOLD_SEC) {
          audio.currentTime = expectedNow;
          setCurrentTime(expectedNow);
        }
      }, 1500);
      return () => clearInterval(interval);
    }

    // Host side: re-broadcast position every SYNC_TICK_MS
    const interval = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      updatePlaybackStateRef.current?.({
        currentTrackIndex: currentIndexRef.current,
        queue: queueRef.current,
        isPlaying: !audio.paused,
        currentTime: audio.currentTime,
      });
    }, SYNC_TICK_MS);
    return () => clearInterval(interval);
  }, [isHost]);

  // Toggle play/pause
  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (!audio.paused) {
      audio.pause();
      updatePlaybackStateRef.current?.({ isPlaying: false, currentTime: audio.currentTime });
    } else {
      audio.play().catch(console.error);
      updatePlaybackStateRef.current?.({ isPlaying: true, currentTime: audio.currentTime });
    }
  }, []);

  // Next track — auto-plays
  const handleNext = useCallback(() => {
    if (queueRef.current.length === 0) return;

    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    playTrack(nextIdx);
  }, [playTrack]);

  // Previous track — auto-plays
  const handlePrevious = useCallback(() => {
    if (queueRef.current.length === 0) return;

    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    playTrack(prevIdx);
  }, [playTrack]);

  // Seek the audio
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const t = parseFloat(e.target.value);
      audioRef.current.currentTime = t;
      setCurrentTime(t);
      updatePlaybackStateRef.current?.({ currentTime: t, isPlaying: !audioRef.current.paused });
    }
  }, []);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, [isMuted]);

  // Toggle shuffle
  const handleToggleShuffle = useCallback(() => {
    setIsShuffle(!isShuffleRef.current);
  }, []);

  // Add song to queue
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

  // Upload local file to queue
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

  // Reorder queue by drag-and-drop (host only)
  const handleReorderDnd = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const newQueue = [...queueRef.current];
    const [moved] = newQueue.splice(fromIdx, 1);
    newQueue.splice(toIdx, 0, moved);

    let newActive = currentIndexRef.current;
    if (currentIndexRef.current === fromIdx) newActive = toIdx;
    else if (fromIdx < currentIndexRef.current && toIdx >= currentIndexRef.current) {
      newActive = currentIndexRef.current - 1;
    } else if (fromIdx > currentIndexRef.current && toIdx <= currentIndexRef.current) {
      newActive = currentIndexRef.current + 1;
    }

    setQueue(newQueue);
    setCurrentIndex(newActive);

    updatePlaybackStateRef.current?.({
      queue: newQueue,
      currentTrackIndex: newActive,
    });
  }, []);

  // Reorder queue (host only) — used by the older arrow-style fallback if needed
  const handleReorder = useCallback((idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queueRef.current.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    handleReorderDnd(idx, targetIdx);
  }, [handleReorderDnd]);

  // Remove track from queue (host only)
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
          {!isHost && (
            <div className="flex items-center gap-2 text-xs font-mono font-semibold text-gray-700 uppercase">
              <span className="w-1.5 h-1.5 bg-black"></span>
              <span>Synced with host</span>
            </div>
          )}
          <RoomDrawer
            roomCode={roomCode}
            userName={userName}
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            onLeave={handleLeaveRoom}
            onTrackClick={playTrack}
            onReorder={handleReorder}
            onReorderDnd={handleReorderDnd}
            onRemove={handleRemoveTrack}
            onAddSong={handleAddSong}
            onLocalFileUpload={handleLocalFileUpload}
          />
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        {isHost ? (
          <>
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
                {currentTrack?.artist || "Add songs to queue"}
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
                onClick={handleToggleShuffle}
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
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="flex items-center gap-2 text-sm font-mono font-semibold text-gray-700 uppercase">
              <span className="w-2 h-2 bg-black"></span>
              <span>Synced with host</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Room;