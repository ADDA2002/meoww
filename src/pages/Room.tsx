import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Peer, { DataConnection } from "peerjs";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { Player } from "@/components/Player";
import { Queue } from "@/components/Queue";
import { Participants } from "@/components/Participants";
import { RoomDrawer } from "@/components/RoomDrawer";
import { formatDisplayName } from "@/lib/constants";
import { DEFAULT_TRACKS } from "@/lib/constants";
import { showSuccess, showError, showInfo } from "@/utils/toast";
import type { Track, RoomUser, SyncMessage } from "@/types/music";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // Room state
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const [myId, setMyId] = useState<string>("");

  // Peer refs
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());

  // State refs for callbacks
  const usersRef = useRef<RoomUser[]>([]);
  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef(currentIndex);
  const isHostRef = useRef(isHost);
  const userNameRef = useRef(userName);

  // Keep refs in sync
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { userNameRef.current = userName; }, [userName]);

  // Audio player
  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    currentTrack,
    togglePlay,
    seek,
    toggleMute,
    playTrack,
    syncPlay,
    syncPause,
    syncSeek,
  } = useAudioPlayer({
    queue,
    currentIndex,
    isHost,
  });

  // Broadcast to all peers
  const broadcast = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  }, []);

  // Sync helpers for listeners
  const handlePlaySync = useCallback((trackIndex: number, seekTime: number, timestamp: number) => {
    syncPlay(trackIndex, seekTime, timestamp);
  }, [syncPlay]);

  const handlePauseSync = useCallback((seekTime: number) => {
    syncPause(seekTime);
  }, [syncPause]);

  const handleSeekSync = useCallback((seekTime: number) => {
    syncSeek(seekTime);
  }, [syncSeek]);

  // Add user to list (with deduplication)
  const addUser = useCallback((user: RoomUser) => {
    setUsers(prev => {
      if (prev.find(u => u.id === user.id)) return prev;
      return [...prev, user];
    });
  }, []);

  // Broadcast full user list to all peers
  const broadcastUserList = useCallback(() => {
    broadcast({ type: "USER_LIST", users: usersRef.current });
  }, [broadcast]);

  // Handle incoming messages
  const handleMessage = useCallback((msg: SyncMessage) => {
    switch (msg.type) {
      case "NAME_UPDATE":
        setUserName(msg.newName);
        showInfo(`Your name was updated to "${msg.newName}" because "${msg.originalName}" was taken.`);
        break;

      case "JOIN": {
        const user = msg.user;
        // Check if user already exists
        const exists = usersRef.current.find(u => u.id === user.id);
        if (!exists) {
          addUser(user);
          showInfo(`${user.name} joined the jam!`);
          
          // Host: broadcast updated user list to all peers
          if (isHostRef.current) {
            setTimeout(() => broadcastUserList(), 100);
          }
        }
        break;
      }

      case "USER_LIST":
        // Replace entire user list with the authoritative one from host
        setUsers(msg.users);
        // Ensure our own ID is in the list
        if (myId && !msg.users.find((u: RoomUser) => u.id === myId)) {
          const me = usersRef.current.find(u => u.id === myId);
          if (me) {
            setUsers(prev => {
              if (prev.find(u => u.id === myId)) return prev;
              return [...prev, me];
            });
          }
        }
        break;

      case "PLAY":
        handlePlaySync(msg.trackIndex, msg.seekTime, msg.timestamp);
        break;

      case "PAUSE":
        handlePauseSync(msg.seekTime);
        break;

      case "SEEK":
        handleSeekSync(msg.seekTime);
        break;

      case "UPDATE_QUEUE":
        setQueue(msg.queue);
        setCurrentIndex(msg.activeIndex);
        break;
    }
  }, [handlePlaySync, handlePauseSync, handleSeekSync, addUser, broadcastUserList, myId]);

  // Initialize PeerJS
  useEffect(() => {
    if (!roomCode) return;

    const peerId = isHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(peerId);

    const peer = new Peer(peerId, { debug: 1 });
    peerRef.current = peer;

    peer.on("open", () => setIsConnected(true));

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        connectionsRef.current.set(conn.peer, conn);
        
        // Host: Add connecting user to list immediately
        if (isHostRef.current) {
          const connectingUser: RoomUser = {
            id: conn.peer,
            name: `User-${conn.peer.slice(-4)}`, // Temporary name until they tell us
            isHost: false,
            joinedAt: Date.now(),
          };
          addUser(connectingUser);
        }

        // Send current state
        if (isHostRef.current) {
          // Small delay to ensure user is added to list
          setTimeout(() => {
            broadcastUserList();
            conn.send({ type: "UPDATE_QUEUE", queue: queueRef.current, activeIndex: currentIndexRef.current });
          }, 200);
        }
      });

      conn.on("data", (data) => handleMessage(data as SyncMessage));

      conn.on("close", () => {
        connectionsRef.current.delete(conn.peer);
        // Remove user from list
        setUsers(prev => {
          const updated = prev.filter(u => u.id !== conn.peer);
          // Broadcast updated list to remaining peers
          if (updated.length !== prev.length && isHostRef.current) {
            setTimeout(() => broadcastUserList(), 100);
          }
          return updated;
        });
      });
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err.type);
      if (err.type === "unavailable-id" && isHost) {
        showInfo("Room already exists. Joining as listener.");
        setIsHost(false);
      }
    });

    return () => { peer.destroy(); };
  }, [roomCode, addUser, broadcastUserList, handleMessage]);

  // Connect to host (listener)
  useEffect(() => {
    if (isHost || !isConnected || !peerRef.current || !myId) return;

    const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
    const me: RoomUser = { id: myId, name: userNameRef.current, isHost: false, joinedAt: Date.now() };

    const conn = peerRef.current.connect(hostPeerId, { reliable: true });

    conn.on("open", () => {
      connectionsRef.current.set(conn.peer, conn);
      // Send JOIN with our actual name
      conn.send({ type: "JOIN", user: me });
    });

    conn.on("data", (data) => handleMessage(data as SyncMessage));

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
    });
  }, [isHost, isConnected, myId, roomCode, handleMessage]);

  // Add self to users list when myId is available
  useEffect(() => {
    if (myId && !users.find(u => u.id === myId)) {
      const me: RoomUser = { id: myId, name: userName, isHost, joinedAt: Date.now() };
      setUsers([me]);
    }
  }, [myId, userName, isHost]);

  // Host playback controls
  const handleTogglePlay = () => {
    if (!isHost) return;
    togglePlay();
    if (isPlaying) {
      broadcast({ type: "PAUSE", seekTime: currentTime });
    } else {
      broadcast({ type: "PLAY", trackIndex: currentIndex, seekTime: currentTime, timestamp: Date.now() });
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    let nextIdx = isShuffle
      ? (queue.length > 1 ? (() => { let i; do { i = Math.floor(Math.random() * queue.length); } while (i === currentIndex); return i; })() : 0)
      : (currentIndex + 1) % queue.length;
    playTrack(nextIdx, 0);
    broadcast({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = isShuffle
      ? (queue.length > 1 ? (() => { let i; do { i = Math.floor(Math.random() * queue.length); } while (i === currentIndex); return i; })() : 0)
      : (currentIndex - 1 + queue.length) % queue.length;
    playTrack(prevIdx, 0);
    broadcast({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
  };

  const handleSeekChange = (time: number) => {
    seek(time);
    if (isHost) broadcast({ type: "SEEK", seekTime: time, timestamp: Date.now() });
  };

  const handleSelectTrack = (idx: number) => {
    if (!isHost) return;
    playTrack(idx, 0);
    broadcast({ type: "PLAY", trackIndex: idx, seekTime: 0, timestamp: Date.now() });
  };

  // Queue management
  const handleAddTrack = (title: string, artist: string, url: string) => {
    const newTrack: Track = { id: `track-${Date.now()}`, title, artist: artist || "Independent Artist", url, addedBy: userName };
    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });
    showSuccess("Track added to queue!");
  };

  const handleUploadFile = (file: File) => {
    const newTrack: Track = {
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local)`,
      url: URL.createObjectURL(file),
      addedBy: userName,
      isLocalFile: true,
    };
    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });
    showSuccess(`Loaded: ${file.name}`);
  };

  const handleReorder = (idx: number, direction: "up" | "down") => {
    if ((direction === "up" && idx === 0) || (direction === "down" && idx === queue.length - 1)) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];
    let newActive = currentIndex;
    if (currentIndex === idx) newActive = targetIdx;
    else if (currentIndex === targetIdx) newActive = idx;
    setQueue(newQueue);
    setCurrentIndex(newActive);
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  };

  const handleRemoveTrack = (idx: number) => {
    if (queue.length <= 1) { showError("Queue must have at least one track."); return; }
    const newQueue = queue.filter((_, i) => i !== idx);
    let newActive = currentIndex;
    if (idx < currentIndex) newActive = currentIndex - 1;
    else if (idx === currentIndex) newActive = Math.min(currentIndex, newQueue.length - 1);
    setQueue(newQueue);
    setCurrentIndex(newActive);
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <RoomDrawer roomCode={roomCode} userName={userName} onLeave={() => navigate("/")} />
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <Player
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            isMuted={isMuted}
            isShuffle={isShuffle}
            isHost={isHost}
            onTogglePlay={handleTogglePlay}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onShuffleToggle={() => setIsShuffle(prev => !prev)}
            onMuteToggle={toggleMute}
            onSeek={handleSeekChange}
          />

          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600">
            <p className="font-bold text-black uppercase">💡 Tip:</p>
            <p>Add MP3 links from GitHub or upload local files using "Add Track".</p>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <Participants users={users} myId={myId} />
          <Queue
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            userName={userName}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddTrack={handleAddTrack}
            onUploadFile={handleUploadFile}
            onSelectTrack={handleSelectTrack}
          />
        </div>
      </main>

      {/* Audio */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        preload="auto"
        onTimeUpdate={() => audioRef.current && seek(audioRef.current.currentTime)}
        onLoadedMetadata={() => {}}
        onEnded={handleNext}
      />

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;