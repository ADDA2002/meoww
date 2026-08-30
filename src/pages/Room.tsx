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
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);

  // Queue states
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);

  // Veto (host's "Let others change what's playing" toggle)
  const [vetoActive, setVetoActive] = useState<boolean>(false);

  // Session state
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);
  const [kicked, setKicked] = useState<boolean>(false);
  const [banned, setBanned] = useState<boolean>(false);

  // Sync refs
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);
  const isInitialMount = useRef(true);
  const isReorderingRef = useRef(false);
  const vetoActiveRef = useRef(vetoActive);

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

    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    setCurrentIndex(nextIdx);
  }, []);

  // Audio player hook
  const {
    isPlaying,
    isMuted,
    isLoaded,
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

  // Auto-play when track changes (for auto-advance) - skip initial mount and reordering
  useEffect(() => {
    if (!currentTrack) return;
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (isReorderingRef.current) {
      isReorderingRef.current = false;
      return;
    }
    
    play().catch((err) => {
      console.warn("Auto-play after track change failed:", err);
    });
  }, [currentIndex, currentTrack, play]);

  // Handle sync messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
      case "PLAY": {
        if (currentIndexRef.current !== msg.trackIndex) {
          setCurrentIndex(msg.trackIndex);
        }
        const latency = (Date.now() - msg.timestamp) / 1000;
        const targetTime = msg.seekTime + latency;
        seek(targetTime);
        play();
        break;
      }
      case "PAUSE": {
        seek(msg.seekTime);
        pause();
        break;
      }
      case "SEEK": {
        const latency = (Date.now() - msg.timestamp) / 1000;
        seek(msg.seekTime + latency);
        break;
      }
      case "UPDATE_QUEUE": {
        isReorderingRef.current = true;
        setQueue(msg.queue);
        if (msg.activeIndex !== undefined) {
          setCurrentIndex(msg.activeIndex);
        }
        break;
      }
      case "VETO_TOGGLE": {
        setVetoActive(msg.active);
        if (msg.active) {
          if (msg.hostId === myId) {
            toast.success("Member controls locked. You're in solo mode.");
          } else {
            toast("Host restricted controls. You can add songs only.", {
              icon: "🔒",
            });
          }
        } else {
          if (msg.hostId === myId) {
            toast.success("Member controls restored.");
          } else {
            toast("Host restored member controls.", {
              icon: "🔓",
            });
          }
        }
        break;
      }
      case "KICK_USER": {
        if (msg.targetId === myId) {
          setKicked(true);
          toast.error(`You have been kicked by the host${msg.reason ? `: ${msg.reason}` : ""}`);
        } else {
          toast.info(`${msg.targetName} has been kicked from the session.`);
          setUsers(prev => prev.filter(u => u.id !== msg.targetId));
        }
        break;
      }
      case "BAN_USER": {
        if (msg.targetId === myId) {
          setBanned(true);
          toast.error(`You have been banned from this session${msg.reason ? `: ${msg.reason}` : ""}`);
        } else {
          toast.info(`${msg.targetName} has been banned from the session.`);
          setUsers(prev => prev.filter(u => u.id !== msg.targetId));
        }
        break;
      }
    }
  }, [myId, play, pause, seek]);

  // Handle session ended
  const handleSessionEnded = useCallback(() => {
    setSessionEnded(true);
  }, []);

  // Firebase sync hook
  const { isConnected, broadcast, kickUser, banUser, getUsers } = useFirebaseSync({
    roomCode,
    myId,
    userName,
    isHost,
    queue,
    currentIndex,
    isPlaying,
    onMessage: handleIncomingMessage,
    onSessionEnded: handleSessionEnded,
  });

  // Initialize connection
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `host-${roomCode.toLowerCase()}`
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);
  }, [roomCode]);

  // Load initial users once connected
  useEffect(() => {
    if (!isConnected || !myId) return;

    getUsers().then((userList) => {
      if (userList.length > 0) {
        setUsers(userList);
      }
    });
  }, [isConnected, myId, getUsers]);

  // Playback controls
  const playRef = useRef(play);
  const pauseRef = useRef(pause);
  const seekRef = useRef(seek);
  const broadcastRef = useRef(broadcast);

  playRef.current = play;
  pauseRef.current = pause;
  seekRef.current = seek;
  broadcastRef.current = broadcast;

  // Guard: prevent locked members from triggering sync actions
  const requireControlAccess = useCallback((): boolean => {
    if (controlsLocked) {
      toast.error("Host has restricted member controls. You can only add songs.");
      return false;
    }
    return true;
  }, [controlsLocked]);

  const handleTogglePlay = useCallback(() => {
    if (!requireControlAccess()) return;

    if (isPlaying) {
      pauseRef.current();
      broadcastRef.current({ type: "PAUSE", seekTime: getCurrentTime() });
    } else {
      playRef.current();
      broadcastRef.current({
        type: "PLAY",
        trackIndex: currentIndex,
        seekTime: getCurrentTime(),
        timestamp: Date.now(),
      });
    }
  }, [isPlaying, currentIndex, getCurrentTime, requireControlAccess]);

  const handleNext = useCallback(() => {
    if (!requireControlAccess()) return;
    if (queue.length === 0) return;
    
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;

    setCurrentIndex(nextIdx);
    pauseRef.current();
    broadcastRef.current({ type: "PAUSE", seekTime: 0 });
    
    setTimeout(() => {
      seekRef.current(0);
      playRef.current();
      broadcastRef.current({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
    }, 50);
  }, [queue.length, isShuffle, currentIndex, requireControlAccess]);

  const handlePrevious = useCallback(() => {
    if (!requireControlAccess()) return;
    if (queue.length === 0) return;
    
    const prevIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex - 1 + queue.length) % queue.length;

    setCurrentIndex(prevIdx);
    pauseRef.current();
    broadcastRef.current({ type: "PAUSE", seekTime: 0 });
    
    setTimeout(() => {
      seekRef.current(0);
      playRef.current();
      broadcastRef.current({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
    }, 50);
  }, [queue.length, isShuffle, currentIndex, requireControlAccess]);

  const handleTrackClick = useCallback((idx: number) => {
    if (!requireControlAccess()) return;

    setCurrentIndex(idx);
    pauseRef.current();
    broadcastRef.current({ type: "PAUSE", seekTime: 0 });
    
    setTimeout(() => {
      seekRef.current(0);
      playRef.current();
      broadcastRef.current({ type: "PLAY", trackIndex: idx, seekTime: 0, timestamp: Date.now() });
    }, 50);
  }, [requireControlAccess]);

  const handleSeekFromBar = useCallback((time: number) => {
    if (!requireControlAccess()) return;
    seekRef.current(time);
    broadcastRef.current({ type: "SEEK", seekTime: time, timestamp: Date.now() });
  }, [requireControlAccess]);

  // Queue management - "Add" stays open to all members even during veto
  const handleAddSong = useCallback((song: { title: string; artist: string; url: string }) => {
    const newTrack: Track = {
      id: `track-${Date.now()}`,
      title: song.title,
      artist: song.artist || "Independent Artist",
      url: song.url,
      addedBy: userName,
    };

    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });
    toast.success("Track added!");
  }, [queue, currentIndex, userName, broadcast]);

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

    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });
    toast.success(`Loaded: ${file.name}`);
  }, [queue, currentIndex, userName, broadcast]);

  // Reorder & Remove are locked for non-host members during veto
  const handleReorder = useCallback((idx: number, direction: "up" | "down") => {
    if (!requireControlAccess()) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];

    let newActive = currentIndex;
    if (currentIndex === idx) newActive = targetIdx;
    else if (currentIndex === targetIdx) newActive = idx;

    isReorderingRef.current = true;
    
    setQueue(newQueue);
    setCurrentIndex(newActive);
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  }, [queue, currentIndex, broadcast, requireControlAccess]);

  const handleRemoveTrack = useCallback((idx: number) => {
    if (!requireControlAccess()) return;
    if (queue.length <= 1) {
      toast.error("Queue must have at least one track.");
      return;
    }
    const newQueue = queue.filter((_, i) => i !== idx);
    let newActive = currentIndex;
    if (idx < currentIndex) newActive = currentIndex - 1;
    else if (idx === currentIndex) newActive = Math.min(currentIndex, newQueue.length - 1);
    
    setQueue(newQueue);
    setCurrentIndex(newActive);
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  }, [queue, currentIndex, broadcast, requireControlAccess]);

  // Host toggles the "Power of Veto"
  const handleToggleVeto = useCallback(() => {
    if (!isHost) return;
    const next = !vetoActiveRef.current;
    setVetoActive(next);
    vetoActiveRef.current = next;
    broadcast({ type: "VETO_TOGGLE", active: next, hostId: myId });
  }, [isHost, broadcast, myId]);

  // Moderation - Kick user
  const handleKickUser = useCallback((targetId: string, targetName: string) => {
    if (!isHost) return;
    kickUser(targetId, targetName);
    toast.info(`Kicked ${targetName} from the session.`);
  }, [isHost, kickUser]);

  // Moderation - Ban user
  const handleBanUser = useCallback((targetId: string, targetName: string) => {
    if (!isHost) return;
    banUser(targetId, targetName);
    toast.info(`Banned ${targetName} from the session.`);
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
              The host has left the session. The Jam cannot exist without the host.
            </p>
          </div>

          <div className="border border-gray-200 bg-gray-50 p-4 text-left space-y-2">
            <p className="text-xs font-mono uppercase text-gray-500">What happened?</p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• The host closed their app or left</li>
              <li>• The session is now terminated for everyone</li>
              <li>• Members cannot keep a hostless room alive</li>
            </ul>
          </div>

          <Button
            onClick={handleGoHome}
            className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 text-sm uppercase tracking-wider"
          >
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
              The host has removed you from this session. You may rejoin if the host allows it.
            </p>
          </div>

          <div className="border border-gray-200 bg-gray-50 p-4 text-left space-y-2">
            <p className="text-xs font-mono uppercase text-gray-500">What happened?</p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• The host removed you from this session</li>
              <li>• Your playback is now stopped</li>
              <li>• Contact the host if you believe this was a mistake</li>
            </ul>
          </div>

          <Button
            onClick={handleGoHome}
            className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 text-sm uppercase tracking-wider"
          >
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
              The host has permanently banned you from this session. You cannot rejoin.
            </p>
          </div>

          <div className="border border-red-200 bg-red-50 p-4 text-left space-y-2">
            <p className="text-xs font-mono uppercase text-red-500">What happened?</p>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• You were removed and banned from this session</li>
              <li>• You cannot rejoin with the same room code</li>
              <li>• Contact the host if you believe this was a mistake</li>
            </ul>
          </div>

          <Button
            onClick={handleGoHome}
            className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3 text-sm uppercase tracking-wider"
          >
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
              <span className="text-gray-500">FIREBASE REALTIME</span>
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
        Meoww - Firebase Powered Audio Sync
      </footer>
    </div>
  );
};

export default Room;