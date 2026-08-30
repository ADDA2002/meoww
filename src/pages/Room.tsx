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
  Music, 
  Upload, 
  Users,
  AlertCircle,
  Menu,
  X
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
import Header from "@/components/Header";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // Peer & connection states
  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Audio & Queue states
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);

  // Add Song Dialog State
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const usersRef = useRef<RoomUser[]>([]);
  const queueRef = useRef<Track[]>(queue);
  const isHostRef = useRef<boolean>(isHost);
  const currentIndexRef = useRef<number>(currentIndex);

  // Keep refs updated for event callbacks
  usersRef.current = users;
  queueRef.current = queue;
  isHostRef.current = isHost;
  currentIndexRef.current = currentIndex;

  const currentTrack = queue[currentIndex] || null;

  // Sync mute state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Ping measurement (listeners only)
  useEffect(() => {
    if (isHost) return; // Only listeners ping the host

    const measurePing = () => {
      const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
      const testPeer = new Peer(`${myId}-ping-${Date.now()}`, { debug: 0 });
      
      const timeout = setTimeout(() => {
        try { testPeer.destroy(); } catch (e) { /* noop */ }
        // Use last known ping or show dash
        setPing((prev) => prev || 0);
      }, 2000);

      testPeer.on("open", () => {
        const startTime = Date.now();
        const conn = testPeer.connect(hostPeerId, { reliable: true });

        conn.on("open", () => {
          clearTimeout(timeout);
          const endTime = Date.now();
          setPing(endTime - startTime);
          try { conn.close(); } catch (e) { /* noop */ }
          try { testPeer.destroy(); } catch (e) { /* noop */ }
        });

        conn.on("error", () => {
          clearTimeout(timeout);
          try { testPeer.destroy(); } catch (e) { /* noop */ }
        });
      };

      testPeer.on("error", () => {
        clearTimeout(timeout);
        try { testPeer.destroy(); } catch (e) { /* noop */ }
      });
    };

    // Initial ping after connection
    const initialTimer = setTimeout(measurePing, 1000);
    
    // Re-ping every 5 seconds
    const interval = setInterval(measurePing, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isHost, roomCode, myId]);

  // Broadcast message to all active peer connections
  const broadcast = (msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  };

  // Generate a unique name by adding a number suffix with a space if there's a conflict
  const generateUniqueName = (baseName: string, existingUsers: RoomUser[]): string => {
    // Always store the comparison name in formatted form (first capital, rest lowercase)
    const normalizedBase = baseName.trim().toLowerCase();
    const existingNames = existingUsers.map(u => u.name.trim().toLowerCase());
    
    // Check if base name already exists
    if (!existingNames.includes(normalizedBase)) {
      return baseName;
    }
    
    // Try adding numbers at the end with a space until we find a unique one
    // e.g., "Alex" becomes "Alex 1", "Alex 2", etc.
    for (let i = 1; i <= 999; i++) {
      const candidate = baseName + " " + i;
      if (!existingNames.includes(candidate.toLowerCase())) {
        return candidate;
      }
    }
    
    // Fallback: add timestamp suffix
    return baseName + " " + Date.now();
  };

  // 1. Initialize PeerJS connection
  useEffect(() => {
    if (!roomCode) return;

    // A deterministic peer ID for the host so others can join, and random for listeners
    const generatedId = isHost 
      ? `meoww-room-${roomCode.toLowerCase()}` 
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);

    // Generate unique name if needed (only for non-hosts joining)
    const finalName = isHost ? userName : generateUniqueName(userName, []);
    
    // Update the displayed name if it changed
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

    const peer = new Peer(generatedId, {
      debug: 1,
    });
    peerRef.current = peer;

    peer.on("open", (id) => {
      setIsConnected(true);
      
      if (!isHost) {
        // Connect to host peer
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
      } else {
        toast.error("Connection notice: " + (err.message || "Working in local mode."));
      }
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  // Connection data handler
  const setupConnection = (conn: DataConnection, me: RoomUser) => {
    conn.on("open", () => {
      // If this connection is from a listener trying to join the host
      if (isHostRef.current) {
        // Check for duplicate name (case-insensitive) and generate unique name
        const uniqueName = generateUniqueName(me.name, usersRef.current);
        const updatedUser = { ...me, name: uniqueName };

        // If name was changed, notify the user
        if (uniqueName !== me.name) {
          // Send the updated user info with the new name
          connectionsRef.current.set(conn.peer, conn);
          
          // Send JOIN with the unique name
          conn.send({
            type: "JOIN",
            user: updatedUser,
          });
          
          // Send notification to the user about their new name
          conn.send({
            type: "NAME_UPDATE",
            newName: uniqueName,
            originalName: me.name,
          });
          
          return;
        }

        connectionsRef.current.set(conn.peer, conn);

        // If listener connecting to host, announce self
        conn.send({
          type: "JOIN",
          user: me,
        });

        // If host, send current state to the new listener
        if (isHostRef.current) {
          const audio = audioRef.current;
          const currentSeek = audio ? audio.currentTime : 0;
          
          conn.send({
            type: "USER_LIST",
            users: [...usersRef.current, { id: conn.peer, name: "Connecting...", isHost: false, joinedAt: Date.now() }],
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
        }
      } else {
        connectionsRef.current.set(conn.peer, conn);
        
        // If listener connecting to host, announce self
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

  // Handle incoming protocol messages
  const handleIncomingMessage = (msg: SyncMessage, senderPeerId: string) => {
    switch (msg.type) {
      case "NAME_UPDATE": {
        // Update our displayed name if the host assigned us a new one
        setUserName(msg.newName);
        toast.info(`Your name was updated to "${msg.newName}" because "${msg.originalName}" was taken.`);
        break;
      }

      case "JOIN": {
        // If we're the host, do a final duplicate check before adding
        if (isHostRef.current) {
          const uniqueName = generateUniqueName(msg.user.name, usersRef.current);
          const updatedUser = { ...msg.user, name: uniqueName };

          const newUser = updatedUser;
          const updatedUsers = [...usersRef.current.filter(u => u.id !== newUser.id), newUser];
          setUsers(updatedUsers);
          
          if (uniqueName !== msg.user.name) {
            // Notify the user about the name change
            const conn = connectionsRef.current.get(senderPeerId);
            if (conn && conn.open) {
              conn.send({
                type: "NAME_UPDATE",
                newName: uniqueName,
                originalName: msg.user.name,
              });
            }
            toast.info(`${msg.user.name} joined as "${uniqueName}" (name adjusted).`);
          } else {
            toast.info(`${newUser.name} joined the jam!`);
          }

          if (isHostRef.current) {
            broadcast({
              type: "USER_LIST",
              users: updatedUsers,
            });
          }
          break;
        }

        const newUser = msg.user;
        const updatedUsers = [...usersRef.current.filter(u => u.id !== newUser.id), newUser];
        setUsers(updatedUsers);
        toast.info(`${newUser.name} joined the jam!`);

        if (isHostRef.current) {
          broadcast({
            type: "USER_LIST",
            users: updatedUsers,
          });
        }
        break;
      }

      case "USER_LIST": {
        setUsers(msg.users);
        break;
      }

      case "PLAY": {
        const audio = audioRef.current;
        if (!audio) return;

        // Millisecond accurate sync compensation
        const latencySec = (Date.now() - msg.timestamp) / 1000;
        const targetTime = msg.seekTime + latencySec;

        if (currentIndexRef.current !== msg.trackIndex) {
          setCurrentIndex(msg.trackIndex);
        }

        if (Math.abs(audio.currentTime - targetTime) > 0.15) {
          audio.currentTime = targetTime;
        }

        audio.play().then(() => setIsPlaying(true)).catch((e) => {
          console.log("Auto-play blocked, user click needed:", e);
        });
        break;
      }

      case "PAUSE": {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = msg.seekTime;
          audio.pause();
          setIsPlaying(false);
        }
        break;
      }

      case "SEEK": {
        const audio = audioRef.current;
        if (audio) {
          const latencySec = (Date.now() - msg.timestamp) / 1000;
          audio.currentTime = msg.seekTime + latencySec;
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
          toast.success("You are now the Host of this Jam!");
        } else {
          setIsHost(false);
        }
        setUsers((prev) =>
          prev.map((u) => ({ ...u, isHost: u.id === msg.newHostId }))
        );
        break;
      }
    }
  };

  // If host leaves, automatic host failover to the next joined user
  const handlePeerDisconnect = (disconnectedId: string) => {
    const remainingUsers = usersRef.current.filter((u) => u.id !== disconnectedId);
    setUsers(remainingUsers);

    const wasHost = usersRef.current.find((u) => u.id === disconnectedId)?.isHost;
    if (wasHost && remainingUsers.length > 0) {
      // Pick the next earliest joined participant
      const sorted = [...remainingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
      const nextHost = sorted[0];

      if (nextHost.id === myId) {
        setIsHost(true);
        toast.success("Host left. You are now the host!");
        broadcast({
          type: "HOST_TRANSFER",
          newHostId: nextHost.id,
        });
      }
    }
  };

  // Playback audio element controls
  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      broadcast({
        type: "PAUSE",
        seekTime: audio.currentTime,
      });
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: currentIndex,
          seekTime: audio.currentTime,
          timestamp: Date.now(),
        });
      }).catch(console.error);
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    let nextIdx = 0;
    if (isShuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    setCurrentIndex(nextIdx);

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: nextIdx,
          seekTime: 0,
          timestamp: Date.now(),
        });
      }).catch(console.error);
    }
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = 0;
    if (isShuffle) {
      prevIdx = Math.floor(Math.random() * queue.length);
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }
    setCurrentIndex(prevIdx);

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: prevIdx,
          seekTime: 0,
          timestamp: Date.now(),
        });
      }).catch(console.error);
    }
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
      });
    }
  };

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
    });

    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
    toast.success("Track added to queue!");
  };

  // Upload local MP3 file (for user's test.mp3 or local music)
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
    });

    toast.success(`Loaded local audio: ${file.name}`);
    setAddSongOpen(false);
  };

  const handleReorder = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    const temp = newQueue[idx];
    newQueue[idx] = newQueue[targetIdx];
    newQueue[targetIdx] = temp;

    // update active index if needed
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
    });
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
    });
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
    });
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

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <Header showDrawerButton={true} />

      {/* Main Room Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Music Player & Host Dashboard */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Player Card */}
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
            {/* Latency & Host Status Bar */}
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

            {/* Time progress bar */}
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

            {/* Controls Row */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-2 border border-black transition-colors ${
                  isShuffle ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
                title="Toggle Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handlePrevious}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
                title="Previous Song"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={handleTogglePlay}
                className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
                title="Next Song"
              >
                <SkipForward className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2 border border-black transition-colors ${
                  isMuted ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
                title={isMuted ? "Unmute" : "Mute"}
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

          {/* Quick instructions for uploading own file / github tracks */}
          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
            <p className="font-bold text-black uppercase">🎧 Tip for your own music:</p>
            <p>You can add any MP3 link from GitHub, or upload your local test.mp3 file directly using the "Add Track" button.</p>
          </div>
        </div>

        {/* Right Column: Shared Queue & Connected Listeners */}
        <div className="lg:col-span-5 space-y-6">
          {/* Connected Jam Members */}
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
              }))
            </div>
          </div>

          {/* Shared Playlist Queue */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <span className="font-bold text-xs uppercase tracking-wider">Shared Queue ({queue.length})</span>
              
              {/* Add Song Modal Trigger */}
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
                    {/* Method 1: Local MP3 file upload */}
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

                    {/* Method 2: Online or GitHub URL */}
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

            {/* Queue List with Priority Reordering */}
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
                          setCurrentIndex(idx);
                          broadcast({
                            type: "PLAY",
                            trackIndex: idx,
                            seekTime: 0,
                            timestamp: Date.now(),
                          });
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

                    {/* Reorder & Remove Actions */}
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

      {/* Hidden Audio element controlling synchronization */}
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

      {/* Bottom status strip */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;