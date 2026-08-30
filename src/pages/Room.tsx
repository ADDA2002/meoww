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

  // Sync-gate tracking
  // hostReady[userId] = true means that user has buffered the current track
  const [hostReady, setHostReady] = useState<boolean>(false);
  const [memberReadyMap, setMemberReadyMap] = useState<Record<string, boolean>>({});
  const [gateOpen, setGateOpen] = useState<boolean>(false);
  const [waitingForReady, setWaitingForReady] = useState<boolean>(false);

  // Audio state - driven by syncScheduler for both host and members
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [schedulerIsPlaying, setSchedulerIsPlaying] = useState(false);
  const isPlaying = schedulerIsPlaying;

  // Refs for sync
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const vetoActiveRef = useRef(vetoActive);
  const isInitializedRef = useRef(false);
  const lastVetoToastRef = useRef<boolean | null>(null);
  const isClockCalibratedRef = useRef(false);
  const memberReadyMapRef = useRef<Record<string, boolean>>({});
  const currentGatingTrackIdRef = useRef<string | null>(null);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;
  vetoActiveRef.current = vetoActive;
  memberReadyMapRef.current = memberReadyMap;

  const currentTrack = queue[currentIndex] || null;
  const controlsLocked = !isHost && vetoActive;

  // Subscribe to syncScheduler to track playback state, time, and duration
  useEffect(() => {
    const audioEl = syncScheduler.getAudioElement();

    const handleTimeUpdate = () => {
      setCurrentTime(audioEl.currentTime || 0);
    };
    const handleLoadedMetadata = () => {
      setDuration(audioEl.duration || 0);
    };
    const handlePlay = () => {
      console.log("[Room] 🎵 audioElement play event fired!");
      setSchedulerIsPlaying(true);
    };
    const handlePause = () => {
      console.log("[Room] ⏸️ audioElement pause event fired!");
      setSchedulerIsPlaying(false);
    };
    const handleEnded = () => {
      console.log("[Room] ⏹️ audioElement ended event fired!");
      setSchedulerIsPlaying(false);
      if (isHost && queueRef.current.length > 0) {
        const nextIdx = isShuffleRef.current
          ? Math.floor(Math.random() * queueRef.current.length)
          : (currentIndexRef.current + 1) % queueRef.current.length;

        setCurrentIndex(nextIdx);
        const nextTrack = queueRef.current[nextIdx];
        if (nextTrack && syncedClock.isReady()) {
          scheduleTrackWithGate(nextTrack, nextIdx, 2000);
        }
      }
    };

    audioEl.addEventListener("timeupdate", handleTimeUpdate);
    audioEl.addEventListener("loadedmetadata", handleLoadedMetadata);
    audioEl.addEventListener("play", handlePlay);
    audioEl.addEventListener("pause", handlePause);
    audioEl.addEventListener("ended", handleEnded);

    return () => {
      audioEl.removeEventListener("timeupdate", handleTimeUpdate);
      audioEl.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioEl.removeEventListener("play", handlePlay);
      audioEl.removeEventListener("pause", handlePause);
      audioEl.removeEventListener("ended", handleEnded);
    };
  }, [isHost]);

  // When our local buffer is ready, broadcast READY to the room
  useEffect(() => {
    const unsubscribe = syncScheduler.onTrackReady((trackId) => {
      console.log(`[Room] ✅ Local buffer ready for trackId: ${trackId}, broadcasting READY`);
      broadcast({
        type: "READY",
        userId: myId,
        trackId,
        userName,
      });
      
      // Mark ourselves as ready locally
      if (isHost) {
        setHostReady(true);
      } else {
        setMemberReadyMap(prev => ({ ...prev, [myId]: true }));
      }
    });
    return () => unsubscribe();
  }, [myId, userName, isHost]);

  const handleSeek = useCallback((time: number) => {
    const audioEl = syncScheduler.getAudioElement();
    audioEl.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    syncScheduler.getAudioElement().muted = next;
  }, [isMuted]);

  const updatePlaybackStateRef = useRef<((updates: Partial<FirebaseSyncState>) => void) | null>(null);
  const broadcastRef = useRef<((msg: SyncMessage) => void) | null>(null);

  // Phase 1: Calibrate the synced clock when the room is ready
  useEffect(() => {
    if (!myId || !roomCode) return;
    if (isClockCalibratedRef.current) return;
    
    isClockCalibratedRef.current = true;
    syncedClock.calibrate(5).then(() => {
      console.log(`[Room] ✅ Clock calibrated, sync ready`);
    });
  }, [myId, roomCode]);

  /**
   * The CORE gate logic: schedule a track, but only start countdown
   * once both host and member have signaled READY.
   */
  const scheduleTrackWithGate = useCallback((track: Track, trackIdx: number, delayMs: number = 2000) => {
    if (!syncedClock.isReady()) {
      toast.error("Clock not calibrated yet. Please wait...");
      return;
    }

    const targetSyncedTime = syncedClock.now() + delayMs;
    const trackId = `track-${trackIdx}-${Date.now()}`;
    currentGatingTrackIdRef.current = trackId;
    
    console.log(`[Room] 📅 Scheduling "${track.title}" (trackId: ${trackId}) for synced time ${targetSyncedTime}`);
    
    // Enable the gate BEFORE scheduling
    syncScheduler.enableSyncGate(trackId);
    syncScheduler.scheduleTrack(track, targetSyncedTime, `track-${trackIdx}`, trackId);
    syncScheduler.startCountdown();
    
    setWaitingForReady(true);
    setGateOpen(false);
    setHostReady(false);
    setMemberReadyMap({});
    memberReadyMapRef.current = {};

    // Announce to the room: prepare to play this track
    broadcastRef.current?.({
      type: "TRACK_PREPARE",
      trackId,
      trackIndex: trackIdx,
      queue: queueRef.current,
    });

    // Also broadcast state so non-host members can fetch
    updatePlaybackStateRef.current?.({
      currentTrackIndex: trackIdx,
      queue: queueRef.current,
      targetSyncedTime,
      isPlaying: false,
    });

    setCurrentIndex(trackIdx);
  }, []);

  /**
   * Check if all parties are ready, and if so, unlock the gate.
   * Called whenever ready state changes.
   */
  const evaluateGate = useCallback(() => {
    if (!currentGatingTrackIdRef.current) return;
    if (!isHost) return; // Only host decides when to unlock

    const otherMembers = users.filter(u => !u.isHost);
    
    // If no other members in the room, host is the only one — proceed
    if (otherMembers.length === 0) {
      console.log(`[Room] 🚪 No other members — host ready alone is enough, unlocking gate`);
      syncScheduler.unlockCountdown();
      setGateOpen(true);
      setWaitingForReady(false);
      return;
    }

    // Check: is host ready AND all members ready?
    const allMembersReady = otherMembers.every(m => memberReadyMapRef.current[m.id]);
    
    if (hostReady && allMembersReady) {
      console.log(`[Room] 🚪 All parties ready! Unlocking countdown gate.`);
      syncScheduler.unlockCountdown();
      setGateOpen(true);
      setWaitingForReady(false);
      // Tell members they can drop
      broadcastRef.current?.({
        type: "READY",
        userId: "host-gate-open",
        trackId: currentGatingTrackIdRef.current,
        userName: "host",
      });
    } else {
      const waiting = otherMembers.filter(m => !memberReadyMapRef.current[m.id]).map(m => m.name);
      console.log(`[Room] 🚪 Gate still closed. Host ready: ${hostReady}, waiting on: ${waiting.join(", ")}`);
    }
  }, [isHost, users, hostReady]);

  // Re-evaluate gate whenever readiness changes
  useEffect(() => {
    evaluateGate();
  }, [hostReady, memberReadyMap, users, evaluateGate]);

  // Handle state changes from Firebase
  const handleStateChange = useCallback((state: FirebaseSyncState) => {
    console.log(`[Room] State change received:`, JSON.stringify(state, null, 2));
    
    if (isHost) return;
    
    const newIndex = state.currentTrackIndex ?? 0;
    const newQueue = state.queue || [];
    const newVetoActive = state.vetoActive ?? true;
    const newTargetSyncedTime = state.targetSyncedTime;
    const newIsPlaying = state.isPlaying ?? false;
    
    if (newQueue.length > 0 && JSON.stringify(newQueue) !== JSON.stringify(queueRef.current)) {
      setQueue(newQueue);
    }
    
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
    
    if (newTargetSyncedTime && newIndex !== undefined) {
      const trackToSchedule = newQueue[newIndex];
      if (trackToSchedule) {
        console.log(`[Room] 📅 MEMBER: Received scheduled track: "${trackToSchedule.title}"`);
        
        syncScheduler.clear();
        
        const trackId = `track-${newIndex}-${Date.now()}`;
        currentGatingTrackIdRef.current = trackId;
        syncScheduler.enableSyncGate(trackId);
        syncScheduler.scheduleTrack(trackToSchedule, newTargetSyncedTime, `track-${newIndex}`, trackId);
        syncScheduler.startCountdown();
        
        setCurrentIndex(newIndex);
        setWaitingForReady(true);
        setGateOpen(false);
        setMemberReadyMap({});
        memberReadyMapRef.current = {};
      }
    } else if (newIndex !== currentIndexRef.current) {
      setCurrentIndex(newIndex);
    }

    if (newIsPlaying && !newTargetSyncedTime) {
      const audioEl = syncScheduler.getAudioElement();
      if (audioEl.paused) audioEl.play().catch(console.error);
    } else if (!newIsPlaying && !newTargetSyncedTime) {
      const audioEl = syncScheduler.getAudioElement();
      if (!audioEl.paused) audioEl.pause();
    }
  }, [isHost]);

  // Handle instant messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    console.log(`[Room] Received message:`, msg.type);
    
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
        
      case "READY": {
        // A participant (or host) has buffered the current track
        if (msg.userId === "host-gate-open") {
          // Host says: gate is open, you can play
          console.log(`[Room] 🚪 Host says gate is open!`);
          syncScheduler.unlockCountdown();
          setGateOpen(true);
          setWaitingForReady(false);
        } else {
          // A member has buffered the track
          console.log(`[Room] ✅ Member ${msg.userName} (${msg.userId}) is ready`);
          if (msg.trackId === currentGatingTrackIdRef.current) {
            setMemberReadyMap(prev => {
              const next = { ...prev, [msg.userId]: true };
              memberReadyMapRef.current = next;
              return next;
            });
          }
        }
        break;
      }
        
      case "TRACK_PREPARE": {
        // Host is preparing a new track — clear our state
        console.log(`[Room] 📥 Host preparing track: ${msg.trackId}`);
        currentGatingTrackIdRef.current = msg.trackId;
        syncScheduler.clear();
        
        if (msg.queue) setQueue(msg.queue);
        setCurrentIndex(msg.trackIndex);
        setWaitingForReady(true);
        setGateOpen(false);
        setMemberReadyMap({});
        memberReadyMapRef.current = {};
        break;
      }
        
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
    setSessionEnded(true);
  }, []);

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
      try {
        const state = await getState();
        if (state) {
          if (state.queue && state.queue.length > 0) setQueue(state.queue);
          if (state.currentTrackIndex !== undefined) setCurrentIndex(state.currentTrackIndex);
          if (state.vetoActive !== undefined) {
            setVetoActive(state.vetoActive);
            lastVetoToastRef.current = state.vetoActive;
          }

          // If host has a scheduled track that is still in the future, schedule it
          if (state.targetSyncedTime && state.queue && state.queue[state.currentTrackIndex]) {
            if (syncedClock.isReady() && syncedClock.now() < state.targetSyncedTime) {
              const trackId = `track-${state.currentTrackIndex}-${Date.now()}`;
              currentGatingTrackIdRef.current = trackId;
              syncScheduler.enableSyncGate(trackId);
              syncScheduler.scheduleTrack(
                state.queue[state.currentTrackIndex],
                state.targetSyncedTime,
                `track-${state.currentTrackIndex}`,
                trackId
              );
              syncScheduler.startCountdown();
              setWaitingForReady(true);
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
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }

    const audioEl = syncScheduler.getAudioElement();
    
    if (!audioEl.paused) {
      audioEl.pause();
      syncScheduler.stopCountdown();
      updatePlaybackStateRef.current?.({
        isPlaying: false,
        targetSyncedTime: undefined,
      });
    } else {
      scheduleTrackWithGate(currentIndexRef.current, 2000);
    }
  }, [isHost, scheduleTrackWithGate]);

  const handleNext = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    scheduleTrackWithGate(nextIdx, 2000);
  }, [isHost, isShuffle, scheduleTrackWithGate]);

  const handlePrevious = useCallback(() => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    if (queueRef.current.length === 0) return;
    
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    scheduleTrackWithGate(prevIdx, 2000);
  }, [isHost, isShuffle, scheduleTrackWithGate]);

  const handleTrackClick = useCallback((idx: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    scheduleTrackWithGate(idx, 2000);
  }, [isHost, scheduleTrackForPlayback]);

  const handleSeekFromBar = useCallback((time: number) => {
    if (!isHost) {
      toast.error("Only the host can control playback.");
      return;
    }
    const schedulerAudio = syncScheduler.getAudioElement();
    schedulerAudio.currentTime = time;
    updatePlaybackStateRef.current?.({
      currentTime: time,
    });
  }, [isHost]);

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

  // Determine gate status display
  const otherMembers = users.filter(u => !u.isHost);
  const readyCount = (isHost ? (hostReady ? 1 : 0) : 0) + 
    otherMembers.filter(m => memberReadyMap[m.id]).length;
  const totalCount = (isHost ? 1 : 0) + otherMembers.length;
  const showGateStatus = waitingForReady && !gateOpen;

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

      {/* Sync gate banner */}
      {showGateStatus && (
        <div className="bg-blue-50 border-b border-blue-300 px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-mono text-blue-900">
            <span className="w-2 h-2 bg-blue-600 animate-pulse"></span>
            <span>Syncing audio... {readyCount}/{totalCount} ready</span>
          </div>
          <span className="text-xs font-mono text-blue-700">
            {totalCount === readyCount ? "All set!" : "Buffering..."}
          </span>
        </div>
      )}

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
              onToggleMute={handleToggleMute}
            />
          </div>

          <SyncStatusPanel isHost={isHost} />
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
        Meoww - Precision-Synced Audio (Server-Synced Clock)
      </footer>
    </div>
  );
};

export default Room;