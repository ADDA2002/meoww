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

import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useFirebaseSync } from "@/hooks/useFirebaseSync";
import { FirebaseSyncState } from "@/lib/firebaseSignaling";

// Drift threshold: if drift exceeds this, hard-seek instead of gentle nudge
const DRIFT_HARD_THRESHOLD_SEC = 1.5;
// Drift threshold: if drift exceeds this, nudge by adjusting playback rate
const DRIFT_NUDGE_THRESHOLD_SEC = 0.3;

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

  // Playback state for UI display
  // For LISTENERS: this tracks whether the listener has chosen to follow the host's playback
  // When listener presses play, they opt-in to following host's sync. When they press pause, they opt-out.
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Refs for sync
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const vetoActiveRef = useRef(vetoActive);
  const isInitializedRef = useRef(false);
  const lastVetoToastRef = useRef<boolean | null>(null);
  const latestStateRef = useRef<FirebaseSyncState | null>(null);
  
  // Track if user has opted in to following host playback
  // When true, listener will auto-play when host plays, auto-pause when host pauses
  // When false, listener is independent (won't follow host's play/pause)
  const isFollowingHostRef = useRef<boolean>(false);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;
  vetoActiveRef.current = vetoActive;

  const currentTrack = queue[currentIndex] || null;
  const controlsLocked = !isHost && vetoActive;

  // Audio player hook
  const {
    isMuted,
    setIsMuted,
    currentTime,
    duration,
    play,
    pause,
    seek,
    getCurrentTime,
    setPlaybackRate,
    getAudioElement,
    audioRef,
  } = useAudioPlayer({
    track: currentTrack,
    isHost,
    onTimeUpdate: () => {},
    onTrackEnded: handleTrackEnded,
  });

  // Handle track end - advance to next track
  function handleTrackEnded() {
    if (queueRef.current.length === 0) return;

    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    setCurrentIndex(nextIdx);
    
    // Auto-advance: play next track automatically (host only)
    if (isHost) {
      setTimeout(() => {
        playRef.current?.();
        isFollowingHostRef.current = true;
        // Sync the new track
        updatePlaybackStateRef.current?.({
          currentTrackIndex: nextIdx,
          startEpoch: null, // Will be set when play is called
          serverElapsedMs: null,
          trackDuration: null,
        });
      }, 100);
    }
  }

  const playRef = useRef(play);
  const pauseRef = useRef(pause);
  const seekRef = useRef(seek);
  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);
  const getServerTimeRef = useRef<(() => number) | null>(null);
  const setPlaybackRateRef = useRef<((rate: number) => void) | null>(null);

  playRef.current = play;
  pauseRef.current = pause;
  seekRef.current = seek;
  setPlaybackRateRef.current = setPlaybackRate;

  // Handle state changes from Firebase - ELAPSED-TIME SYNC
  // IMPORTANT: 
  //   - Host updates ARE applied regardless
  //   - Member: only auto-plays/auto-pauses if they've opted in (isFollowingHostRef)
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    console.log(`[Room] State change:`, state);
    latestStateRef.current = state;
    
    // Only non-host members should follow host's state
    if (isHost) return;
    
    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];
    const newVetoActive = state.vetoActive ?? true;
    const startEpoch = state.startEpoch; // server time when track started
    const serverElapsedMs = state.serverElapsedMs;
    
    // Update queue if different
    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      console.log(`[Room] Updating queue from state: ${newQueue.length} tracks`);
      setQueue(newQueue);
    }
    
    // Handle veto state change
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
    
    // Handle track change
    if (newIndex !== currentIndexRef.current) {
      console.log(`[Room] Track change: ${currentIndexRef.current} -> ${newIndex}`);
      setCurrentIndex(newIndex);
      
      // If we have startEpoch and elapsed info, sync position
      if (startEpoch !== null && serverElapsedMs !== null) {
        const seekTo = serverElapsedMs / 1000;
        console.log(`[Room] Track change: seeking to ${seekTo.toFixed(2)}s`);
        
        // Wait for the new track to load before seeking
        setTimeout(() => {
          seekRef.current(seekTo);
          // Only auto-play if listener is following host
          if (isFollowingHostRef.current) {
            playRef.current?.();
            setIsPlaying(true);
          }
        }, 200);
      } else {
        // Paused state - don't auto-pause if following, host will send play
        if (isFollowingHostRef.current) {
          pauseRef.current?.();
          setIsPlaying(false);
        }
      }
    } else if (startEpoch !== null && serverElapsedMs !== null) {
      // Same track, host pressed play
      const seekTo = serverElapsedMs / 1000;
      const timeDiff = Math.abs(getCurrentTime() - seekTo);
      
      // If listener is following host, sync position and play
      if (isFollowingHostRef.current) {
        if (timeDiff > DRIFT_HARD_THRESHOLD_SEC) {
          console.log(`[Room] Hard seek to ${seekTo.toFixed(2)}s (drift: ${timeDiff.toFixed(2)}s)`);
          seekRef.current(seekTo);
        }
        playRef.current?.();
        setIsPlaying(true);
      } else {
        // Listener not following, but still sync position silently
        if (timeDiff > DRIFT_HARD_THRESHOLD_SEC) {
          seekRef.current(seekTo);
        }
      }
    } else if (startEpoch === null) {
      // Host paused - only auto-pause if listener is following
      if (isFollowingHostRef.current) {
        const newPos = (serverElapsedMs || 0) / 1000;
        if (Math.abs(getCurrentTime() - newPos) > 0.1) {
          seekRef.current(newPos);
        }
        pauseRef.current?.();
        setIsPlaying(false);
      }
      // Always reset playback rate when paused
      setPlaybackRateRef.current?.(1.0);
    }
  }, [isHost]);

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

  const handleSessionEnded = useCallback(() => {
    console.log(`[Room] Session ended`);
    isFollowingHostRef.current = false;
    setSessionEnded(true);
  }, []);

  // Initialize connection
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `host-${roomCode.toLowerCase()}`
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);
  }, [roomCode, isHost]);

  // Firebase sync hook
  const { isConnected, updatePlaybackState, kickUser, banUser, getUsers, getState, getServerTime, getClockOffset } = useFirebaseSync({
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
    updatePlaybackStateRef.current = updatePlaybackState;
    getServerTimeRef.current = getServerTime;
  }, [updatePlaybackState, getServerTime]);

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
          
          // Sync position to current track - do NOT auto-play
          if (state.startEpoch !== null && state.serverElapsedMs !== null) {
            const seekTo = state.serverElapsedMs / 1000;
            console.log(`[Room] Joining mid-track: seeking to ${seekTo.toFixed(2)}s (waiting for user to press play)`);
            setTimeout(() => {
              seekRef.current(seekTo);
            }, 300);
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

  // ============================
  // DRIFT CORRECTION (MEMBERS following host)
  // ============================
  useEffect(() => {
    if (isHost || !isConnected) return;
    
    const driftCheckInterval = setInterval(() => {
      // Only correct drift if user is following host
      if (!isFollowingHostRef.current) return;
      
      const state = latestStateRef.current;
      if (!state) return;
      if (state.startEpoch === null || state.serverElapsedMs === null) return;
      
      // Calculate what our local time should be
      const timeSinceUpdate = Date.now() - state.lastUpdated;
      const expectedElapsedMs = state.serverElapsedMs + timeSinceUpdate;
      const expectedElapsedSec = expectedElapsedMs / 1000;
      
      // Our current playback position
      const myCurrentSec = getCurrentTime();
      const drift = myCurrentSec - expectedElapsedSec;
      
      // Apply correction
      if (Math.abs(drift) > DRIFT_HARD_THRESHOLD_SEC) {
        console.log(`[Room] HARD SEEK: drift=${drift.toFixed(2)}s, seeking to ${expectedElapsedSec.toFixed(2)}s`);
        seekRef.current(expectedElapsedSec);
        setPlaybackRateRef.current?.(1.0);
      } else if (Math.abs(drift) > DRIFT_NUDGE_THRESHOLD_SEC) {
        const correctionRate = 1.0 - (drift * 0.05);
        const clampedRate = Math.max(0.95, Math.min(1.05, correctionRate));
        setPlaybackRateRef.current?.(clampedRate);
        console.log(`[Room] NUDGE: drift=${drift.toFixed(2)}s, rate=${clampedRate.toFixed(3)}`);
      } else {
        if (getAudioElement() && Math.abs(getAudioElement()!.playbackRate - 1.0) > 0.01) {
          setPlaybackRateRef.current?.(1.0);
        }
      }
    }, 2000);
    
    return () => clearInterval(driftCheckInterval);
  }, [isHost, isConnected, getCurrentTime, getAudioElement]);

  // ============================
  // HOST CONTROLS
  // ============================
  const handleTogglePlay = useCallback(() => {
    if (isHost) {
      // HOST: regular play/pause, broadcasts to members
      if (isPlaying) {
        pauseRef.current?.();
        setIsPlaying(false);
        const currentPos = getCurrentTime();
        updatePlaybackStateRef.current?.({
          currentTrackIndex: currentIndexRef.current,
          startEpoch: null,
          serverElapsedMs: currentPos * 1000,
          trackDuration: (audioRef.current?.duration || 0) * 1000,
          queue: queueRef.current,
        });
      } else {
        const serverNow = getServerTimeRef.current?.() || Date.now();
        const audio = audioRef.current;
        const currentPos = audio?.currentTime || 0;
        const totalDuration = audio?.duration || 0;
        const remainingMs = (totalDuration - currentPos) * 1000;
        
        console.log(`[Room] HOST Play: serverNow=${serverNow}, currentPos=${currentPos}s, remaining=${remainingMs}ms`);
        
        playRef.current?.();
        setIsPlaying(true);
        
        updatePlaybackStateRef.current?.({
          currentTrackIndex: currentIndexRef.current,
          startEpoch: serverNow,
          serverElapsedMs: 0,
          trackDuration: remainingMs,
          queue: queueRef.current,
        });
      }
    } else {
      // MEMBER: toggling play means opt-in/out of following host
      if (isPlaying) {
        // Currently following, so pause locally and opt-out
        pauseRef.current?.();
        setIsPlaying(false);
        isFollowingHostRef.current = false;
        toast("Paused - You're no longer following the host.");
      } else {
        // Not playing, opt-in to follow host
        const state = latestStateRef.current;
        if (state) {
          // Seek to current host position
          if (state.startEpoch !== null && state.serverElapsedMs !== null) {
            const timeSinceUpdate = Date.now() - state.lastUpdated;
            const expectedElapsedMs = state.serverElapsedMs + timeSinceUpdate;
            const seekTo = expectedElapsedMs / 1000;
            seekRef.current(seekTo);
            playRef.current?.();
            setIsPlaying(true);
            isFollowingHostRef.current = true;
            toast.success("Now synced with host!");
          } else {
            // Host is paused - listener should also stay paused
            // Just seek to current position
            if (state.serverElapsedMs !== null) {
              seekRef.current(state.serverElapsedMs / 1000);
            }
            toast("Host is paused. Press play again when host resumes.");
          }
        } else {
          toast.error("No sync state available. Wait for connection.");
        }
      }
    }
  }, [isHost, isPlaying, getCurrentTime]);

  const handleNext = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    isFollowingHostRef.current = true;
    
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    setCurrentIndex(nextIdx);
    setTimeout(() => {
      playRef.current?.();
      const serverNow = getServerTimeRef.current?.() || Date.now();
      const audio = audioRef.current;
      const totalDuration = audio?.duration || 0;
      
      updatePlaybackStateRef.current?.({
        isPlaying: true,
        currentTrackIndex: nextIdx,
        startEpoch: serverNow,
        serverElapsedMs: 0,
        trackDuration: totalDuration * 1000,
        queue: queueRef.current,
      });
    }, 100);
  }, [isHost]);

  const handlePrevious = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    isFollowingHostRef.current = true;
    
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    setCurrentIndex(prevIdx);
    setTimeout(() => {
      playRef.current?.();
      const serverNow = getServerTimeRef.current?.() || Date.now();
      const audio = audioRef.current;
      const totalDuration = audio?.duration || 0;
      
      updatePlaybackStateRef.current?.({
        isPlaying: true,
        currentTrackIndex: prevIdx,
        startEpoch: serverNow,
        serverElapsedMs: 0,
        trackDuration: totalDuration * 1000,
        queue: queueRef.current,
      });
    }, 100);
  }, [isHost]);

  const handleTrackClick = useCallback((idx: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    setCurrentIndex(idx);
    isFollowingHostRef.current = true;
    
    setTimeout(() => {
      playRef.current?.();
      const serverNow = getServerTimeRef.current?.() || Date.now();
      const audio = audioRef.current;
      const totalDuration = audio?.duration || 0;
      
      updatePlaybackStateRef.current?.({
        isPlaying: true,
        currentTrackIndex: idx,
        startEpoch: serverNow,
        serverElapsedMs: 0,
        trackDuration: totalDuration * 1000,
        queue: queueRef.current,
      });
    }, 100);
  }, [isHost]);

  const handleSeekFromBar = useCallback((time: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    seekRef.current(time);
    if (isPlaying) {
      const serverNow = getServerTimeRef.current?.() || Date.now();
      const audio = audioRef.current;
      const remainingMs = (audio?.duration || 0) * 1000 - time * 1000;
      
      updatePlaybackStateRef.current?.({
        startEpoch: serverNow,
        serverElapsedMs: time * 1000,
        trackDuration: remainingMs,
      });
    } else {
      updatePlaybackStateRef.current?.({
        startEpoch: null,
        serverElapsedMs: time * 1000,
      });
    }
  }, [isHost, isPlaying]);

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
    toast.success(`Loaded: ${file.name}`);
  }, [userName]);

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

      {!isConnected && <OfflineBanner onRetry={handleRetry} />}

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`}></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? "YOU ARE HOST" : (isPlaying ? "FOLLOWING HOST" : "SYNCED WITH HOST")}
                </span>
              </div>
              <span className="text-gray-500">ELAPSED-TIME SYNC</span>
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
            
            {/* Hint for listeners about play/pause semantics */}
            {!isHost && (
              <p className="text-[10px] text-gray-400 font-mono text-center mt-3">
                {isPlaying 
                  ? "▶ FOLLOWING HOST — Press pause to stop following" 
                  : "⏸ Press play to sync with host's current position"}
              </p>
            )}
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
        Meoww - NTP + Elapsed-Time Audio Sync
      </footer>
    </div>
  );
};

export default Room;