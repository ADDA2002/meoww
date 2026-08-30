import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Volume2, 
  VolumeX,
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  Radio, 
  Music, 
  Upload, 
  Users,
  AlertCircle
} from "lucide-react";
import Peer, { DataConnection } from "peerjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Track, RoomUser, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import RoomDrawer from "@/components/RoomDrawer";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // ============= STATE =============
  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Audio & Queue
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);

  // Add Song Dialog
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // ============= REFS =============
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const usersRef = useRef<RoomUser[]>([]);
  const queueRef = useRef<Track[]>(queue);
  const isHostRef = useRef<boolean>(isHost);
  const currentIndexRef = useRef<number>(currentIndex);
  const pendingPingsRef = useRef<Map<string, number>>(new Map());
  const lastPingTimeRef = useRef<number>(0);

  // Keep refs synced with state
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const currentTrack = queue[currentIndex] || null;

  // ============= EFFECTS =============

  // Sync mute state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Ultra-lightweight ping using existing connection (no new PeerJS handshake)
  useEffect(() => {
    if (isHost) return;

    const measurePing = () => {
      // Find the host connection (first open connection)
      const hostConn = Array.from(connectionsRef.current.values()).find(
        (conn) => conn.open
      );

      if (!hostConn) return;

      const pingId = `p${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
      pendingPingsRef.current.set(pingId, performance.now());

      try {
        hostConn.send({
          type: "PING",
          pingId,
          clientTime: performance.now(),
        });
      } catch (e) {
        pendingPingsRef.current.delete(pingId);
      }
    };

    // Measure immediately and every 2 seconds
    const initialTimer = setTimeout(measurePing, 500);
    const interval = setInterval(measurePing, 2000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isHost]);

  // Initialize PeerJS connection
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost 
      ? `meoww-room-${roomCode.toLowerCase()}` 
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);

    const finalName = isHost ? userName : generateUniqueName(userName, []);
    if (finalName !== userName) {
      setUserName(finalName);
    }

    const currentUser: RoomUser = {
      id: generatedId,
      name: finalName,
      isHost: isHost,
      joinedAt: Date.now(),
    };

    setUsers([currentUser]);

    const peer = new Peer(generatedId, { debug: 1 });
    peerRef.current = peer;

    peer.on("open", () => {
      setIsConnected(true);
      
      if (!isHost) {
        const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        setupConnection(conn, currentUser);
      }
    });

    peer.on("connection", (conn) => {
      setupConnection(conn, currentUser);
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err);
      if (err.type === "unavailable-id" && isHost) {
        toast.error("Room host already active. Joining as listener.");
        setIsHost(false);
      } else if (err.type !== "network" && err.type !== "peer-unavailable") {
        toast.error("Connection notice: " + (err.message || "Working in local mode."));
      }
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  // ============= HELPER FUNCTIONS =============

  // Broadcast message to all connected peers
  const broadcast = (msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  };

  // Generate unique name if there's a conflict
  const generateUniqueName = (baseName: string, existingUsers: RoomUser[]): string => {
    const normalizedBase = baseName.trim().toLowerCase();
    const existingNames = existingUsers.map(u => u.name.trim().toLowerCase());
    
    if (!existingNames.includes(normalizedBase)) {
      return baseName;
    }
    
    for (let i = 1; i <= 999; i++) {
      const candidate = baseName + " " + i;
      if (!existingNames.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }
    
    return baseName + " " + Date.now();
  };

  // ============= CONNECTION HANDLING =============

  const setupConnection = (conn: DataConnection, me: RoomUser) => {
    conn.on("open", () => {
      if (isHostRef.current) {
        const uniqueName = generateUniqueName(me.name, usersRef.current);
        const updatedUser = { ...me, name: uniqueName };

        connectionsRef.current.set(conn.peer, conn);

        conn.send({
          type: "JOIN",
          user: updatedUser,
        });

        const audio = audioRef.current;
        const currentSeek = audio ? audio.currentTime : 0;

        conn.send({
          type: "USER_LIST",
          users: [...usersRef.current, updatedUser],
        });

        conn.send({
          type: "UPDATE_QUEUE",
          queue: queueRef.current,
          activeIndex: currentIndexRef.current,
        });

        if (audio && !audio.paused) {
          conn.send({
            type: "PLAY",
            trackIndex: currentIndexRef.current,
            seekTime: currentSeek,
            timestamp: Date.now(),
          });
        }

        if (uniqueName !== me.name) {
          setTimeout(() => {
            if (conn.open) {
              conn.send({
                type: "NAME_UPDATE",
                newName: uniqueName,
                originalName: me.name,
              });
            }
          }, 100);
        }
      } else {
        connectionsRef.current.set(conn.peer, conn);
        conn.send({
          type: "JOIN",
          user: me,
        });
      }
    });

    conn.on("data", (data: any) => {
      handleIncomingMessage(data as SyncMessage, conn.peer);
    });

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
      handlePeerDisconnect(conn.peer);
    });
  };

  const handleIncomingMessage = (msg: SyncMessage, senderPeerId: string) => {
    switch (msg.type) {
      case "PING": {
        // Host: respond immediately with pong (no roundtrip calc on our side)
        if (isHostRef.current) {
          const conn = connectionsRef.current.get(senderPeerId);
          if (conn && conn.open) {
            conn.send({
              type: "PONG",
              pingId: (msg as any).pingId,
              clientTime: (msg as any).clientTime,
              hostTime: performance.now(),
            });
          }
        }
        break;
      }

      case "PONG": {
        // Listener: calculate roundtrip from our sent timestamp
        const startTime = pendingPingsRef.current.get((msg as any).pingId);
        if (startTime !== undefined) {
          const rtt = performance.now() - startTime;
          pendingPingsRef.current.delete((msg as any).pingId);
          // One-way ping is roughly half of roundtrip
          setPing(Math.max(0, Math.round(rtt / 2)));
        }
        break;
      }

      case "NAME_UPDATE": {
        setUserName((msg as any).newName);
        toast.info(`Your name was updated to "${(msg as any).newName}" because "${(msg as any).originalName}" was taken.`);
        break;
      }

      case "JOIN": {
        if (isHostRef.current) {
          const uniqueName = generateUniqueName((msg as any).user.name, usersRef.current);
          const updatedUser = { ...(msg as any).user, name: uniqueName };
          const updatedUsers = [...usersRef.current.filter(u => u.id !== updatedUser.id), updatedUser];
          setUsers(updatedUsers);
          
          if (uniqueName !== (msg as any).user.name) {
            const conn = connectionsRef.current.get(senderPeerId);
            if (conn && conn.open) {
              conn.send({
                type: "NAME_UPDATE",
                newName: uniqueName,
                originalName: (msg as any).user.name,
              } as any);
            }
            toast.info(`${(msg as any).user.name} joined as "${uniqueName}" (name adjusted).`);
          } else {
            toast.info(`${updatedUser.name} joined the jam!`);
          }

          broadcast({ type: "USER_LIST", users: updatedUsers });
        }
        break;
      }

      case "USER_LIST": {
        setUsers((msg as any).users);
        break;
      }

      case "PLAY": {
        const audio = audioRef.current;
        if (!audio) return;

        const latencySec = (Date.now() - (msg as any).timestamp) / 1000;
        const targetTime = (msg as any).seekTime + latencySec;

        if (currentIndexRef.current !== (msg as any).trackIndex) {
          setCurrentIndex((msg as any).trackIndex);
        }

        const playWhenReady = () => {
          if (Math.abs(audio.currentTime - targetTime) > 0.15) {
            audio.currentTime = targetTime;
          }
          audio.play().then(() => setIsPlaying(true)).catch((e) => {
            console.log("Auto-play blocked, user click needed:", e);
          });
          audio.removeEventListener('canplay', playWhenReady);
        };

        audio.addEventListener('canplay', playWhenReady);
        audio.load();
        break;
      }

      case "PAUSE": {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = (msg as any).seekTime;
          audio.pause();
          setIsPlaying(false);
        }
        break;
      }

      case "SEEK": {
        const audio = audioRef.current;
        if (audio) {
          const latencySec = (Date.now() - (msg as any).timestamp) / 1000;
          audio.currentTime = (msg as any).seekTime + latencySec;
        }
        break;
      }

      case "UPDATE_QUEUE": {
        setQueue((msg as any).queue);
        if ((msg as any).activeIndex !== undefined) {
          setCurrentIndex((msg as any).activeIndex);
        }
        break;
      }

      case "HOST_TRANSFER": {
        if ((msg as any).newHostId === myId) {
          setIsHost(true);
          toast.success("You are now the Host of this Jam!");
        } else {
          setIsHost(false);
        }
        setUsers((prev) =>
          prev.map((u) => ({ ...u, isHost: u.id === (msg as any).newHostId }))
        );
        break;
      }
    }
  };

  const handlePeerDisconnect = (disconnectedId: string) => {
    const remainingUsers = usersRef.current.filter((u) => u.id !== disconnectedId);
    setUsers(remainingUsers);

    const wasHost = usersRef.current.find((u) => u.id === disconnectedId)?.isHost;
    if (wasHost && remainingUsers.length > 0) {
      const sorted = [...remainingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
      const nextHost = sorted[0];

      if (nextHost.id === myId) {
        setIsHost(true);
        toast.success("Host left. You are now the host!");
        broadcast({
          type: "HOST_TRANSFER",
          newHostId: nextHost.id,
        } as any);
      }
    }
  };

  // ============= PLAYBACK CONTROLS =============

  const playTrackAt = (trackIndex: number) => {
    if (trackIndex < 0 || trackIndex >= queue.length) return;

    setCurrentIndex(trackIndex);
    const audio = audioRef.current;
    if (!audio) return;

    const playWhenReady = () => {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: trackIndex,
          seekTime: 0,
          timestamp: Date.now(),
        } as any);
      }).catch(console.error);
      audio.removeEventListener('canplay', playWhenReady);
    };

    audio.addEventListener('canplay', playWhenReady);
    audio.load();
  };

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      broadcast({
        type: "PAUSE",
        seekTime: audio.currentTime,
      } as any);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: currentIndex,
          seekTime: audio.currentTime,
          timestamp: Date.now(),
        } as any);
      }).catch((err) => {
        console.error("Play failed:", err);
        toast.error("Couldn't play this track. Try again.");
      });
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    let nextIdx: number;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    playTrackAt(nextIdx);
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx: number;
    if (isShuffle) {
      prevIdx = Math.floor(Math.random() * queue.length);
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }
    playTrackAt(prevIdx);
  };

  const handleToggleShuffle = () => {
    setIsShuffle((prev) => !prev);
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
      broadcast({
        type: "SEEK",
        seekTime: targetTime,
        timestamp: Date.now(),
      } as any);
    }
  };

  // ============= QUEUE MANAGEMENT =============

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songUrl.trim()) {
      toast.error("Please provide a title and audio URL.");
      return;
    }

    const newTrack: Track = {
      id: `track-${Date.now()}`,
      title: songTitle.trim(),
      artist: songArtist.trim() || "Independent Artist",
      url: songUrl.trim(),
      addedBy: userName,
    };

    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({
      type: "UPDATE_QUEUE",
      queue: updatedQueue,
      activeIndex: currentIndex,
    } as any);

    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
    toast.success("Track added to queue!");
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    const newTrack: Track = {
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local MP3)`,
      url: fileUrl,
      addedBy: userName,
      isLocalFile: true,
    };

    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
    broadcast({
      type: "UPDATE_QUEUE",
      queue: updatedQueue,
      activeIndex: currentIndex,
    } as any);

    toast.success(`Loaded local audio: ${file.name}`);
    setAddSongOpen(false);
  };

  const handleReorder = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];

    let newActive = currentIndex;
    if (currentIndex === idx) {
      newActive = targetIdx;
    } else if (currentIndex === targetIdx) {
      newActive = idx;
    }

    setQueue(newQueue);
    setCurrentIndex(newActive);

    broadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActive,
    } as any);
  };

  const handleRemoveTrack = (idx: number) => {
    if (queue.length <= 1) {
      toast.error("Queue must have at least one track.");
      return;
    }
    const newQueue = queue.filter((_, i) => i !== idx);
    let newActive = currentIndex;
    if (idx < currentIndex) {
      newActive = currentIndex - 1;
    } else if (idx === currentIndex) {
      newActive = Math.min(currentIndex, newQueue.length - 1);
    }
    setQueue(newQueue);
    setCurrentIndex(newActive);

    broadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActive,
    } as any);
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    setUsers((prev) =>
      prev.map((u) => ({ ...u, isHost: u.id === targetUserId }))
    );
    broadcast({
      type: "HOST_TRANSFER",
      newHostId: targetUserId,
    } as any);
    toast.info("Host controls transferred.");
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // ============= RENDER =============

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      {/* Top Navigation */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-2">
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Player */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`}></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? "YOU ARE HOST" : "LISTENER MODE (SYNCED)"}
                </span>
              </div>
              <div className="flex items-center gap-1 text-gray-500">
                <span>ping {ping}ms</span>
              </div>
            </div>

            {/* Song Info */}
            <div className="flex gap-4 items-center mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
                ) : (
                  <Music className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-black truncate">
                  {currentTrack ? currentTrack.title : "No Track Selected"}
                </h2>
                <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
                  {currentTrack ? currentTrack.artist : "Queue is empty"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
                  <span>ADDED BY:</span>
                  <span className="font-bold text-black uppercase">{currentTrack?.addedBy || "Host"}</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 mb-6">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isHost}
                className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black"
              />
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleToggleShuffle}
                className={`p-2 border border-black transition-colors ${
                  isShuffle ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
                title="Toggle Shuffle"
                aria-label="Toggle Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrevious}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
                title="Previous Song"
                aria-label="Previous Song"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors"
                title={isPlaying ? "Pause" : "Play"}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
                title="Next Song"
                aria-label="Next Song"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className={`p-2 border border-black transition-colors ${
                  isMuted ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {!isHost && (
              <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
                <span>Host controls playback. All can add and organize songs in the queue below.</span>
              </div>
            )}
          </div>

          {/* Tip */}
          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
            <p className="font-bold text-black uppercase">🎧 Tip for your own music:</p>
            <p>You can add any MP3 link from GitHub, or upload your local test.mp3 file directly using the "Add Track" button.</p>
          </div>
        </div>

        {/* Right: Queue & Participants */}
        <div className="lg:col-span-5 space-y-6">
          {/* Participants */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-black" />
                <span className="font-bold text-xs uppercase tracking-wider">Participants ({users.length})</span>
              </div>
              <span className="text-xs font-mono text-gray-500">REALTIME</span>
            </div>

            <div className="space-y-2 max-h-36 overflow-y-auto">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 border border-gray-200 bg-gray-50 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 bg-black"></div>
                    <span className="font-semibold text-black truncate">
                      {user.name} {user.id === myId ? "(You)" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.isHost ? (
                      <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        HOST
                      </span>
                    ) : isHost ? (
                      <button
                        onClick={() => handleTransferHost(user.id)}
                        className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        MAKE HOST
                      </button>
                    ) : (
                      <span className="text-gray-400 text-[10px]">Listener</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Queue */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <span className="font-bold text-xs uppercase tracking-wider">Shared Queue ({queue.length})</span>
              
              <Dialog open={addSongOpen} onOpenChange={setAddSongOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    ADD TRACK
                  </Button>
                </DialogTrigger>
                <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold tracking-tight uppercase">Add Song to Queue</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-6 pt-2">
                    <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
                      <Upload className="w-6 h-6 mx-auto text-black" />
                      <p className="text-xs font-semibold uppercase">Option 1: Upload your local MP3 file</p>
                      <p className="text-[11px] text-gray-500">Pick any MP3 from your computer or downloads folder</p>
                      <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800 transition-colors">
                        Select MP3 File
                        <input
                          type="file"
                          accept="audio/mp3,audio/*"
                          onChange={handleLocalFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-gray-300"></div>
                      <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or via URL</span>
                      <div className="flex-grow border-t border-gray-300"></div>
                    </div>

                    <form onSubmit={handleAddSong} className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Track Title</Label>
                        <Input
                          value={songTitle}
                          onChange={(e) => setSongTitle(e.target.value)}
                          placeholder="e.g. My Favorite Song"
                          className="border-gray-300 text-black font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
                        <Input
                          value={songArtist}
                          onChange={(e) => setSongArtist(e.target.value)}
                          placeholder="e.g. Artist Name"
                          className="border-gray-300 text-black font-medium"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Audio Stream / GitHub MP3 URL</Label>
                        <Input
                          value={songUrl}
                          onChange={(e) => setSongUrl(e.target.value)}
                          placeholder="https://raw.githubusercontent.com/.../song.mp3"
                          className="border-gray-300 text-black font-mono text-xs"
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2 mt-2"
                      >
                        Add to Queue
                      </Button>
                    </form>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <div
                    key={track.id}
                    className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                      isCurrent
                        ? "bg-black text-white border-black"
                        : "bg-white text-black border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div
                      onClick={() => {
                        if (isHost) {
                          playTrackAt(idx);
                        }
                      }}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <p className="font-bold text-xs truncate">
                        {idx + 1}. {track.title}
                      </p>
                      <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>
                        {track.artist}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReorder(idx, "up")}
                        disabled={idx === 0}
                        className={`p-1 border text-xs disabled:opacity-30 ${
                          isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"
                        }`}
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(idx, "down")}
                        disabled={idx === queue.length - 1}
                        className={`p-1 border text-xs disabled:opacity-30 ${
                          isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"
                        }`}
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTrack(idx)}
                        className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${
                          isCurrent ? "border-white" : "border-gray-300"
                        }`}
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* Audio Element */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleNext}
      />

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;