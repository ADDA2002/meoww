import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Track } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { useRoomSync } from "@/hooks/useRoomSync";
import RoomHeader from "@/components/room/RoomHeader";
import MusicPlayerCard from "@/components/room/MusicPlayerCard";
import UploadTip from "@/components/room/UploadTip";
import ParticipantsList from "@/components/room/ParticipantsList";
import QueuePanel from "@/components/room/QueuePanel";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  // Initialize queue with default tracks (host only)
  const [queue, setQueue] = useState<Track[]>(initialIsHost ? DEFAULT_TRACKS : []);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Player state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>(queue);
  const currentIndexRef = useRef<number>(currentIndex);
  const isPlayingRef = useRef<boolean>(false);

  // Sync queue refs
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Sync mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Peer / sync layer
  const {
    myId,
    userName,
    isHost,
    setIsHost,
    isConnected,
    users,
    broadcast,
    updateQueue,
  } = useRoomSync({
    roomCode,
    initialName,
    initialIsHost,
    onUserListUpdate: (updatedUsers) => {
      console.log("Users updated:", updatedUsers);
    },
    onQueueUpdate: (newQueue, newIndex) => {
      console.log("Queue updated from host:", newQueue.length, "tracks");
    },
    onPlay: (trackIndex, seekTime, timestamp) => {
      // Sync playback from host
      const audio = audioRef.current;
      if (!audio) return;

      const serverTime = Date.now();
      const playbackTime = seekTime + (serverTime - timestamp) / 1000;

      setCurrentIndex(trackIndex);
      currentIndexRef.current = trackIndex;

      const targetUrl = queueRef.current[trackIndex]?.url;
      if (!targetUrl) return;

      if (audio.src !== targetUrl) {
        audio.src = targetUrl;
        audio.load();
      }

      audio.addEventListener("canplay", function onCanPlay() {
        audio.removeEventListener("canplay", onCanPlay);
        audio.currentTime = Math.max(0, playbackTime);
        audio.play().then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }).catch(console.error);
      });
    },
    onPause: (seekTime) => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = seekTime;
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    },
    onSeek: (seekTime, timestamp) => {
      const audio = audioRef.current;
      if (audio) {
        const serverTime = Date.now();
        const adjustedTime = seekTime + (serverTime - timestamp) / 1000;
        audio.currentTime = Math.max(0, adjustedTime);
        setCurrentTime(audio.currentTime);
      }
    },
    onHostTransfer: (newHostId) => {
      setIsHost(newHostId === myId);
      toast.info(newHostId === myId ? "You are now the host!" : "Host controls transferred.");
    },
    onPeerDisconnect: (peerId) => {
      console.log("Peer disconnected:", peerId);
    },
  });

  // Initialize queue for host
  useEffect(() => {
    if (initialIsHost && isConnected && queue.length === 0) {
      setQueue(DEFAULT_TRACKS);
      queueRef.current = DEFAULT_TRACKS;
      // Broadcast initial queue to any already-connected users
      broadcast({
        type: "UPDATE_QUEUE",
        queue: DEFAULT_TRACKS,
        activeIndex: 0,
      });
    }
  }, [initialIsHost, isConnected]);

  // Ping measurement (listeners only)
  useEffect(() => {
    if (isHost || !isConnected) return;

    const measurePing = () => {
      const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
      const testPeer = new Peer(`${myId}-ping-${Date.now()}`, { debug: 0 });

      const timeout = setTimeout(() => {
        try { testPeer.destroy(); } catch (e) { /* noop */ }
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
      });

      testPeer.on("error", () => {
        clearTimeout(timeout);
        try { testPeer.destroy(); } catch (e) { /* noop */ }
      });
    };

    const initialTimer = setTimeout(measurePing, 1500);
    const interval = setInterval(measurePing, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isHost, isConnected, roomCode, myId]);

  // Queue update helper that broadcasts to peers
  const updateQueueAndBroadcast = (newQueue: Track[], newActiveIndex: number) => {
    setQueue(newQueue);
    setCurrentIndex(newActiveIndex);
    queueRef.current = newQueue;
    currentIndexRef.current = newActiveIndex;
    broadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActiveIndex,
    });
  };

  const handlePlayTrack = (idx: number) => {
    setCurrentIndex(idx);
    currentIndexRef.current = idx;
    playAudio(idx, 0);
  };

  const handleAddByUrl = (track: Track) => {
    const updatedQueue = [...queue, track];
    updateQueueAndBroadcast(updatedQueue, currentIndex);
    toast.success("Track added to queue!");
  };

  const handleAddLocalFile = (track: Track) => {
    const updatedQueue = [...queue, track];
    updateQueueAndBroadcast(updatedQueue, currentIndex);
    toast.success(`Loaded local audio: ${track.title}`);
  };

  const handleReorder = (idx: number, direction: "up" | "down") => {
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === queue.length - 1) return;

    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    const newQueue = [...queue];
    const temp = newQueue[idx];
    newQueue[idx] = newQueue[targetIdx];
    newQueue[targetIdx] = temp;

    let newActive = currentIndex;
    if (currentIndex === idx) {
      newActive = targetIdx;
    } else if (currentIndex === targetIdx) {
      newActive = idx;
    }

    updateQueueAndBroadcast(newQueue, newActive);
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
    updateQueueAndBroadcast(newQueue, newActive);
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    broadcast({
      type: "HOST_TRANSFER",
      newHostId: targetUserId,
    });
    setIsHost(false);
    toast.info("Host controls transferred.");
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  const currentTrack = queue[currentIndex] || null;

  // Audio playback helpers
  const playAudio = (trackIndex: number, seekTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentIndex(trackIndex);
    currentIndexRef.current = trackIndex;

    const targetUrl = queue[trackIndex]?.url;
    if (!targetUrl) return;

    const startPlayback = () => {
      audio.currentTime = seekTime;
      audio.play().then(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        // Broadcast play to all listeners
        broadcast({
          type: "PLAY",
          trackIndex,
          seekTime,
          timestamp: Date.now(),
        });
      }).catch((err) => {
        console.log("Play failed, retrying:", err);
        setTimeout(() => {
          audio.play().then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            broadcast({
              type: "PLAY",
              trackIndex,
              seekTime,
              timestamp: Date.now(),
            });
          }).catch(console.error);
        }, 300);
      });
    };

    if (audio.src !== targetUrl) {
      audio.addEventListener("canplay", function onCanPlay() {
        audio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      });
      audio.src = targetUrl;
      audio.load();
    } else if (audio.readyState >= 2) {
      startPlayback();
    } else {
      audio.addEventListener("canplay", function onCanPlay() {
        audio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      });
      audio.load();
    }
  };

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      broadcast({
        type: "PAUSE",
        seekTime: audio.currentTime,
      });
    } else {
      playAudio(currentIndex, audio.currentTime);
    }
  };

  const handleNext = () => {
    if (queue.length === 0) return;
    let nextIdx = 0;
    if (isShuffle && queue.length > 1) {
      do {
        nextIdx = Math.floor(Math.random() * queue.length);
      } while (nextIdx === currentIndex);
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    playAudio(nextIdx, 0);
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = 0;
    if (isShuffle && queue.length > 1) {
      do {
        prevIdx = Math.floor(Math.random() * queue.length);
      } while (prevIdx === currentIndex);
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }
    playAudio(prevIdx, 0);
  };

  const handleShuffleToggle = () => setIsShuffle((prev) => !prev);
  const handleMuteToggle = () => setIsMuted((prev) => !prev);

  const handleSeek = (targetTime: number) => {
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

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <RoomHeader
        roomCode={roomCode}
        userName={userName}
        onLeave={handleLeaveRoom}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Music Player */}
        <div className="lg:col-span-7 space-y-6">
          <MusicPlayerCard
            currentTrack={currentTrack}
            isHost={isHost}
            isConnected={isConnected}
            ping={ping}
            isPlaying={isPlaying}
            isShuffle={isShuffle}
            isMuted={isMuted}
            currentTime={currentTime}
            duration={duration}
            onTogglePlay={handleTogglePlay}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onShuffleToggle={handleShuffleToggle}
            onMuteToggle={handleMuteToggle}
            onSeek={handleSeek}
          />
          <UploadTip />
        </div>

        {/* Right Column: Queue & Participants */}
        <div className="lg:col-span-5 space-y-6">
          <ParticipantsList
            users={users}
            myId={myId}
            isHost={isHost}
            onTransferHost={handleTransferHost}
          />
          <QueuePanel
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            userName={userName}
            onPlayTrack={handlePlayTrack}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddByUrl={handleAddByUrl}
            onAddLocalFile={handleAddLocalFile}
          />
        </div>
      </main>

      <audio
        ref={audioRef}
        src={currentTrack?.url}
        preload="auto"
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
        onPlay={() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        }}
        onPause={() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
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