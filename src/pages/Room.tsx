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
  RefreshCw,
  Wifi,
  WifiOff
} from "lucide-react";
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
import FirebaseSignaling, { FirebaseSyncState } from "@/lib/firebaseSignaling";

// ============================================
// PLAYBACK CONTROLLER - Clean abstraction
// ============================================
interface PlaybackController {
  // State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
  isShuffle: boolean;
  isMuted: boolean;
  queue: Track[];
  
  // Controls
  play: () => Promise<void>;
  pause: () => void;
  togglePlayPause: () => Promise<void>;
  playTrack: (index: number) => Promise<void>;
  nextTrack: () => Promise<void>;
  previousTrack: () => Promise<void>;
  seek: (time: number) => void;
  toggleShuffle: () => void;
  toggleMute: () => void;
  
  // Queue management
  addTrack: (track: Track) => void;
  removeTrack: (index: number) => void;
  reorderTrack: (fromIndex: number, direction: "up" | "down") => void;
  
  // Broadcast
  broadcast: (msg: SyncMessage) => void;
}

function usePlaybackController(
  initialQueue: Track[],
  isHost: boolean,
  myId: string,
  onBroadcast: (msg: SyncMessage) => void
): PlaybackController {
  // State
  const [queue, setQueue] = useState<Track[]>(initialQueue);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Refs for audio element
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Refs to track latest values in callbacks
  const isHostRef = useRef(isHost);
  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);
  
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.volume = 1;
    
    const audio = audioRef.current;
    
    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
    });
    
    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });
    
    audio.addEventListener("ended", () => {
      // Auto-play next track
      handleNextTrackInternal(false);
    });
    
    audio.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      toast.error("Failed to load track");
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Sync queue to audio src when track changes
  useEffect(() => {
    const audio = audioRef.current;
    const track = queue[currentIndex];
    
    if (audio && track) {
      audio.src = track.url;
      audio.load();
    }
  }, [queue, currentIndex]);

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // ============================================
  // INTERNAL HELPERS
  // ============================================
  
  const getNextIndex = useCallback((fromIndex: number, q: Track[], shuffle: boolean): number => {
    if (q.length === 0) return 0;
    if (shuffle) {
      // Avoid playing same track if queue has more than 1
      if (q.length > 1) {
        let next;
        do {
          next = Math.floor(Math.random() * q.length);
        } while (next === fromIndex);
        return next;
      }
    }
    return (fromIndex + 1) % q.length;
  }, []);

  const getPreviousIndex = useCallback((fromIndex: number, q: Track[], shuffle: boolean): number => {
    if (q.length === 0) return 0;
    if (shuffle) {
      if (q.length > 1) {
        let prev;
        do {
          prev = Math.floor(Math.random() * q.length);
        } while (prev === fromIndex);
        return prev;
      }
    }
    return (fromIndex - 1 + q.length) % q.length;
  }, []);

  // Internal next handler (used by auto-play and manual next)
  const handleNextTrackInternal = async (shouldBroadcast: boolean = true) => {
    const nextIdx = getNextIndex(currentIndexRef.current, queue, isShuffle);
    setCurrentIndex(nextIdx);
    setCurrentTime(0);
    
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
        if (shouldBroadcast && isHostRef.current) {
          onBroadcast({
            type: "PLAY",
            trackIndex: nextIdx,
            seekTime: 0,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error("Play failed:", err);
      }
    }
  };

  // ============================================
  // PUBLIC CONTROLS
  // ============================================
  
  const play = async () => {
    const audio = audioRef.current;
    if (!audio || !queue.length) return;
    
    try {
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Play failed:", err);
    }
  };

  const pause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.pause();
    setIsPlaying(false);
  };

  const togglePlayPause = async () => {
    if (isPlayingRef.current) {
      pause();
      onBroadcast({
        type: "PAUSE",
        seekTime: audioRef.current?.currentTime || 0,
      });
    } else {
      await play();
      onBroadcast({
        type: "PLAY",
        trackIndex: currentIndexRef.current,
        seekTime: audioRef.current?.currentTime || 0,
        timestamp: Date.now(),
      });
    }
  };

  const playTrack = async (index: number) => {
    if (index < 0 || index >= queue.length) return;
    
    setCurrentIndex(index);
    setCurrentTime(0);
    
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
        onBroadcast({
          type: "PLAY",
          trackIndex: index,
          seekTime: 0,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("Play failed:", err);
      }
    }
  };

  const nextTrack = async () => {
    // PAUSE current track first
    pause();
    onBroadcast({
      type: "PAUSE",
      seekTime: audioRef.current?.currentTime || 0,
    });
    
    // Wait a tiny bit for pause to register
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Then PLAY next track
    const nextIdx = getNextIndex(currentIndexRef.current, queue, isShuffle);
    setCurrentIndex(nextIdx);
    setCurrentTime(0);
    
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
        onBroadcast({
          type: "PLAY",
          trackIndex: nextIdx,
          seekTime: 0,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("Play failed:", err);
      }
    }
  };

  const previousTrack = async () => {
    // PAUSE current track first
    pause();
    onBroadcast({
      type: "PAUSE",
      seekTime: audioRef.current?.currentTime || 0,
    });
    
    // Wait a tiny bit for pause to register
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Then PLAY previous track
    const prevIdx = getPreviousIndex(currentIndexRef.current, queue, isShuffle);
    setCurrentIndex(prevIdx);
    setCurrentTime(0);
    
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      try {
        await audio.play();
        setIsPlaying(true);
        onBroadcast({
          type: "PLAY",
          trackIndex: prevIdx,
          seekTime: 0,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("Play failed:", err);
      }
    }
  };

  const seek = (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = time;
    setCurrentTime(time);
    
    onBroadcast({
      type: "SEEK",
      seekTime: time,
      timestamp: Date.now(),
    });
  };

  const toggleShuffle = () => {
    setIsShuffle(prev => !prev);
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  // ============================================
  // QUEUE MANAGEMENT
  // ============================================
  
  const addTrack = (track: Track) => {
    const updatedQueue = [...queue, track];
    setQueue(updatedQueue);
    onBroadcast({
      type: "UPDATE_QUEUE",
      queue: updatedQueue,
      activeIndex: currentIndexRef.current,
    });
  };

  const removeTrack = (index: number) => {
    if (queue.length <= 1) {
      toast.error("Queue must have at least one track");
      return;
    }
    
    const newQueue = queue.filter((_, i) => i !== index);
    let newActive = currentIndexRef.current;
    
    if (index < currentIndexRef.current) {
      newActive = currentIndexRef.current - 1;
    } else if (index === currentIndexRef.current) {
      newActive = Math.min(currentIndexRef.current, newQueue.length - 1);
    }
    
    setQueue(newQueue);
    setCurrentIndex(newActive);
    
    onBroadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActive,
    });
  };

  const reorderTrack = (fromIndex: number, direction: "up" | "down") => {
    if (direction === "up" && fromIndex === 0) return;
    if (direction === "down" && fromIndex === queue.length - 1) return;
    
    const targetIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    const newQueue = [...queue];
    [newQueue[fromIndex], newQueue[targetIndex]] = [newQueue[targetIndex], newQueue[fromIndex]];
    
    let newActive = currentIndexRef.current;
    if (currentIndexRef.current === fromIndex) {
      newActive = targetIndex;
    } else if (currentIndexRef.current === targetIndex) {
      newActive = fromIndex;
    }
    
    setQueue(newQueue);
    setCurrentIndex(newActive);
    
    onBroadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActive,
    });
  };

  const broadcast = (msg: SyncMessage) => {
    onBroadcast(msg);
  };

  return {
    // State
    isPlaying,
    currentTime,
    duration,
    currentTrackIndex: currentIndex,
    isShuffle,
    isMuted,
    queue,
    
    // Controls
    play,
    pause,
    togglePlayPause,
    playTrack,
    nextTrack,
    previousTrack,
    seek,
    toggleShuffle,
    toggleMute,
    
    // Queue
    addTrack,
    removeTrack,
    reorderTrack,
    
    // Broadcast
    broadcast,
  };
}

// ============================================
// MAIN ROOM COMPONENT
// ============================================
const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // Connection states
  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);

  // Add Song Dialog State
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // Signaling ref
  const signalingRef = useRef<FirebaseSignaling | null>(null);

  // Broadcast function to send messages via Firebase
  const handleBroadcast = useCallback((msg: SyncMessage) => {
    console.log(`[Room] Broadcasting: ${msg.type}`);
    signalingRef.current?.send(msg);
    
    // Also update Firebase state if host
    if (isHost) {
      const stateUpdates: Partial<FirebaseSyncState> = {};
      
      switch (msg.type) {
        case "PLAY":
          stateUpdates.isPlaying = true;
          stateUpdates.currentTrackIndex = msg.trackIndex;
          stateUpdates.currentTime = msg.seekTime;
          stateUpdates.timestamp = msg.timestamp;
          break;
        case "PAUSE":
          stateUpdates.isPlaying = false;
          stateUpdates.currentTime = msg.seekTime;
          break;
        case "SEEK":
          stateUpdates.currentTime = msg.seekTime;
          stateUpdates.timestamp = msg.timestamp;
          break;
        case "UPDATE_QUEUE":
          // Handled separately
          break;
      }
      
      if (Object.keys(stateUpdates).length > 0) {
        signalingRef.current?.updateState(stateUpdates);
      }
    }
  }, [isHost]);

  // Initialize playback controller
  const playback = usePlaybackController(
    DEFAULT_TRACKS,
    isHost,
    myId,
    handleBroadcast
  );

  // Handle incoming sync messages
  const handleIncomingMessage = useCallback((msg: SyncMessage) => {
    console.log(`[Room] Processing message: ${msg.type}`);
    
    switch (msg.type) {
      case "USER_LIST":
        setUsers(msg.users);
        break;
        
      case "PLAY":
        if (!isHost) {
          playback.playTrack(msg.trackIndex);
          // Sync time with latency compensation
          if (msg.timestamp) {
            const audioEl = document.querySelector("audio");
            if (audioEl) {
              const latency = (Date.now() - msg.timestamp) / 1000;
              const targetTime = msg.seekTime + latency;
              if (Math.abs(audioEl.currentTime - targetTime) > 0.5) {
                audioEl.currentTime = targetTime;
              }
            }
          }
        }
        break;
        
      case "PAUSE":
        if (!isHost) {
          playback.pause();
          const audioEl = document.querySelector("audio");
          if (audioEl) {
            audioEl.currentTime = msg.seekTime;
          }
        }
        break;
        
      case "SEEK":
        if (!isHost) {
          const audioEl = document.querySelector("audio");
          if (audioEl && msg.timestamp) {
            const latency = (Date.now() - msg.timestamp) / 1000;
            audioEl.currentTime = msg.seekTime + latency;
          }
        }
        break;
        
      case "UPDATE_QUEUE":
        // Queue updates handled separately if needed
        break;
        
      case "HOST_TRANSFER":
        if (msg.newHostId === myId) {
          setIsHost(true);
          toast.success("You are now the Host!");
        } else {
          setIsHost(false);
        }
        setUsers(prev => prev.map(u => ({ ...u, isHost: u.id === msg.newHostId })));
        break;
    }
  }, [isHost, myId, playback]);

  // Initialize Firebase signaling
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost 
      ? `host-${roomCode.toLowerCase()}` 
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);

    const signaling = new FirebaseSignaling(roomCode, generatedId, userName, isHost);
    signalingRef.current = signaling;

    // Handle incoming sync messages
    signaling.onMessage(handleIncomingMessage);

    // Handle state changes (from host)
    signaling.onStateChange((state: FirebaseSyncState) => {
      console.log(`[Room] State change:`, state);
      if (!isHost) {
        // Non-host syncs with host state
        if (state.queue && state.queue.length > 0) {
          // Update queue if needed
        }
      }
    });

    // Handle connection state
    signaling.onConnectionChange((connected: boolean) => {
      setIsFirebaseConnected(connected);
      setIsConnected(connected);
    });

    signaling.connect().then(() => {
      signaling.getUsers().then((userList) => {
        if (userList.length > 0) {
          setUsers(userList);
        }
      });
    });

    return () => {
      signaling.disconnect();
    };
  }, [roomCode, userName, isHost, handleIncomingMessage]);

  // Add song handlers
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

    playback.addTrack(newTrack);

    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
    toast.success("Track added!");
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    const newTrack: Track = {
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local)`,
      url: fileUrl,
      addedBy: userName,
      isLocalFile: true,
    };

    playback.addTrack(newTrack);
    toast.success(`Loaded: ${file.name}`);
    setAddSongOpen(false);
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    setUsers(prev => prev.map(u => ({ ...u, isHost: u.id === targetUserId })));
    playback.broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
    toast.info("Host transferred.");
  };

  const handleLeaveRoom = () => {
    signalingRef.current?.disconnect();
    navigate("/");
  };

  const handleRetry = () => {
    window.location.reload();
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const currentTrack = playback.queue[playback.currentTrackIndex] || null;

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 ${isConnected ? 'text-green-600' : 'text-red-500'}`}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
        </div>
      </header>

      {/* Offline Banner */}
      {!isConnected && (
        <div className="bg-amber-50 border-b border-amber-300 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-mono text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Connection lost. Trying to reconnect...</span>
          </div>
          <Button onClick={handleRetry} size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />RETRY
          </Button>
        </div>
      )}

      {/* Main Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Player */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {/* Status */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 ${isConnected ? 'bg-black' : 'bg-red-500'} animate-pulse`}></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? 'YOU ARE HOST' : 'SYNCED WITH HOST'}
                </span>
              </div>
              <span className="text-gray-500">FIREBASE REALTIME</span>
            </div>

            {/* Track Info */}
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
                  {currentTrack?.title || "No Track"}
                </h2>
                <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
                  {currentTrack?.artist || "Add songs to queue"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
                  <span>ADDED BY:</span>
                  <span className="font-bold text-black uppercase">{currentTrack?.addedBy || "Host"}</span>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 mb-6">
              <input
                type="range"
                min={0}
                max={playback.duration || 100}
                value={playback.currentTime}
                onChange={(e) => playback.seek(parseFloat(e.target.value))}
                disabled={!isHost}
                className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black disabled:opacity-50"
              />
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>{formatTime(playback.currentTime)}</span>
                <span>{formatTime(playback.duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button 
                onClick={playback.toggleShuffle} 
                disabled={!isConnected}
                className={`p-2 border border-black transition-colors disabled:opacity-50 ${playback.isShuffle ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
                <Shuffle className="w-4 h-4" />
              </button>
              <button 
                onClick={playback.previousTrack} 
                disabled={!isConnected}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50">
                <SkipBack className="w-5 h-5" />
              </button>
              <button 
                onClick={playback.togglePlayPause} 
                disabled={!isConnected}
                className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors disabled:opacity-50">
                {playback.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>
              <button 
                onClick={playback.nextTrack} 
                disabled={!isConnected}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50">
                <SkipForward className="w-5 h-5" />
              </button>
              <button 
                onClick={playback.toggleMute} 
                disabled={!isConnected}
                className={`p-2 border border-black transition-colors disabled:opacity-50 ${playback.isMuted ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
                {playback.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {!isHost && (
              <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
                <span>Host controls playback. All can add and organize songs below.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* Users */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-black" />
                <span className="font-bold text-xs uppercase tracking-wider">Participants ({users.length})</span>
              </div>
              <span className="text-xs font-mono text-gray-500">FIREBASE</span>
            </div>
            <div className="space-y-2 max-h-36 overflow-y-auto">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2 border border-gray-200 bg-gray-50 text-xs font-mono">
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
                        className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase hover:bg-neutral-800 cursor-pointer">
                        MAKE HOST
                      </button>
                    ) : (
                      <span className="text-gray-400 text-[10px]">Listener</span>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <div className="text-xs text-gray-400 font-mono text-center py-4">Waiting for participants...</div>
              )}
            </div>
          </div>

          {/* Queue */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <span className="font-bold text-xs uppercase tracking-wider">Queue ({playback.queue.length})</span>
              <Dialog open={addSongOpen} onOpenChange={setAddSongOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1">
                    <Plus className="w-3.5 h-3.5 mr-1" />ADD
                  </Button>
                </DialogTrigger>
                <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold tracking-tight uppercase">Add Song</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-2">
                    <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
                      <Upload className="w-6 h-6 mx-auto text-black" />
                      <p className="text-xs font-semibold uppercase">Upload MP3</p>
                      <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800">
                        Select MP3
                        <input type="file" accept="audio/mp3,audio/*" onChange={handleLocalFileUpload} className="hidden" />
                      </label>
                    </div>
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-gray-300"></div>
                      <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or URL</span>
                      <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    <form onSubmit={handleAddSong} className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Title</Label>
                        <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song name" className="border-gray-300" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
                        <Input value={songArtist} onChange={(e) => setSongArtist(e.target.value)} placeholder="Artist name" className="border-gray-300" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Audio URL</Label>
                        <Input value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://..." className="border-gray-300 font-mono text-xs" />
                      </div>
                      <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2">Add to Queue</Button>
                    </form>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {playback.queue.map((track, idx) => {
                const isCurrent = idx === playback.currentTrackIndex;
                return (
                  <div key={track.id}
                    className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${isCurrent ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:border-gray-400'}`}>
                    <div onClick={() => isHost && playback.playTrack(idx)} className={`min-w-0 flex-1 ${isHost ? 'cursor-pointer' : ''}`}>
                      <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                      <p className={`text-[11px] truncate ${isCurrent ? 'text-gray-300' : 'text-gray-500'}`}>{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => playback.reorderTrack(idx, 'up')} 
                        disabled={idx === 0}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => playback.reorderTrack(idx, 'down')} 
                        disabled={idx === playback.queue.length - 1}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => playback.removeTrack(idx)}
                        className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${isCurrent ? 'border-white' : 'border-gray-300'}`}>
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

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Firebase Powered Audio Sync
      </footer>
    </div>
  );
};

export default Room;