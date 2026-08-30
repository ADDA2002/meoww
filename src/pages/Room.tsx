import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track, RoomUser, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";

import RoomDrawer from "@/components/RoomDrawer";
import { PlayerControls } from "@/components/PlayerControls";
import { TrackInfo } from "@/components/TrackInfo";
import { ProgressBar } from "@/components/ProgressBar";
import { QueueList } from "@/components/QueueList";
import { UserList } from "@/components/UserList";
import { ConnectionStatus, OfflineBanner } from "@/components/ConnectionStatus";

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
  const [users, setUsers] = useState<RoomUser[]>([]);

  // Queue states
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);

  // Session state
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);

  // Audio state
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sync refs
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const isInitializedRef = useRef(false);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;

  const currentTrack = queue[currentIndex] || null;

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
        handlePlayTrack(nextIdx, true);
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

  const [isPlaying, setIsPlaying] = useState(false);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, [isMuted]);

  // Update audio source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();
    audio.src = currentTrack.url;
    audio.load();
  }, [currentTrack]);

  // Broadcast refs
  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);
  const broadcastRef = useRef<((msg: SyncMessage) => void) | null>(null);

  // Play a track immediately (no scheduling delay)
  const handlePlayTrack = useCallback((idx: number, fromEnded: boolean = false) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[idx];
    if (!track) return;

    setCurrentIndex(idx);
    
    // Load and play immediately
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

  // Handle state changes from Firebase
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    console.log(`[Room] State change:`, JSON.stringify(state, null, 2));
    
    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];
    const newIsPlaying = state.isPlaying ?? false;
    
    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      setQueue(newQueue);
    }
    
    // Sync playback state
    const audio = audioRef.current;
    if (!audio) return;

    const track = newQueue[newIndex];
    if (track) {
      if (audio.src !== track.url) {
        audio.src = track.url;
        audio.load();
      }
      
      if (newIsPlaying) {
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    }

    setCurrentIndex(newIndex);
  }, []);

  // Handle instant messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    console.log(`[Room] Received message:`, msg.type);
    
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
    }
  }, []);

  const handleSessionEnded = useCallback(() => {
    setSessionEnded(true);
  }, []);

  const { isConnected, broadcast, updatePlaybackState, getUsers, getState } = useFirebaseSync({
    roomCode,
    myId,
    userName,
    isHost,
    queue,
    currentIndex,
    isPlaying,
    onMessage: handleIncomingMessage,
    onStateChange: handleStateChange,
    onSessionEnded: handleSessionEnded,
  });

  useEffect(() => {
    updatePlaybackStateRef.current = updatePlaybackState;
    broadcastRef.current = broadcast;
  }, [updatePlaybackState, broadcast]);

  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `host-${roomCode.toLowerCase()}`
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);
  }, [roomCode, isHost]);

  // Load initial state when connected (for members joining mid-session)
  useEffect(() => {
    if (!isConnected || !myId || isHost || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const loadInitialState = async () => {
      try {
        const state = await getState();
        if (state) {
          if (state.queue && state.queue.length > 0) setQueue(state.queue);
          if (state.currentTrackIndex !== undefined) setCurrentIndex(state.currentTrackIndex);

          // Sync audio state
          const audio = audioRef.current;
          const track = state.queue?.[state.currentTrackIndex];
          if (audio && track) {
            audio.src = track.url;
            audio.load();
            if (state.isPlaying) {
              audio.play().catch(console.error);
            }
          }
        }
        
        const userList = await getUsers();
        if (userList.length > 0) setUsers(userList);
      } catch (err) {
        console.error(`[Room] MEMBER: Error loading initial state:`, err);
      }
    };

    loadInitialState();
  }, [isConnected, myId, isHost, getState, getUsers]);

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

  const handleSeekFromBar = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      updatePlaybackStateRef.current?.({ currentTime: time });
    }
  }, []);

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
    
    updatePlaybackStateRef.current({
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

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate("/");
  };

  if (sessionEnded) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-gray-100 border-2 border-black flex items-center justify-center">
            <Radio className="w-10 h-10 text-gray-400" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight uppercase">Session Ended</h1>
            <p className="text-gray-600 font-mono text-sm">
              The host has left the session.
            </p>
          </div>

          <Button onClick={handleGoHome} className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 text-sm uppercase tracking-wider">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} />
          <RoomDrawer 
            roomCode={roomCode} 
            userName={userName} 
            onLeave={handleLeaveRoom}
          />
        </div>
      </header>

      {!isConnected && <OfflineBanner onRetry={handleRetry} />}

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`}></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? "YOU ARE HOST" : "SYNCED WITH HOST"}
                </span>
              </div>
              <span className="text-gray-500">REAL-TIME SYNC</span>
            </div>

            <TrackInfo track={currentTrack} />

            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              isHost={isHost}
              isConnected={isConnected}
              onSeek={handleSeekFromBar}
            />

            <PlayerControls
              isPlaying={isPlaying}
              isShuffle={isShuffle}
              isMuted={isMuted}
              isHost={isHost}
              isConnected={isConnected}
              onTogglePlay={handleTogglePlay}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onToggleShuffle={() => setIsShuffle(!isShuffle)}
              onToggleMute={handleToggleMute}
            />
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <UserList
            users={users}
            myId={myId}
            isHost={isHost}
          />

          <QueueList
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            onTrackClick={handleTrackClick}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddSong={handleAddSong}
            onLocalFileUpload={handleLocalFileUpload}
          />
        </div>
      </main>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Real-Time Audio Sync
      </footer>
    </div>
  );
};

export default Room;