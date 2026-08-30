import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Track, RoomUser, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";

import RoomDrawer from "@/components/RoomDrawer";
import { PlayerControls } from "@/components/PlayerControls";
import { TrackInfo } from "@/components/TrackInfo";
import { ProgressBar } from "@/components/ProgressBar";
import { QueueList } from "@/components/QueueList";
import { UserList } from "@/components/UserList";
import { ConnectionStatus, OfflineBanner } from "@/components/ConnectionStatus";
import { HostStatusBanner } from "@/components/HostStatusBanner";

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

  // Sync refs
  const isHostRef = useRef(isHost);
  const currentIndexRef = useRef(currentIndex);

  isHostRef.current = isHost;
  currentIndexRef.current = currentIndex;

  const currentTrack = queue[currentIndex] || null;

  // Audio player hook
  const {
    isPlaying,
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
  });

  // Handle sync messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
      case "PLAY": {
        if (!isHostRef.current) {
          if (currentIndexRef.current !== msg.trackIndex) {
            setCurrentIndex(msg.trackIndex);
          }
          const latency = (Date.now() - msg.timestamp) / 1000;
          const targetTime = msg.seekTime + latency;
          seek(targetTime);
          play();
        }
        break;
      }
      case "PAUSE": {
        if (!isHostRef.current) {
          seek(msg.seekTime);
          pause();
        }
        break;
      }
      case "SEEK": {
        if (!isHostRef.current) {
          const latency = (Date.now() - msg.timestamp) / 1000;
          seek(msg.seekTime + latency);
        }
        break;
      }
      case "UPDATE_QUEUE": {
        setQueue(msg.queue);
        if (msg.activeIndex !== undefined) {
          setCurrentIndex(msg.activeIndex);
        }
        break;
      }
      case "HOST_TRANSFER": {
        if (msg.newHostId === myId) {
          setIsHost(true);
          toast.success("You are now the Host!");
        } else {
          setIsHost(false);
        }
        setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === msg.newHostId })));
        break;
      }
    }
  }, [myId, play, pause, seek]);

  // Firebase sync hook
  const { isConnected, broadcast, getUsers } = useFirebaseSync({
    roomCode,
    myId,
    userName,
    isHost,
    queue,
    currentIndex,
    isPlaying,
    onMessage: handleIncomingMessage,
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
  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
      broadcast({ type: "PAUSE", seekTime: getCurrentTime() });
    } else {
      play();
      broadcast({
        type: "PLAY",
        trackIndex: currentIndex,
        seekTime: getCurrentTime(),
        timestamp: Date.now(),
      });
    }
  }, [isPlaying, pause, play, broadcast, getCurrentTime, currentIndex]);

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;
    
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;
    
    // Pause first
    pause();
    broadcast({ type: "PAUSE", seekTime: 0 });
    
    // Then play new track
    setTimeout(() => {
      setCurrentIndex(nextIdx);
      seek(0);
      play();
      broadcast({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
    }, 100);
  }, [queue.length, isShuffle, currentIndex, pause, broadcast, seek, play]);

  const handlePrevious = useCallback(() => {
    if (queue.length === 0) return;
    
    const prevIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex - 1 + queue.length) % queue.length;
    
    // Pause first
    pause();
    broadcast({ type: "PAUSE", seekTime: 0 });
    
    // Then play new track
    setTimeout(() => {
      setCurrentIndex(prevIdx);
      seek(0);
      play();
      broadcast({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
    }, 100);
  }, [queue.length, isShuffle, currentIndex, pause, broadcast, seek, play]);

  const handleTrackClick = useCallback((idx: number) => {
    if (!isHost) return;
    
    // Pause first
    pause();
    broadcast({ type: "PAUSE", seekTime: 0 });
    
    // Then play new track
    setTimeout(() => {
      setCurrentIndex(idx);
      seek(0);
      play();
      broadcast({ type: "PLAY", trackIndex: idx, seekTime: 0, timestamp: Date.now() });
    }, 100);
  }, [isHost, pause, broadcast, seek, play]);

  // Queue management
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

  const handleReorder = useCallback((idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];

    let newActive = currentIndex;
    if (currentIndex === idx) newActive = targetIdx;
    else if (currentIndex === targetIdx) newActive = idx;

    setQueue(newQueue);
    setCurrentIndex(newActive);
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  }, [queue, currentIndex, broadcast]);

  const handleRemoveTrack = useCallback((idx: number) => {
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
  }, [queue, currentIndex, broadcast]);

  const handleTransferHost = useCallback((targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === targetUserId })));
    broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
    toast.info("Host transferred.");
  }, [isHost, broadcast]);

  const handleLeaveRoom = () => {
    navigate("/");
  };

  const handleRetry = () => {
    window.location.reload();
  };

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
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
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
              onSeek={seek}
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
              onToggleMute={() => setIsMuted(!isMuted)}
            />

            <HostStatusBanner isHost={isHost} />
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 space-y-6">
          <UserList
            users={users}
            myId={myId}
            isHost={isHost}
            onTransferHost={handleTransferHost}
          />

          <QueueList
            queue={queue}
            currentIndex={currentIndex}
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