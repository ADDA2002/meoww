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
import { DEFAULT_TRACKS } from "@/constants/defaultTracks";
import { formatDisplayName } from "@/utils/nameFormat";
import RoomDrawer from "@/components/RoomDrawer";
import FirebaseSignaling, { FirebaseSyncState } from "@/services/firebaseSignaling";

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

  // Audio & Queue states
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Add Song Dialog State
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signalingRef = useRef<FirebaseSignaling | null>(null);
  const usersRef = useRef<RoomUser[]>([]);
  const queueRef = useRef<Track[]>(queue);
  const isHostRef = useRef<boolean>(isHost);
  const currentIndexRef = useRef<number>(currentIndex);
  const currentTimeRef = useRef<number>(currentTime);
  const isPlayingRef = useRef<boolean>(isPlaying);

  // Keep refs updated
  usersRef.current = users;
  queueRef.current = queue;
  isHostRef.current = isHost;
  currentIndexRef.current = currentIndex;
  currentTimeRef.current = currentTime;
  isPlayingRef.current = isPlaying;

  const currentTrack = queue[currentIndex] || null;

  // Sync mute state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // ALWAYS reset to 0:00 when track changes
  useEffect(() => {
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    // Always pause when track changes - user must press play
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, [currentIndex]);

  // Sync audio time for syncing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const interval = setInterval(() => {
      if (audio && isHostRef.current && isPlayingRef.current) {
        setCurrentTime(audio.currentTime);
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  // Initialize Firebase signaling
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost 
      ? `host-${roomCode.toLowerCase()}` 
      : `user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
    
    setMyId(generatedId);

    const signaling = new FirebaseSignaling(roomCode, generatedId, userName, isHost);
    signalingRef.current = signaling;

    console.log(`[Room] Registering onMessage handler, myId=${generatedId}`);

    // Handle incoming sync messages
    signaling.onMessage((msg: SyncMessage) => {
      console.log(`[Room] 🔔 handleIncomingMessage fired, type=${msg.type}, msg=`, msg);
      handleIncomingMessage(msg);
    });

    // Handle state changes (from host)
    signaling.onStateChange((state: FirebaseSyncState) => {
      console.log(`[Room] 🔔 onStateChange fired, state=`, state);
      if (!isHostRef.current) {
        if (state.queue && state.queue.length > 0) {
          setQueue(state.queue);
        }
        if (state.currentTrackIndex !== undefined) {
          setCurrentIndex(state.currentTrackIndex);
        }
        // Don't auto-play on sync - just update the state
        // User must press play manually
      }
    });

    // Handle connection state
    signaling.onConnectionChange((connected: boolean) => {
      console.log(`[Room] 🔔 onConnectionChange: ${connected}`);
      setIsFirebaseConnected(connected);
      setIsConnected(connected);
    });

    signaling.connect().then(() => {
      console.log("[Room] ✅ Signaling connected!");
      
      signaling.getUsers().then((userList) => {
        console.log(`[Room] getUsers() returned:`, userList);
        if (userList.length > 0) {
          setUsers(userList);
        }
      });

      if (!isHost) {
        signaling.getState().then((state) => {
          if (state) {
            if (state.queue && state.queue.length > 0) {
              setQueue(state.queue);
            }
            setCurrentIndex(state.currentTrackIndex || 0);
            // Don't auto-play when joining - keep paused
          }
        });
      }
    });

    return () => {
      signaling.disconnect();
    };
  }, [roomCode]);

  // Handle incoming sync messages
  const handleIncomingMessage = (msg: SyncMessage) => {
    console.log(`[Room] Processing message type: ${msg.type}`);
    switch (msg.type) {
      case "USER_LIST": {
        console.log(`[Room] → USER_LIST: setting users to`, msg.users.map(u => `${u.name}(${u.id})`));
        setUsers(msg.users);
        break;
      }
      case "PLAY": {
        if (!isHostRef.current) {
          const audio = audioRef.current;
          if (!audio) return;
          
          if (currentIndexRef.current !== msg.trackIndex) {
            setCurrentIndex(msg.trackIndex);
          }
          
          const latency = (Date.now() - msg.timestamp) / 1000;
          const targetTime = msg.seekTime + latency;
          if (Math.abs(audio.currentTime - targetTime) > 0.3) {
            audio.currentTime = targetTime;
          }
          
          audio.play().then(() => setIsPlaying(true)).catch(() => {});
        }
        break;
      }
      case "PAUSE": {
        if (!isHostRef.current) {
          const audio = audioRef.current;
          if (audio) {
            audio.currentTime = msg.seekTime;
            audio.pause();
            setIsPlaying(false);
          }
        }
        break;
      }
      case "SEEK": {
        if (!isHostRef.current) {
          const audio = audioRef.current;
          if (audio) {
            const latency = (Date.now() - msg.timestamp) / 1000;
            audio.currentTime = msg.seekTime + latency;
          }
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
  };

  // Broadcast sync message
  const broadcast = (msg: SyncMessage) => {
    console.log(`[Room] Broadcasting: ${msg.type}`);
    signalingRef.current?.send(msg);
    
    if (isHost) {
      const stateUpdates: Partial<FirebaseSyncState> = {};
      
      if (msg.type === "PLAY") {
        stateUpdates.isPlaying = true;
        stateUpdates.currentTrackIndex = msg.trackIndex;
        stateUpdates.currentTime = msg.seekTime;
        stateUpdates.timestamp = msg.timestamp;
        stateUpdates.queue = queueRef.current;
      } else if (msg.type === "PAUSE") {
        stateUpdates.isPlaying = false;
        stateUpdates.currentTime = msg.seekTime;
      } else if (msg.type === "SEEK") {
        stateUpdates.currentTime = msg.seekTime;
        stateUpdates.timestamp = msg.timestamp;
      } else if (msg.type === "UPDATE_QUEUE") {
        stateUpdates.queue = msg.queue;
        stateUpdates.currentTrackIndex = msg.activeIndex;
      }
      
      if (Object.keys(stateUpdates).length > 0) {
        signalingRef.current?.updateState(stateUpdates);
      }
    }
  };

  // Auto-play next track when current ends
  const handleTrackEnd = () => {
    if (queue.length === 0) return;
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;
    
    setCurrentIndex(nextIdx);
    setCurrentTime(0);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
    }
  };

  // Playback controls
  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      broadcast({ type: "PAUSE", seekTime: audio.currentTime });
    } else {
      audio.currentTime = 0; // Always start from 0
      setCurrentTime(0);
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({
          type: "PLAY",
          trackIndex: currentIndex,
          seekTime: 0,
          timestamp: Date.now(),
        });
      }).catch(() => {});
    }
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    const prevIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex - 1 + queue.length) % queue.length;
    
    setCurrentIndex(prevIdx);
    setCurrentTime(0);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;
    
    setCurrentIndex(nextIdx);
    setCurrentTime(0);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = targetTime;
      setCurrentTime(targetTime);
      broadcast({ type: "SEEK", seekTime: targetTime, timestamp: Date.now() });
    }
  };

  const handleTrackClick = (idx: number) => {
    if (!isHost) return;
    setCurrentIndex(idx);
    setCurrentTime(0);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: idx, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
    }
  };

  // Queue management
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
    broadcast({ type: "UPDATE_QUEUE", queue: updatedQueue, activeIndex: currentIndex });

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

    const updatedQueue = [...queue, newTrack];
    setQueue(updatedQueue);
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
    setCurrentIndex(newActive);
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
    broadcast({ type: "UPDATE_QUEUE", queue: newQueue, activeIndex: newActive });
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    setUsers((prev) => prev.map((u) => ({ ...u, isHost: u.id === targetUserId })));
    broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
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
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                disabled={!isHost}
                className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black disabled:opacity-50"
              />
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => setIsShuffle(!isShuffle)} disabled={!isConnected}
                className={`p-2 border border-black transition-colors disabled:opacity-50 ${isShuffle ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
                <Shuffle className="w-4 h-4" />
              </button>
              <button onClick={handlePrevious} disabled={!isConnected}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50">
                <SkipBack className="w-5 h-5" />
              </button>
              <button onClick={handleTogglePlay} disabled={!isConnected}
                className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors disabled:opacity-50">
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>
              <button onClick={handleNext} disabled={!isConnected}
                className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50">
                <SkipForward className="w-5 h-5" />
              </button>
              <button onClick={() => setIsMuted(!isMuted)} disabled={!isConnected}
                className={`p-2 border border-black transition-colors disabled:opacity-50 ${isMuted ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
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
                      <button onClick={() => handleTransferHost(user.id)}
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
              <span className="font-bold text-xs uppercase tracking-wider">Queue ({queue.length})</span>
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
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <div key={track.id}
                    className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${isCurrent ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:border-gray-400'}`}>
                    <div onClick={() => handleTrackClick(idx)} className="min-w-0 flex-1 cursor-pointer">
                      <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                      <p className={`text-[11px] truncate ${isCurrent ? 'text-gray-300' : 'text-gray-500'}`}>{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleReorder(idx, 'up')} disabled={idx === 0}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleReorder(idx, 'down')} disabled={idx === queue.length - 1}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleRemoveTrack(idx)}
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

      {/* Hidden Audio */}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={handleTrackEnd}
      />

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Firebase Powered Audio Sync
      </footer>
    </div>
  );
};

export default Room;