import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX,
  Plus, ArrowUp, ArrowDown, Trash2, Radio, Music, Upload, Users,
  AlertCircle,
} from "lucide-react";
import Peer, { DataConnection } from "peerjs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Track, RoomUser, SyncMessage, SyncAnchor } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import RoomDrawer from "@/components/RoomDrawer";
import { ClockSync } from "@/components/ClockSync";
import { PlaybackClock } from "@/components/PlaybackClock";

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
  const [audioLoaded, setAudioLoaded] = useState<boolean>(false);

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
  const isPlayingRef = useRef<boolean>(isPlaying);
  const audioLoadedRef = useRef<boolean>(false);
  const clockSyncRef = useRef<ClockSync>(new ClockSync());
  const playbackClockRef = useRef<PlaybackClock>(new PlaybackClock(clockSyncRef.current));
  const lastBroadcastIndexRef = useRef<number>(-1);
  const lastBroadcastPlayingRef = useRef<boolean>(false);

  // Keep refs updated
  usersRef.current = users;
  queueRef.current = queue;
  isHostRef.current = isHost;
  currentIndexRef.current = currentIndex;
  isPlayingRef.current = isPlaying;
  audioLoadedRef.current = audioLoaded;

  const currentTrack = queue[currentIndex] || null;

  // Sync mute to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
  }, [isMuted]);

  // Reset audio loaded when src changes
  useEffect(() => {
    setAudioLoaded(false);
    audioLoadedRef.current = false;
  }, [currentTrack?.url]);

  // High-frequency display update via requestAnimationFrame
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const elapsed = playbackClockRef.current.getElapsedSeconds();
      setCurrentTime(elapsed);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Ping measurement (listeners ping host continuously)
  useEffect(() => {
    if (isHost) {
      clockSyncRef.current.reset();
      setPing(0);
      return;
    }
    if (!myId) return;

    let cancelled = false;

    const sendPing = () => {
      if (cancelled) return;
      if (connectionsRef.current.size === 0) return;
      // Send a ping via the existing data connection to the host
      const hostConn = Array.from(connectionsRef.current.values()).find(
        (c) => c.open && c.peer.startsWith(`meoww-room-${roomCode.toLowerCase()}`)
      );
      if (!hostConn) return;
      const pingId = Math.floor(Math.random() * 1e9);
      const t1 = performance.now();
      const pingMsg = clockSyncRef.current.buildPing(pingId, t1);
      try {
        hostConn.send(pingMsg);
      } catch (e) {
        // connection may have just closed
      }
    };

    const initial = setTimeout(sendPing, 500);
    const interval = setInterval(sendPing, 3000);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [isHost, myId, roomCode]);

  // Broadcast a message to all connections
  const broadcast = (msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        try { conn.send(msg); } catch (e) { /* noop */ }
      }
    });
  };

  // Send a message to a single peer
  const sendTo = (conn: DataConnection, msg: SyncMessage) => {
    if (conn.open) {
      try { conn.send(msg); } catch (e) { /* noop */ }
    }
  };

  // Generate a unique name by appending " 2", " 3" etc. on conflict
  const generateUniqueName = (baseName: string, existingUsers: RoomUser[]): string => {
    const normalizedBase = baseName.trim().toLowerCase();
    const existingNames = existingUsers.map((u) => u.name.trim().toLowerCase());
    if (!existingNames.includes(normalizedBase)) return baseName;
    for (let i = 2; i <= 999; i++) {
      const candidate = `${baseName} ${i}`;
      if (!existingNames.includes(candidate.toLowerCase())) return candidate;
    }
    return `${baseName} ${Date.now()}`;
  };

  // Initialize PeerJS
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(generatedId);

    const finalName = isHost ? userName : generateUniqueName(userName, []);
    if (finalName !== userName) setUserName(finalName);

    const currentUser: RoomUser = {
      id: generatedId,
      name: finalName,
      isHost,
      joinedAt: Date.now(),
    };

    setUsers([currentUser]);

    const peer = new Peer(generatedId, { debug: 0 });
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
      if (err.type === "unavailable-id" && isHost) {
        toast.error("Room host already active. Joining as listener.");
        setIsHost(false);
      } else if (err.type === "peer-unavailable") {
        // listener trying to connect to missing host — silent
      } else {
        toast.error("Connection notice: " + (err.message || "Working in local mode."));
      }
    });

    return () => {
      try { peer.destroy(); } catch (e) { /* noop */ }
    };
  }, [roomCode]);

  // Setup a peer data connection
  const setupConnection = (conn: DataConnection, me: RoomUser) => {
    conn.on("open", () => {
      connectionsRef.current.set(conn.peer, conn);

      if (isHostRef.current) {
        // Host receives listener — assign unique name and share state
        const uniqueName = generateUniqueName(me.name, usersRef.current);
        const updatedUser = { ...me, name: uniqueName };

        // Add user to list (the listener will also send its own JOIN, host handles dedup)
        const newUser: RoomUser = { ...updatedUser, joinedAt: Date.now() };
        const existing = usersRef.current.filter((u) => u.id !== newUser.id);
        const updatedUsers = [...existing, newUser];
        setUsers(updatedUsers);

        if (uniqueName !== me.name) {
          sendTo(conn, {
            type: "NAME_UPDATE",
            newName: uniqueName,
            originalName: me.name,
          });
          toast.info(`${me.name} joined as "${uniqueName}" (name adjusted).`);
        } else {
          toast.info(`${uniqueName} joined the jam!`);
        }

        // Push full state to the new listener
        sendTo(conn, { type: "USER_LIST", users: updatedUsers });
        sendTo(conn, {
          type: "UPDATE_QUEUE",
          queue: queueRef.current,
          activeIndex: currentIndexRef.current,
        });

        // Push current playback state using a fresh anchor
        const audio = audioRef.current;
        if (audio && !audio.paused && playbackClockRef.current.hasAnchor()) {
          // Re-broadcast current playback with a fresh anchor
          const anchor = clockSyncRef.current.buildAnchor(
            performance.now() - (audio.currentTime * 1000),
            Date.now() - (audio.currentTime * 1000),
          );
          sendTo(conn, {
            type: "TRACK_CHANGE",
            trackIndex: currentIndexRef.current,
            anchor,
          });
        }
      } else {
        // Listener → host connection
        sendTo(conn, { type: "JOIN", user: me });
      }
    });

    conn.on("data", (data: any) => {
      const msg = data as SyncMessage;
      // Listeners handle incoming PING_REQUEST from host as a PING_RESPONSE
      if (msg.type === "PING_REQUEST") {
        const pong = clockSyncRef.current.buildPong(msg);
        try { conn.send(pong); } catch (e) { /* noop */ }
        return;
      }
      // Host handles incoming PING_RESPONSE
      if (msg.type === "PING_RESPONSE") {
        const t4 = performance.now();
        clockSyncRef.current.ingestPong(msg, t4);
        setPing(Math.round(clockSyncRef.current.getRttMs()));
        return;
      }
      handleIncomingMessage(msg, conn.peer);
    });

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
      handlePeerDisconnect(conn.peer);
    });
  };

  // Apply a track change to the audio element with a given local start time
  const applyTrackAtTime = (trackIndex: number, startSec: number, autoPlay: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    const targetUrl = queueRef.current[trackIndex]?.url;
    if (!targetUrl) return;

    const startPlayback = () => {
      try {
        audio.currentTime = startSec;
      } catch (e) { /* noop */ }
      if (autoPlay) {
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.catch(() => {
            // Browser autoplay policy — host must have user gesture
          });
        }
      } else {
        audio.pause();
      }
    };

    if (audio.src !== targetUrl) {
      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      };
      audio.addEventListener("canplay", onCanPlay);
      audio.src = targetUrl;
      audio.load();
    } else {
      startPlayback();
    }
  };

  // Host-side: capture a fresh anchor NOW and broadcast
  const hostBroadcastPlay = (trackIndex: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const anchor = clockSyncRef.current.buildAnchor(
      performance.now() - (audio.currentTime * 1000),
      Date.now() - (audio.currentTime * 1000),
    );
    playbackClockRef.current.ingestAnchor(anchor, trackIndex);
    broadcast({ type: "PLAY", anchor, trackIndex });
    lastBroadcastIndexRef.current = trackIndex;
    lastBroadcastPlayingRef.current = true;
  };

  // Host-side: capture a fresh anchor for a track change (used by next/prev/jump)
  const hostBroadcastTrackChange = (trackIndex: number) => {
    const anchor = clockSyncRef.current.buildAnchor(performance.now(), Date.now());
    playbackClockRef.current.ingestAnchor(anchor, trackIndex);
    broadcast({ type: "TRACK_CHANGE", trackIndex, anchor });
    lastBroadcastIndexRef.current = trackIndex;
    lastBroadcastPlayingRef.current = true;
  };

  // Host-side: pause broadcast
  const hostBroadcastPause = (trackIndex: number) => {
    const wall = Date.now();
    const perf = performance.now();
    broadcast({ type: "PAUSE", perfNowAtPause: perf, wallMsAtPause: wall, trackIndex });
    lastBroadcastPlayingRef.current = false;
  };

  // Host-side: seek broadcast (start new anchor at the seek point)
  const hostBroadcastSeek = (trackIndex: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const anchor = clockSyncRef.current.buildAnchor(
      performance.now() - (audio.currentTime * 1000),
      Date.now() - (audio.currentTime * 1000),
    );
    playbackClockRef.current.ingestAnchor(anchor, trackIndex);
    broadcast({ type: "SEEK", anchor, trackIndex });
  };

  // Handle incoming protocol messages
  const handleIncomingMessage = (msg: SyncMessage, senderPeerId: string) => {
    switch (msg.type) {
      case "NAME_UPDATE": {
        setUserName(msg.newName);
        toast.info(`Your name was updated to "${msg.newName}" because "${msg.originalName}" was taken.`);
        break;
      }

      case "JOIN": {
        if (isHostRef.current) {
          const uniqueName = generateUniqueName(msg.user.name, usersRef.current);
          const newUser: RoomUser = { ...msg.user, name: uniqueName, joinedAt: Date.now() };
          const updatedUsers = [
            ...usersRef.current.filter((u) => u.id !== newUser.id),
            newUser,
          ];
          setUsers(updatedUsers);
          if (uniqueName !== msg.user.name) {
            const conn = connectionsRef.current.get(senderPeerId);
            if (conn) sendTo(conn, { type: "NAME_UPDATE", newName: uniqueName, originalName: msg.user.name });
            toast.info(`${msg.user.name} joined as "${uniqueName}" (name adjusted).`);
          } else {
            toast.info(`${newUser.name} joined the jam!`);
          }
          broadcast({ type: "USER_LIST", users: updatedUsers });
        } else {
          // Listener receiving a host's echo of their own join — ignore
        }
        break;
      }

      case "USER_LIST": {
        setUsers(msg.users);
        break;
      }

      case "UPDATE_QUEUE": {
        setQueue(msg.queue);
        if (msg.activeIndex !== undefined) setCurrentIndex(msg.activeIndex);
        queueRef.current = msg.queue;
        break;
      }

      case "TRACK_CHANGE": {
        // Always swap to the new track and install the anchor
        setCurrentIndex(msg.trackIndex);
        currentIndexRef.current = msg.trackIndex;
        playbackClockRef.current.changeTrack(msg.trackIndex, msg.anchor);
        applyTrackAtTime(msg.trackIndex, 0, true);
        setIsPlaying(true);
        isPlayingRef.current = true;
        break;
      }

      case "PLAY": {
        setCurrentIndex(msg.trackIndex);
        currentIndexRef.current = msg.trackIndex;
        playbackClockRef.current.ingestAnchor(msg.anchor, msg.trackIndex);
        applyTrackAtTime(msg.trackIndex, 0, true);
        setIsPlaying(true);
        isPlayingRef.current = true;
        break;
      }

      case "PAUSE": {
        const audio = audioRef.current;
        playbackClockRef.current.markPaused(msg.trackIndex, msg.perfNowAtPause, msg.wallMsAtPause);
        if (audio) {
          // Snap audio to the same instant the clock froze
          const frozen = playbackClockRef.current.getElapsedSeconds();
          try { audio.currentTime = frozen; } catch (e) { /* noop */ }
          audio.pause();
        }
        setIsPlaying(false);
        isPlayingRef.current = false;
        break;
      }

      case "RESUME": {
        setCurrentIndex(msg.trackIndex);
        currentIndexRef.current = msg.trackIndex;
        playbackClockRef.current.resume(msg.anchor, msg.trackIndex);
        applyTrackAtTime(msg.trackIndex, 0, true);
        setIsPlaying(true);
        isPlayingRef.current = true;
        break;
      }

      case "SEEK": {
        setCurrentIndex(msg.trackIndex);
        currentIndexRef.current = msg.trackIndex;
        playbackClockRef.current.seek(msg.anchor, msg.trackIndex);
        applyTrackAtTime(msg.trackIndex, 0, true);
        setIsPlaying(true);
        isPlayingRef.current = true;
        break;
      }

      case "HOST_TRANSFER": {
        if (msg.newHostId === myId) {
          setIsHost(true);
          toast.success("You are now the Host of this Jam!");
        } else {
          setIsHost(false);
        }
        setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === msg.newHostId })));
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
        broadcast({ type: "HOST_TRANSFER", newHostId: nextHost.id });
      }
    }
  };

  // ============ Host Transport Controls ============

  const handleTogglePlay = () => {
    if (!isHost) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingRef.current) {
      // PAUSE
      const wall = Date.now();
      const perf = performance.now();
      playbackClockRef.current.markPaused(currentIndex, perf, wall);
      try { audio.currentTime = playbackClockRef.current.getElapsedSeconds(); } catch (e) { /* noop */ }
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      hostBroadcastPause(currentIndex);
    } else {
      // RESUME
      const audio2 = audioRef.current;
      const resumeAt = playbackClockRef.current.getElapsedSeconds();
      const anchor = clockSyncRef.current.buildAnchor(
        performance.now() - (resumeAt * 1000),
        Date.now() - (resumeAt * 1000),
      );
      playbackClockRef.current.resume(anchor, currentIndex);
      try { audio2.currentTime = resumeAt; } catch (e) { /* noop */ }
      audio2.play().catch(() => { /* noop */ });
      setIsPlaying(true);
      isPlayingRef.current = true;
      broadcast({ type: "RESUME", anchor, trackIndex: currentIndex });
    }
  };

  const handleNext = () => {
    if (!isHost || queue.length === 0) return;
    let nextIdx = 0;
    if (isShuffle && queue.length > 1) {
      do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === currentIndex);
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    setCurrentIndex(nextIdx);
    currentIndexRef.current = nextIdx;
    setIsPlaying(true);
    isPlayingRef.current = true;
    // Schedule the actual playback once the new src is ready
    setTimeout(() => {
      hostBroadcastTrackChange(nextIdx);
      applyTrackAtTime(nextIdx, 0, true);
    }, 0);
  };

  const handlePrevious = () => {
    if (!isHost || queue.length === 0) return;
    let prevIdx = 0;
    if (isShuffle && queue.length > 1) {
      do { prevIdx = Math.floor(Math.random() * queue.length); } while (prevIdx === currentIndex);
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }
    setCurrentIndex(prevIdx);
    currentIndexRef.current = prevIdx;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setTimeout(() => {
      hostBroadcastTrackChange(prevIdx);
      applyTrackAtTime(prevIdx, 0, true);
    }, 0);
  };

  const handleShuffleToggle = () => setIsShuffle((p) => !p);
  const handleMuteToggle = () => setIsMuted((p) => !p);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHost) return;
    const audio = audioRef.current;
    if (!audio) return;
    const target = parseFloat(e.target.value);
    const anchor = clockSyncRef.current.buildAnchor(
      performance.now() - (target * 1000),
      Date.now() - (target * 1000),
    );
    playbackClockRef.current.seek(anchor, currentIndex);
    try { audio.currentTime = target; } catch (e) { /* noop */ }
    setCurrentTime(target);
    broadcast({ type: "SEEK", anchor, trackIndex: currentIndex });
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
    queueRef.current = updatedQueue;
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });
    setSongTitle(""); setSongArtist(""); setSongUrl("");
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
    if (currentIndex === idx) newActive = targetIdx;
    else if (currentIndex === targetIdx) newActive = idx;
    setQueue(newQueue);
    setCurrentIndex(newActive);
    queueRef.current = newQueue;
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
    if (idx < currentIndex) newActive = currentIndex - 1;
    else if (idx === currentIndex) newActive = Math.min(currentIndex, newQueue.length - 1);
    setQueue(newQueue);
    setCurrentIndex(newActive);
    queueRef.current = newQueue;
    currentIndexRef.current = newActive;
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });

    // If we removed the currently playing track, force a re-anchor
    if (idx === currentIndex) {
      setTimeout(() => {
        hostBroadcastTrackChange(newActive);
        applyTrackAtTime(newActive, 0, isPlaying);
      }, 0);
    }
  };

  const handleTrackClick = (idx: number) => {
    if (!isHost) return;
    setCurrentIndex(idx);
    currentIndexRef.current = idx;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setTimeout(() => {
      hostBroadcastTrackChange(idx);
      applyTrackAtTime(idx, 0, true);
    }, 0);
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === targetUserId })));
    broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
    toast.info("Host controls transferred.");
  };

  const handleLeaveRoom = () => navigate("/");

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00.000000";
    const minutes = Math.floor(secs / 60);
    const wholeSecs = Math.floor(secs % 60);
    const fractional = secs - Math.floor(secs);
    const ms = Math.floor(fractional * 1000);
    const microRemainder = Math.floor((fractional * 1000 - ms) * 1000);
    return `${minutes}:${wholeSecs < 10 ? "0" : ""}${wholeSecs}.${ms < 100 ? "0" : ""}${ms < 10 ? "0" : ""}${ms}.${microRemainder < 100 ? "0" : ""}${microRemainder < 10 ? "0" : ""}${microRemainder}`;
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-2">
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
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

            <div className="space-y-1.5 mb-6">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isHost}
                step={0.001}
                className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black"
              />
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

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
                <span>Host controls playback. All can add and organize songs in the queue below.</span>
              </div>
            )}
          </div>

          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
            <p className="font-bold text-black uppercase">🎧 Tip for your own music:</p>
            <p>You can add any MP3 link from GitHub, or upload your local test.mp3 file directly using the "Add Track" button.</p>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
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
                      onClick={() => handleTrackClick(idx)}
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

      <audio
        ref={audioRef}
        src={currentTrack?.url}
        preload="auto"
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onCanPlay={() => {
          setAudioLoaded(true);
          audioLoadedRef.current = true;
        }}
        onPlay={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }}
        onPause={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }}
        onEnded={() => {
          if (isHostRef.current) handleNext();
        }}
      />

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;