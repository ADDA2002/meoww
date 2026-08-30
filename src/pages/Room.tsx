import React, { useState, useEffect, useRef, useCallback } from "react";
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

// ─────────────────────────────────────────────
// CLOCK SYNC SYSTEM
// ─────────────────────────────────────────────
interface ClockSync {
  clockOffset: number; // listener clock - host clock (ms)
  lastSync: number;    // timestamp of last sync
  rtt: number;         // round-trip time (ms)
}

const performClockSync = (
  peer: Peer,
  hostPeerId: string,
  myId: string
): Promise<ClockSync> => {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create a sync peer with a unique ID
    const syncPeer = new Peer(`${myId}-${syncId}`, { debug: 0 });

    const timeout = setTimeout(() => {
      try { syncPeer.destroy(); } catch (_) { /* noop */ }
      // Fall back to 0 offset if sync fails
      resolve({ clockOffset: 0, lastSync: Date.now(), rtt: 0 });
    }, 3000);

    syncPeer.on("open", () => {
      const conn = syncPeer.connect(hostPeerId, { reliable: true });

      conn.on("open", () => {
        // Step 1: Send ping with our local time
        const t1 = performance.now();
        conn.send({ type: "CLOCK_PING", t1, syncId });

        // Step 2: Wait for pong response
        conn.on("data", (data: any) => {
          if (data.type === "CLOCK_PONG" && data.syncId === syncId) {
            const t4 = performance.now();
            const t1 = data.t1;
            const t2 = data.t2; // host receive time
            const t3 = data.t3; // host send time

            const rtt = (t4 - t1) - (data.serverDelay || 0);
            const oneWay = rtt / 2;

            // Clock offset: how much our clock differs from host's
            // t3 is host's send time (≈ host clock at that moment)
            // t1 is our send time (≈ our clock at that moment)
            // We want: hostClock - ourClock = (t3 - t1) adjusted for transit
            const clockOffset = (t3 - t1) - oneWay;

            clearTimeout(timeout);
            try { conn.close(); } catch (_) { /* noop */ }
            try { syncPeer.destroy(); } catch (_) { /* noop */ }

            resolve({
              clockOffset,
              lastSync: Date.now(),
              rtt,
            });
          }
        });
      });

      conn.on("error", () => {
        clearTimeout(timeout);
        try { syncPeer.destroy(); } catch (_) { /* noop */ }
        resolve({ clockOffset: 0, lastSync: Date.now(), rtt: 0 });
      });
    });

    syncPeer.on("error", () => {
      clearTimeout(timeout);
      resolve({ clockOffset: 0, lastSync: Date.now(), rtt: 0 });
    });
  });
};

// ─────────────────────────────────────────────
// FORMATTING HELPERS
// ─────────────────────────────────────────────
const formatTimeDisplay = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

// ─────────────────────────────────────────────
// MAIN ROOM COMPONENT
// ─────────────────────────────────────────────
const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // ── Peer & connection states ──
  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // ── Audio & Queue states ──
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [clockSync, setClockSync] = useState<ClockSync>({ clockOffset: 0, lastSync: 0, rtt: 0 });
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | "unsynced">("unsynced");

  // ── Add Song Dialog ──
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // ── Refs (always up-to-date, no stale closures) ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());

  // Current playback state in refs (prevents stale closures)
  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef<number>(currentIndex);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const isHostRef = useRef<boolean>(isHost);
  const isMutedRef = useRef<boolean>(isMuted);

  // Track if we're in the middle of a source change
  const isChangingSource = useRef<boolean>(false);
  // Pending seek target after a source change
  const pendingSeekRef = useRef<number | null>(null);
  // Track the last URL loaded in audio element
  const loadedUrlRef = useRef<string>("");
  // Animation frame for time display
  const rafRef = useRef<number | null>(null);
  // Clock sync ref for sync calculations
  const clockSyncRef = useRef<ClockSync>({ clockOffset: 0, lastSync: 0, rtt: 0 });
  // Song start anchor
  const songStartRef = useRef<{ perfNow: number; unixMs: number } | null>(null);

  // Keep refs in sync with state
  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  isPlayingRef.current = isPlaying;
  isHostRef.current = isHost;
  isMutedRef.current = isMuted;
  clockSyncRef.current = clockSync;

  const currentTrack = queue[currentIndex] || null;

  // ─────────────────────────────────────────────
  // CENTRALIZED PLAY FUNCTION
  // ─────────────────────────────────────────────
  const playAudio = useCallback((trackIndex: number, seekTime: number = 0, isSync: boolean = false) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[trackIndex];
    if (!track) return;

    const targetUrl = track.url;
    const isNewSource = loadedUrlRef.current !== targetUrl;

    // Update refs and state immediately
    currentIndexRef.current = trackIndex;
    isChangingSource.current = isNewSource;
    pendingSeekRef.current = isNewSource ? seekTime : null;

    // Set state for re-render
    setCurrentIndex(trackIndex);

    const startPlayback = () => {
      const seekTarget = pendingSeekRef.current ?? 0;
      audio.currentTime = seekTarget;
      pendingSeekRef.current = null;
      isChangingSource.current = false;

      // Update loaded URL tracker
      loadedUrlRef.current = targetUrl;

      audio.play().then(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
      }).catch((err) => {
        console.warn("Play failed, retrying:", err);
        setTimeout(() => {
          audio.play().then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
          }).catch((e) => console.warn("Play retry failed:", e));
        }, 300);
      });
    };

    if (isNewSource) {
      // Remove any existing listeners to prevent stale callbacks
      const newAudio = new Audio();
      newAudio.preload = "auto";
      audio.pause();
      audio.src = "";

      // Copy over mute state
      newAudio.muted = isMutedRef.current;
      newAudio.volume = 1;

      const onCanPlay = () => {
        newAudio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      };
      newAudio.addEventListener("canplay", onCanPlay);

      // Swap the audio element
      audioRef.current = newAudio;
      loadedUrlRef.current = "";
      newAudio.src = targetUrl;
      newAudio.load();

      // Also update the DOM element reference
      const domAudio = document.getElementById("room-audio") as HTMLAudioElement;
      if (domAudio) {
        domAudio.src = targetUrl;
        domAudio.load();
      }
    } else {
      // Same source — just seek and play
      startPlayback();
    }

    // Broadcast play command (only if initiated locally)
    if (isHostRef.current && !isSync) {
      broadcast({
        type: "PLAY",
        trackIndex,
        seekTime,
        timestamp: Date.now(),
      });
    }
  }, []); // No deps — always uses refs

  // ─────────────────────────────────────────────
  // AUDIO EVENT HANDLERS (on the audio element)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
    };

    const handlePause = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
    };

    const handleEnded = () => {
      handleNext();
    };

    const handleError = (e: Event) => {
      console.warn("Audio error:", e);
      const track = queueRef.current[currentIndexRef.current];
      toast.error(`Failed to load: ${track?.title || "Unknown track"}`);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []); // Only attach once

  // ─────────────────────────────────────────────
  // MUTE SYNC
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // ─────────────────────────────────────────────
  // BROADCAST
  // ─────────────────────────────────────────────
  const broadcast = (msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  };

  // ─────────────────────────────────────────────
  // UNIQUE NAME GENERATOR
  // ─────────────────────────────────────────────
  const generateUniqueName = useCallback((baseName: string, existingUsers: RoomUser[]): string => {
    const normalizedBase = baseName.trim().toLowerCase();
    const existingNames = existingUsers.map((u) => u.name.trim().toLowerCase());

    if (!existingNames.includes(normalizedBase)) return baseName;

    for (let i = 1; i <= 999; i++) {
      const candidate = `${baseName} ${i}`;
      if (!existingNames.includes(candidate.toLowerCase())) return candidate;
    }
    return `${baseName} ${Date.now()}`;
  }, []);

  // ─────────────────────────────────────────────
  // INCOMING MESSAGE HANDLER
  // ─────────────────────────────────────────────
  const handleIncomingMessage = useCallback((msg: SyncMessage, senderPeerId: string) => {
    const audio = audioRef.current;

    switch (msg.type) {
      case "NAME_UPDATE": {
        setUserName(msg.newName);
        toast.info(`Your name was updated to "${msg.newName}"`);
        break;
      }

      case "JOIN": {
        if (isHostRef.current) {
          const existingUsers = [...usersRef.current];
          const uniqueName = generateUniqueName(msg.user.name, existingUsers);
          const updatedUser = { ...msg.user, name: uniqueName };

          const newUsers = [...existingUsers.filter((u) => u.id !== updatedUser.id), updatedUser];
          usersRef.current = newUsers;
          setUsers(newUsers);

          const conn = connectionsRef.current.get(senderPeerId);
          if (conn?.open) {
            conn.send({ type: "NAME_UPDATE", newName: uniqueName, originalName: msg.user.name });
          }

          broadcast({ type: "USER_LIST", users: newUsers });

          toast.info(`${msg.user.name} joined as "${uniqueName}"`);
        } else {
          const newUser = msg.user;
          const updatedUsers = [...usersRef.current.filter((u) => u.id !== newUser.id), newUser];
          usersRef.current = updatedUsers;
          setUsers(updatedUsers);
          toast.info(`${newUser.name} joined the jam!`);
        }
        break;
      }

      case "USER_LIST": {
        usersRef.current = msg.users;
        setUsers(msg.users);
        break;
      }

      case "PLAY": {
        // Calculate the seek time accounting for clock offset
        const offset = clockSyncRef.current.clockOffset;
        const latencySec = ((Date.now() - msg.timestamp) - offset) / 1000;
        const seekTime = Math.max(0, msg.seekTime + latencySec);

        // Always call playAudio with the synced data
        playAudio(msg.trackIndex, seekTime, true);

        // Update song start anchor for display
        songStartRef.current = {
          perfNow: performance.now(),
          unixMs: msg.timestamp - offset,
        };
        break;
      }

      case "PAUSE": {
        if (audio) {
          audio.currentTime = msg.seekTime;
          audio.pause();
          setIsPlaying(false);
          isPlayingRef.current = false;
          songStartRef.current = null;
        }
        break;
      }

      case "SEEK": {
        if (audio) {
          const offset = clockSyncRef.current.clockOffset;
          const latencySec = ((Date.now() - msg.timestamp) - offset) / 1000;
          audio.currentTime = Math.max(0, msg.seekTime + latencySec);
          setCurrentTime(audio.currentTime);
        }
        break;
      }

      case "UPDATE_QUEUE": {
        setQueue(msg.queue);
        if (msg.activeIndex !== undefined) {
          setCurrentIndex(msg.activeIndex);
          currentIndexRef.current = msg.activeIndex;
        }
        break;
      }

      case "CLOCK_PING": {
        // Host handles clock sync request
        if (!isHostRef.current) break;
        const conn = connectionsRef.current.get(senderPeerId);
        if (conn?.open) {
          conn.send({
            type: "CLOCK_PONG",
            t1: msg.t1,
            t2: performance.now(), // when we received the ping
            t3: performance.now(), // when we send the pong (≈ our clock)
            syncId: msg.syncId,
          });
        }
        break;
      }

      case "CLOCK_PONG": {
        // Already handled by performClockSync promise
        break;
      }

      case "HOST_TRANSFER": {
        if (msg.newHostId === myId) {
          setIsHost(true);
          isHostRef.current = true;
          toast.success("You are now the Host!");
        } else {
          setIsHost(false);
          isHostRef.current = false;
        }
        setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === msg.newHostId })));
        break;
      }
    }
  }, [myId, playAudio, generateUniqueName]);

  // We need usersRef for the handler
  const usersRef = useRef<RoomUser[]>([]);
  handleIncomingMessage; // keep ref usage clean

  // ─────────────────────────────────────────────
  // CONNECTION SETUP
  // ─────────────────────────────────────────────
  const setupConnection = useCallback((conn: DataConnection, me: RoomUser) => {
    conn.on("open", () => {
      connectionsRef.current.set(conn.peer, conn);

      if (isHostRef.current) {
        // Host sends current state to new joiner
        const audio = audioRef.current;
        const currentSeek = audio ? audio.currentTime : 0;

        conn.send({ type: "JOIN", user: me });
        conn.send({ type: "USER_LIST", users: usersRef.current });
        conn.send({ type: "UPDATE_QUEUE", queue: queueRef.current, activeIndex: currentIndexRef.current });

        if (audio && !audio.paused) {
          conn.send({
            type: "PLAY",
            trackIndex: currentIndexRef.current,
            seekTime: currentSeek,
            timestamp: Date.now(),
          });
        }
      } else {
        conn.send({ type: "JOIN", user: me });
      }
    });

    conn.on("data", (data: any) => {
      handleIncomingMessage(data as SyncMessage, conn.peer);
    });

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
      handlePeerDisconnect(conn.peer);
    });
  }, [handleIncomingMessage]);

  // ─────────────────────────────────────────────
  // PEER INITIALIZATION
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(generatedId);

    const peer = new Peer(generatedId, { debug: 1 });
    peerRef.current = peer;

    peer.on("open", () => {
      setIsConnected(true);

      if (!isHost) {
        const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        setupConnection(conn, {
          id: generatedId,
          name: initialName,
          isHost: false,
          joinedAt: Date.now(),
        });
      }
    });

    peer.on("connection", (conn) => {
      setupConnection(conn, {
        id: generatedId,
        name: userName,
        isHost: true,
        joinedAt: Date.now(),
      });
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err);
      if (err.type === "unavailable-id" && isHost) {
        toast.error("Room host already active. Joining as listener.");
        setIsHost(false);
        isHostRef.current = false;
      }
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  // ─────────────────────────────────────────────
  // CLOCK SYNC (non-host users)
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (isHost || !isConnected) return;

    const doSync = async () => {
      setSyncStatus("syncing");
      const result = await performClockSync(
        peerRef.current!,
        `meoww-room-${roomCode.toLowerCase()}`,
        myId
      );
      setClockSync(result);
      clockSyncRef.current = result;
      setPing(Math.round(result.rtt));
      setSyncStatus("synced");
    };

    // Initial sync after connection
    const timer = setTimeout(doSync, 500);

    // Periodic re-sync every 10 seconds
    const interval = setInterval(doSync, 10000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [isHost, isConnected, myId, roomCode]);

  // ─────────────────────────────────────────────
  // PEER DISCONNECT HANDLER
  // ─────────────────────────────────────────────
  const handlePeerDisconnect = useCallback((disconnectedId: string) => {
    const remainingUsers = usersRef.current.filter((u) => u.id !== disconnectedId);
    usersRef.current = remainingUsers;
    setUsers(remainingUsers);

    const wasHost = usersRef.current.find((u) => u.id === disconnectedId)?.isHost;
    if (wasHost && remainingUsers.length > 0) {
      const sorted = [...remainingUsers].sort((a, b) => a.joinedAt - b.joinedAt);
      const nextHost = sorted[0];

      if (nextHost.id === myId) {
        setIsHost(true);
        isHostRef.current = true;
        toast.success("Host left. You are now the host!");
        broadcast({ type: "HOST_TRANSFER", newHostId: nextHost.id });
      }
    }
  }, [myId]);

  // ─────────────────────────────────────────────
  // PLAYBACK CONTROLS
  // ─────────────────────────────────────────────
  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      // Pause
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      songStartRef.current = null;
      broadcast({ type: "PAUSE", seekTime: audio.currentTime });
    } else {
      // Play from current position
      playAudio(currentIndex, audio.currentTime, false);
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    let nextIdx = 0;

    if (isShuffle) {
      if (queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === currentIndex);
      }
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }

    playAudio(nextIdx, 0, false);
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = 0;

    if (isShuffle) {
      if (queue.length > 1) {
        do {
          prevIdx = Math.floor(Math.random() * queue.length);
        } while (prevIdx === currentIndex);
      }
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }

    playAudio(prevIdx, 0, false);
  };

  const handleShuffleToggle = () => {
    setIsShuffle((prev) => !prev);
  };

  const handleMuteToggle = () => {
    setIsMuted((prev) => !prev);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = targetTime;
    setCurrentTime(targetTime);

    if (isHostRef.current) {
      broadcast({ type: "SEEK", seekTime: targetTime, timestamp: Date.now() });
    }
  };

  // ─────────────────────────────────────────────
  // SONG MANAGEMENT
  // ─────────────────────────────────────────────
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
    queueRef.current = updatedQueue;
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });

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
    queueRef.current = updatedQueue;
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });

    toast.success(`Loaded: ${file.name}`);
    setAddSongOpen(false);
  };

  const handleReorder = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];

    let newActive = currentIndex;
    if (currentIndex === idx) newActive = targetIdx;
    else if (currentIndex === targetIdx) newActive = idx;

    setQueue(newQueue);
    queueRef.current = newQueue;
    setCurrentIndex(newActive);
    currentIndexRef.current = newActive;

    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
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
    queueRef.current = newQueue;
    setCurrentIndex(newActive);
    currentIndexRef.current = newActive;

    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    isHostRef.current = false;
    setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === targetUserId })));
    broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
    toast.info("Host controls transferred.");
  };

  const handleLeaveRoom = () => {
    if (peerRef.current) peerRef.current.destroy();
    navigate("/");
  };

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-2">
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Player */}
        <div className="lg:col-span-7 space-y-6">
          {/* Active Player Card */}
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {/* Status bar */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`} />
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? "YOU ARE HOST" : "LISTENER MODE"}
                </span>
                {!isHost && syncStatus === "synced" && (
                  <span className="text-gray-400">
                    • {ping}ms RTT
                  </span>
                )}
                {!isHost && syncStatus === "syncing" && (
                  <span className="text-gray-400 animate-pulse">• SYNCING…</span>
                )}
              </div>
              {isHost && (
                <span className="bg-black text-white px-2 py-0.5 text-[10px] font-bold uppercase">
                  SYNC MASTER
                </span>
              )}
            </div>

            {/* Track info */}
            <div className="flex gap-4 items-center mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
                ) : (
                  <Music className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                  {currentTrack ? currentTrack.title : "No Track Selected"}
                </h2>
                <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
                  {currentTrack ? currentTrack.artist : "Queue is empty"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
                  <span>ADDED BY:</span>
                  <span className="font-bold uppercase">{currentTrack?.addedBy || "Host"}</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
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
                <span>{formatTimeDisplay(currentTime)}</span>
                <span>{formatTimeDisplay(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleShuffleToggle}
                className={`p-2 border border-black transition-colors ${
                  isShuffle ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
                title={isShuffle ? "Shuffle On" : "Shuffle Off"}
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
                onClick={handleMuteToggle}
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
                <span>Host controls playback. All can add and organize songs in the queue.</span>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
            <p className="font-bold text-black uppercase">🎧 Tip for your own music:</p>
            <p>Add any MP3 link from GitHub, or upload your local MP3 file directly using "Add Track".</p>
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
                <div key={user.id} className="flex items-center justify-between p-2 border border-gray-200 bg-gray-50 text-xs font-mono">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 bg-black" />
                    <span className="font-semibold truncate">
                      {user.name} {user.id === myId ? "(You)" : ""}
                    </span>
                  </div>
                  <div>
                    {user.isHost ? (
                      <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase">HOST</span>
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
                    <DialogTitle className="text-lg font-bold uppercase">Add Song to Queue</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-6 pt-2">
                    {/* Upload local file */}
                    <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
                      <Upload className="w-6 h-6 mx-auto text-black" />
                      <p className="text-xs font-semibold uppercase">Option 1: Upload your local MP3</p>
                      <p className="text-[11px] text-gray-500">Pick any MP3 from your computer</p>
                      <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800 transition-colors">
                        Select MP3 File
                        <input type="file" accept="audio/mp3,audio/*" onChange={handleLocalFileUpload} className="hidden" />
                      </label>
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-gray-300" />
                      <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or via URL</span>
                      <div className="flex-grow border-t border-gray-300" />
                    </div>

                    {/* URL form */}
                    <form onSubmit={handleAddSong} className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Track Title</Label>
                        <Input
                          value={songTitle}
                          onChange={(e) => setSongTitle(e.target.value)}
                          placeholder="e.g. My Favorite Song"
                          className="border-gray-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
                        <Input
                          value={songArtist}
                          onChange={(e) => setSongArtist(e.target.value)}
                          placeholder="e.g. Artist Name"
                          className="border-gray-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Audio URL (GitHub, etc.)</Label>
                        <Input
                          value={songUrl}
                          onChange={(e) => setSongUrl(e.target.value)}
                          placeholder="https://raw.githubusercontent.com/.../song.mp3"
                          className="border-gray-300 font-mono text-xs"
                        />
                      </div>
                      <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2 mt-2">
                        Add to Queue
                      </Button>
                    </form>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Queue list */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <div
                    key={track.id}
                    className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                      isCurrent ? "bg-black text-white border-black" : "bg-white text-black border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div
                      onClick={() => {
                        if (isHost) {
                          playAudio(idx, 0, false);
                        }
                      }}
                      className={`min-w-0 flex-1 ${isHost ? "cursor-pointer" : ""}`}
                    >
                      <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                      <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>{track.artist}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleReorder(idx, "up")}
                        disabled={idx === 0}
                        className={`p-1 border text-xs disabled:opacity-30 ${
                          isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"
                        }`}
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
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveTrack(idx)}
                        className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${
                          isCurrent ? "border-white" : "border-gray-300"
                        }`}
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

      {/* Hidden audio element */}
      <audio
        id="room-audio"
        ref={audioRef}
        preload="auto"
      />

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;