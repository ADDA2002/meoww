import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Track, RoomUser } from "@/types/music";
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

  // Local state
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [ping, setPing] = useState<number>(0);
  const [audioLoaded, setAudioLoaded] = useState<boolean>(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Track[]>(queue);
  const isHostRef = useRef<boolean>(initialIsHost);
  const currentIndexRef = useRef<number>(currentIndex);
  const isPlayingRef = useRef<boolean>(false);
  const audioLoadedRef = useRef<boolean>(false);
  const pendingSeekRef = useRef<number | null>(null);
  const usersRef = useRef<RoomUser[]>([]);

  // Keep refs in sync
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { isHostRef.current = isPlaying; /* placeholder fix below */ }, []);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { usersRef.current = users; }, [users]);

  // Sync mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Reset audio loaded state on track change
  useEffect(() => {
    setAudioLoaded(false);
    audioLoadedRef.current = false;
  }, [currentIndex]);

  // Peer / sync layer
  const {
    myId,
    userName,
    setUserName,
    isHost,
    setIsHost,
    isConnected,
    broadcast,
  } = useRoomSync({
    roomCode,
    initialName,
    initialIsHost,
    onNameUpdate: (newName, originalName) => {
      toast.info(`Your name was updated to "${newName}" because "${originalName}" was taken.`);
    },
  });

  // Keep isHostRef synced with hook state
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Add me to users list when connected
  useEffect(() => {
    if (!myId) return;
    setUsers((prev) => {
      const me: RoomUser = {
        id: myId,
        name: userName,
        isHost: isHost,
        joinedAt: Date.now(),
      };
      if (prev.find((u) => u.id === myId)) return prev;
      return [me, ...prev];
    });
  }, [myId, userName, isHost]);

  // Ping measurement (listeners only)
  useEffect(() => {
    if (isHost) return;

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

    const initialTimer = setTimeout(measurePing, 1000);
    const interval = setInterval(measurePing, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isHost, roomCode, myId]);

  // Queue update helper that broadcasts to peers
  const updateQueueAndBroadcast = (newQueue: Track[], newActiveIndex: number) => {
    setQueue(newQueue);
    setCurrentIndex(newActiveIndex);
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
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
          broadcast({
            type: "PLAY",
            trackIndex,
            seekTime,
            timestamp: Date.now(),
          });
        }).catch((err) => {
          console.log("Play attempt failed, retrying:", err);
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
      }
    };

    const onCanPlay = () => {
      audio.removeEventListener("canplay", onCanPlay);
      startPlayback();
    };

    if (audio.src !== targetUrl) {
      audio.addEventListener("canplay", onCanPlay);
      audio.src = targetUrl;
      audio.load();
    } else if (audio.readyState >= 2) {
      startPlayback();
    } else {
      audio.addEventListener("canplay", onCanPlay);
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
    if (isShuffle) {
      if (queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === currentIndex);
      } else {
        nextIdx = 0;
      }
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    playAudio(nextIdx, 0);
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = 0;
    if (isShuffle) {
      if (queue.length > 1) {
        do {
          prevIdx = Math.floor(Math.random() * queue.length);
        } while (prevIdx === currentIndex);
      } else {
        prevIdx = 0;
      }
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
        {/* Left Column: Music Player & Host Dashboard */}
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

        {/* Right Column: Shared Queue & Connected Listeners */}
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
        onEnded={handleNext}
      />

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;