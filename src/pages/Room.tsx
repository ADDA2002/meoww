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

const SYNC_TICK_MS = 500;
const RESYNC_THRESHOLD_SEC = 0.3;

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
  const lastSyncTimeRef = useRef<number>(0);
  const hasReceivedStateRef = useRef<boolean>(false);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;
  isHostRef.current = isHost;

  const currentTrack = queue[currentIndex] || null;

  // Broadcast current state to Firebase
  const broadcastState = useCallback((extra?: Partial<FirebaseSyncState>) => {
    const audio = audioRef.current;
    if (!audio) return;
    updatePlaybackStateRef.current?.({
      currentTrackIndex: currentIndexRef.current,
      queue: queueRef.current,
      isPlaying: !audio.paused,
      currentTime: audio.currentTime,
      ...extra,
    });
  }, []);

  // Play a track from the beginning — used for next/prev buttons and auto-play
  const playTrack = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[idx];
    if (!track) return;

    setCurrentIndex(idx);
    setCurrentTime(0);
    audio.currentTime = 0;

    const urlChanged = audio.src !== track.url;

    if (urlChanged) {
      audio.src = track.url;
      audio.load();
    }

    audio.play().catch(console.error);

    // Immediate broadcast on track change
    broadcastState({ currentTrackIndex: idx });
  }, [broadcastState]);

  // Handle state changes from Firebase (member side only)
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    if (isHostRef.current) return;

    hasReceivedStateRef.current = true;
    lastSyncStateRef.current = state;
    lastSyncTimeRef.current = Date.now();

    const audio = audioRef.current;
    if (!audio) return;

    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];

    // Member uses the host's queue and track index as source of truth.
    if (newQueue.length > 0) {
      const currentQueueIds = queueRef.current.map(t => t.id).join(",");
      const newQueueIds = newQueue.map(t => t.id).join(",");
      if (currentQueueIds !== newQueueIds) {
        setQueue(newQueue);
      }
    }

    const track = newQueue[newIndex];
    if (!track) return;

    const wasPaused = audio.paused;
    const indexChanged = newIndex !== currentIndexRef.current;
    const urlChanged = audio.src !== track.url;

    // Estimate current playback position accounting for network delay
    const stateTime = state.currentTime ?? 0;
    const stateTimestamp = state.currentTimeUpdatedAt || Date.now();
    const networkDelay = (Date.now() - stateTimestamp) / 1000;
    const expectedTime = state.isPlaying ? stateTime + networkDelay : stateTime;

    // Always update currentIndex immediately
    setCurrentIndex(newIndex);

    if (urlChanged || indexChanged) {
      audio.src = track.url;
      audio.load();
      audio.currentTime = expectedTime;
      setCurrentTime(expectedTime);

      if (state.isPlaying) {
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    } else {
      // Same track — correct position if drift is too large
      if (Math.abs(audio.currentTime - expectedTime) > RESYNC_THRESHOLD_SEC) {
        audio.currentTime = expectedTime;
        setCurrentTime(expectedTime);
      }

      // Apply play/pause
      if (state.isPlaying && wasPaused) {
        audio.play().catch(console.error);
      } else if (!state.isPlaying && !wasPaused) {
        audio.pause();
      }
    }
  }, []);

  const handleIncomingMessage = useCallback((_msg: SyncMessage) => {
  }, []);

  // Initialize audio element — paused, no auto-play
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = false;
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (isHostRef.current && queueRef.current.length > 0) {
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
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Host: load track into audio element whenever currentTrack changes
  // Member: NEVER auto-loads based on currentTrack — track is driven solely by
  // the Firebase state handler above to avoid double audio.
  useEffect(() => {
    if (!isHost) return;
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();
    if (audio.src !== currentTrack.url) {
      audio.src = currentTrack.url;
      audio.load();
    }
    setCurrentTime(0);
    audio.currentTime = 0;
  }, [currentTrack, isHost]);

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

  // Continuous position broadcast (host) + drift correction (member)
  useEffect(() => {
    if (!isHost) {
      // Member: periodically correct drift
      const interval = setInterval(() => {
        const audio = audioRef.current;
        const state = lastSyncStateRef.current;
        if (!audio || !state) return;

        const stateTime = state.currentTime ?? 0;
        const stateTimestamp = state.currentTimeUpdatedAt || lastSyncTimeRef.current || Date.now();
        const networkDelay = (Date.now() - stateTimestamp) / 1000;
        const expectedTime = state.isPlaying ? stateTime + networkDelay : stateTime;

        if (state.isPlaying && Math.abs(audio.currentTime - expectedTime) > RESYNC_THRESHOLD_SEC) {
          audio.currentTime = expectedTime;
          setCurrentTime(expectedTime);
        }
      }, 500);
      return () => clearInterval(interval);
    }

    // Host: broadcast position every 500ms
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

  // Toggle play/pause — immediate broadcast
  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (!audio.paused) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }

    // Immediate broadcast
    updatePlaybackStateRef.current?.({
      isPlaying: !audio.paused,
      currentTime: audio.currentTime,
    });
  }, []);

  // Next track
  const handleNext = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;
    playTrack(nextIdx);
  }, [playTrack]);

  // Previous track
  const handlePrevious = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;
    playTrack(prevIdx);
  }, [playTrack]);

  // Seek
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const t = parseFloat(e.target.value);
      audioRef.current.currentTime = t;
      setCurrentTime(t);
      updatePlaybackStateRef.current?.({ currentTime: t });
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
            onReorder={handleReorderDnd}
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