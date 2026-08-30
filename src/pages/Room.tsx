import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
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
import { SyncStatusPanel } from "@/components/SyncStatusPanel";

import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useFirebaseSync } from "@/hooks/useFirebaseSync";
import { FirebaseSyncState } from "@/lib/firebaseSignaling";
import { syncedClock } from "@/lib/syncedClock";
import { syncScheduler } from "@/lib/syncScheduler";

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

  // Veto - default ON (add-only mode)
  const [vetoActive, setVetoActive] = useState<boolean>(true);

  // Session state
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);
  const [kicked, setKicked] = useState<boolean>(false);
  const [banned, setBanned] = useState<boolean>(false);

  // Refs for sync
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const vetoActiveRef = useRef(vetoActive);
  const isInitializedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const lastVetoToastRef = useRef<boolean | null>(null);
  const isClockCalibratedRef = useRef(false);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;
  vetoActiveRef.current = vetoActive;

  const currentTrack = queue[currentIndex] || null;

  // Convenience: non-host members are "locked" when veto is on
  const controlsLocked = !isHost && vetoActive;

  // Handle track end - advance to next track
  const handleTrackEnded = useCallback(() => {
    if (queueRef.current.length === 0) return;
    isPlayingRef.current = false;

    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    setCurrentIndex(nextIdx);
    
    // Auto-advance: schedule next track with synced clock
    const nextTrack = queueRef.current[nextIdx];
    if (nextTrack && isHost && syncedClock.isReady()) {
      // Schedule to start 2 seconds from now (synced time)
      const targetTime = syncedClock.now() + 2000;
      syncScheduler.scheduleTrack(nextTrack, targetTime, `track-${nextIdx}`);
      syncScheduler.startCountdown();
    }
  }, []);

  // Audio player hook (for non-host, this also drives UI)
  const {
    isPlaying: audioPlayerIsPlaying,
    isMuted,
    setIsMuted,
    currentTime,
    duration,
    play,
    pause,
    seek,
    getCurrentTime,
  } = useAudioPlayer({
    track: currentTrack,
    isHost,
    onTimeUpdate: () => {},
    onTrackEnded: handleTrackEnded,
  });

  /**
   * Derive the REAL isPlaying state.
   * The host's playback happens via syncScheduler (precision-timed).
   * Members' playback happens via useAudioPlayer (seek+play).
   * We track both and combine them.
   */
  const [schedulerIsPlaying, setSchedulerIsPlaying] = useState(false);
  const isPlaying = isHost ? schedulerIsPlaying : audioPlayerIsPlaying;
  isPlayingRef.current = isPlaying;

  // Subscribe to scheduler to know when host's music is actually playing
  useEffect(() => {
    if (!isHost) return;
    const unsub = syncScheduler.subscribe((tracks) => {
      const anyPlaying = tracks.some(t => t.status === "playing");
      setSchedulerIsPlaying(anyPlaying);
    });
    return () => unsub();
  }, [isHost]);

  // Keep play/pause refs updated
  const playRef = useRef(play);
  const pauseRef = useRef(pause);
  const seekRef = useRef(seek);
  const broadcastRef = useRef<((msg: SyncMessage) => void) | null>(null);
  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);
  const getCurrentTimeRef = useRef(getCurrentTime);

  playRef.current = play;
  pauseRef.current = pause;
  seekRef.current = seek;
  getCurrentTimeRef.current = getCurrentTime;

  // Phase 1: Calibrate the synced clock when the room is ready
  useEffect(() => {
    if (!myId || !roomCode) return;
    
    console.log(`[Room] Starting clock calibration...`);
    syncedClock.calibrate(5).then(() => {
      isClockCalibratedRef.current = true;
      console.log(`[Room] ✅ Clock calibrated, sync ready`);
    });
  }, [myId, roomCode]);

  // Handle state changes from Firebase (PRIMARY sync for playback)
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    console.log(`[Room] State change:`, state);
    
    // Only non-host members should follow host's state
    if (isHost) return;
    
    const newIndex = state.currentTrackIndex ?? 0;
    const newTime = state.currentTime ?? 0;
    const newIsPlaying = state.isPlaying ?? false;
    const newQueue = state.queue || [];
    const newVetoActive = state.vetoActive ?? true;
    const newTargetSyncedTime = state.targetSyncedTime;
    
    // Update queue if different
    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      console.log(`[Room] Updating queue from state: ${newQueue.length} tracks`);
      setQueue(newQueue);
    }
    
    // Handle veto state change - show toast ONLY when it changes
    if (newVetoActive !== vetoActiveRef.current) {
      setVetoActive(newVetoActive);
      if (lastVetoToastRef.current !== null) {
        if (newVetoActive) {
          toast("Host restricted controls. You can add songs only.", { icon: "🔒" });
        } else {
          toast("Host restored member controls.", { icon: "🔓" });
        }
      }
      lastVetoToastRef.current = newVetoActive;
    }
    
    // Handle scheduled track from host
    if (newTargetSyncedTime && newIndex !== undefined) {
      const trackToSchedule = newQueue[newIndex];
      if (trackToSchedule) {
        console.log(`[Room] 📅 Received scheduled track: ${trackToSchedule.title} at synced time ${newTargetSyncedTime}`);
        syncScheduler.scheduleTrack(trackToSchedule, newTargetSyncedTime, `track-${newIndex}`);
        syncScheduler.startCountdown();
      }
    }
    
    // Handle track change
    if (newIndex !== currentIndexRef.current) {
      console.log(`[Room] Track change: ${currentIndexRef.current} -> ${newIndex}`);
      setCurrentIndex(newIndex);
    }
    
    // Handle play/pause state (for immediate response, not scheduled)
    if (newIsPlaying) {
      const timeDiff = Math.abs(getCurrentTimeRef.current() - newTime);
      if (!isPlayingRef.current || timeDiff > 1) {
        console.log(`[Room] Syncing play at ${newTime} (timeDiff: ${timeDiff})`);
        seekRef.current(newTime);
        setTimeout(() => {
          playRef.current?.();
        }, 100);
      }
    } else {
      if (isPlayingRef.current) {
        console.log(`[Room] Syncing pause at ${newTime}`);
        seekRef.current(newTime);
        pauseRef.current?.();
      }
    }
  }, [isHost]);

  // Handle instant messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    console.log(`[Room] Received message:`, msg.type);
    
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
        
      case "KICK_USER": {
        if (msg.targetId === myId) {
          setKicked(true);
          toast.error(`You have been kicked by the host${msg.reason ? `: ${msg.reason}` : ""}`);
        } else {
          toast.info(`${msg.targetName} has been kicked.`);
          setUsers(prev => prev.filter(u => u.id !== msg.targetId));
        }
        break;
      }
      
      case "BAN_USER": {
        if (msg.targetId === myId) {
          setBanned(true);
          toast.error(`You have been banned from this session${msg.reason ? `: ${msg.reason}` : ""}`);
        } else {
          toast.info(`${msg.targetName} has been banned.`);
          setUsers(prev => prev.filter(u => u.id !== msg.targetId));
        }
        break;
      }
    }
  }, [myId]);

  // Handle session ended
  const handleSessionEnded = useCallback(() => {
    console.log(`[Room] Session ended`);
    setSessionEnded(true);
  }, []);

  // Firebase sync hook
  const { isConnected, broadcast, updatePlaybackState, kickUser, banUser, getUsers, getState } = useFirebaseSync({
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

  // Store refs
  useEffect(() => {
    broadcastRef.current = broadcast;
    updatePlaybackStateRef.current = updatePlaybackState;
  }, [broadcast, updatePlaybackState]);

  // Initialize connection
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `host-${roomCode.toLowerCase()}`
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);
  }, [roomCode, isHost]);

  // Cleanup scheduler on unmount
  useEffect(() => {
    return () => {
      syncScheduler.clear();
    };
  }, []);

  // Load initial state when connected (for members joining mid-session)
  useEffect(() => {
    if (!isConnected || !myId || isHost || isInitializedRef.current) return;
    isInitializedRef.current = true;

    const loadInitialState = async () => {
      console.log(`[Room] Loading initial state...`);
      
      try {
        const state = await getState();
        if (state) {
          console.log(`[Room] Got initial state:`, state);
          
          if (state.queue && state.queue.length > 0) {
            setQueue(state.queue);
          }
          
          if (state.currentTrackIndex !== undefined) {
            setCurrentIndex(state.currentTrackIndex);
          }
          
          if (state.vetoActive !== undefined) {
            setVetoActive(state.vetoActive);
            lastVetoToastRef.current = state.vetoActive;
          }

          // If host has a scheduled track, schedule it locally too
          if (state.targetSyncedTime && state.queue && state.queue[state.currentTrackIndex]) {
            syncScheduler.scheduleTrack(
              state.queue[state.currentTrackIndex],
              state.targetSyncedTime,
              `track-${state.currentTrackIndex}`
            );
            syncScheduler.startCountdown();
          }
        }
        
        const userList = await getUsers();
        if (userList.length > 0) {
          setUsers(userList);
        }
      } catch (err) {
        console.error(`[Room] Error loading initial state:`, err);
      }
    };

    loadInitialState();
  }, [isConnected, myId, isHost, getState, getUsers]);

  // Guard: prevent locked members from triggering sync actions
  const requireControlAccess = useCallback((): boolean => {
    if (controlsLocked) {
      toast.error("Host has restricted member controls. You can only add songs.");
      return false;
    }
    return true;
  }, [controlsLocked]);

  /**
   * Phase 2: Host schedules a track with a synced target time.
   * This is the main entry point for the host to start a track.
   */
  const scheduleTrackForPlayback = useCallback((trackIdx: number, delayMs: number = 2000) => {
    if (!isHost) return;
    if (!syncedClock.isReady()) {
      toast.error("Clock not calibrated yet. Please wait...");
      return;
    }

    const track = queueRef.current[trackIdx];
    if (!track) return;

    // Calculate the target synced time (now + delay)
    const targetSyncedTime = syncedClock.now() + delayMs;
    
    console.log(`[Room] 📅 HOST scheduling "${track.title}" for synced time ${targetSyncedTime} (in ${delayMs}ms)`);
    
    // Schedule locally (host's own playback)
    syncScheduler.scheduleTrack(track, targetSyncedTime, `track-${trackIdx}`);
    syncScheduler.startCountdown();
    
    // Broadcast to all members
    updatePlaybackStateRef.current?.({
      currentTrackIndex: trackIdx,
      queue: queueRef.current,
      targetSyncedTime,
      isPlaying: false, // Will be triggered by scheduler
    });

    setCurrentIndex(trackIdx);
  }, [isHost]);

  const handleTogglePlay = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }

    if (schedulerIsPlaying) {
      // Currently playing -> pause
      syncScheduler.clear();
      updatePlaybackStateRef.current?.({
        isPlaying: false,
        currentTime: 0,
        targetSyncedTime: undefined,
      });
    } else {
      // Not playing -> schedule current track
      scheduleTrackForPlayback(currentIndexRef.current, 2000);
    }
  }, [isHost, schedulerIsPlaying, scheduleTrackForPlayback]);

  const handleNext = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    // Schedule next track with synced clock (2s buffer for pre-fetch)
    scheduleTrackForPlayback(nextIdx, 2000);
  }, [isHost, isShuffle, scheduleTrackForPlayback]);

  const handlePrevious = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    scheduleTrackForPlayback(prevIdx, 2000);
  }, [isHost, isShuffle, scheduleTrackForPlayback]);

  const handleTrackClick = useCallback((idx: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    scheduleTrackForPlayback(idx, 2000);
  }, [isHost, scheduleTrackForPlayback]);

  const handleSeekFromBar = useCallback((time: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    // Seek the scheduler's audio element if it's playing
    const schedulerAudio = syncScheduler.getAudioElement();
    if (schedulerAudio) {
      schedulerAudio.currentTime = time;
    }
    updatePlaybackStateRef.current?.({
      currentTime: time,
    });
  }, [isHost]);

  // Queue management - Add is open to all even during veto
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
    toast.success("Track added!");
  }, [userName, isHost]);

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
    toast.success(`Loaded: ${file.name}`);
  }, [userName, isHost]);

  // Reorder & Remove - locked for non-host members during veto
  const handleReorder = useCallback((idx: number, direction: "up" | "down") => {
    if (!isHost) {
      if (controlsLocked) {
        toast.error("Host has restricted member controls.");
        return;
      }
      toast.error("Only the host can reorder the queue.");
      return;
    }
    
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
  }, [isHost, controlsLocked]);

  const handleRemoveTrack = useCallback((idx: number) => {
    if (!isHost) {
      toast.error("Only the host can remove tracks.");
      return;
    }
    
    if (queueRef.current.length <= 1) {
      toast.error("Queue must have at least one track.");
      return;
    }
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
  }, [isHost]);

  // Host toggles veto
  const handleToggleVeto = useCallback(() => {
    if (!isHost) return;
    const next = !vetoActiveRef.current;
    setVetoActive(next);
    vetoActiveRef.current = next;
    
    toast.success(next ? "Member controls locked." : "Member controls restored.");
    
    updatePlaybackStateRef.current?.({
      vetoActive: next,
    });
  }, [isHost]);

  const handleKickUser = useCallback((targetId: string, targetName: string) => {
    if (!isHost) return;
    kickUser(targetId, targetName);
    toast.info(`Kicked ${targetName}.`);
  }, [isHost, kickUser]);

  const handleBanUser = useCallback((targetId: string, targetName: string) => {
    if (!isHost) return;
    banUser(targetId, targetName);
    toast.info(`Banned ${targetName}.`);
  }, [isHost, banUser]);

  const handleLeaveRoom = () => {
    navigate("/");
  };

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate("/");
  };

  // Session Ended Screen
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

  // Kicked Screen
  if (kicked) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-amber-100 border-2 border-amber-400 flex items-center justify-center">
            <Radio className="w-10 h-10 text-amber-600" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight uppercase">You Have Been Kicked</h1>
            <p className="text-gray-600 font-mono text-sm">
              The host has removed you from this session.
            </p>
          </div>

          <Button onClick={handleGoHome} className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 text-sm uppercase tracking-wider">
            Return to Home
          </Button>
        </div>
      </div>
    );
  }

  // Banned Screen
  if (banned) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-red-100 border-2 border-red-400 flex items-center justify-center">
            <Radio className="w-10 h-10 text-red-600" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight uppercase text-red-600">You Have Been Banned</h1>
            <p className="text-gray-600 font-mono text-sm">
              The host has permanently banned you from this session.
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
      {/* Header */}
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
            isHost={isHost}
            vetoActive={vetoActive}
            users={users}
            myId={myId}
            onToggleVeto={handleToggleVeto}
            onLeave={handleLeaveRoom}
            onKickUser={handleKickUser}
            onBanUser={handleBanUser}
          />
        </div>
      </header>

      {/* Offline Banner */}
      {!isConnected && <OfflineBanner onRetry={handleRetry} />}

      {/* Main Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Player */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {/* Status */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`}></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? "YOU ARE HOST" : "SYNCED WITH HOST"}
                </span>
              </div>
              <span className="text-gray-500">PRECISION SYNC</span>
            </div>

            <TrackInfo track={currentTrack} />

            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              isHost={isHost}
              isConnected={isConnected}
              controlsLocked={controlsLocked}
              onSeek={handleSeekFromBar}
            />

            <PlayerControls
              isPlaying={isPlaying}
              isShuffle={isShuffle}
              isMuted={isMuted}
              isHost={isHost}
              isConnected={isConnected}
              controlsLocked={controlsLocked}
              onTogglePlay={handleTogglePlay}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onToggleShuffle={() => setIsShuffle(!isShuffle)}
              onToggleMute={() => setIsMuted(!isMuted)}
            />
          </div>

          {/* Sync Status Panel */}
          <SyncStatusPanel isHost={isHost} />
        </div>

        {/* Right Column */}
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
            controlsLocked={controlsLocked}
            onTrackClick={handleTrackClick}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddSong={handleAddSong}
            onLocalFileUpload={handleLocalFileUpload}
          />
        </div>
      </main>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Precision-Synced Audio (Server-Synced Clock)
      </footer>
    </div>
  );
};

export default Room;