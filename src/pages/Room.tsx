import { useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Peer from "peerjs";
import { toast } from "sonner";
import { Track, RoomUser, SyncMessage } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { generateUniqueName } from "@/lib/userNames";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import RoomDrawer from "@/components/RoomDrawer";
import NowPlaying from "@/components/room/NowPlaying";
import ParticipantsList from "@/components/room/ParticipantsList";
import QueueList from "@/components/room/QueueList";
import AddTrackDialog from "@/components/room/AddTrackDialog";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  const [userName, setUserName] = useState(initialName);
  const [isHost, setIsHost] = useState(initialIsHost);
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isShuffle, setIsShuffle] = useState(false);
  const [addSongOpen, setAddSongOpen] = useState(false);

  // Track the host's current audio state for syncing new connections
  const hostStateRef = useRef<{ seekTime: number; isPlaying: boolean }>({
    seekTime: 0,
    isPlaying: false,
  });
  const queueRef = useRef(queue);
  queueRef.current = queue;

  // Sync incoming messages: state setters and side effects for the audio player
  const handleSyncPlay = (trackIndex: number, seekTime: number) => {
    hostStateRef.current = { seekTime, isPlaying: true };
    setCurrentIndex(trackIndex);
  };

  const handleSyncPause = (seekTime: number) => {
    hostStateRef.current = { seekTime, isPlaying: false };
  };

  const handleSyncSeek = (seekTime: number) => {
    hostStateRef.current = { ...hostStateRef.current, seekTime };
  };

  const handleSyncQueue = (newQueue: Track[], activeIndex: number) => {
    setQueue(newQueue);
    setCurrentIndex(activeIndex);
  };

  const handleSyncHostTransfer = (newHostId: string) => {
    if (newHostId === peer.myId) {
      setIsHost(true);
      toast.success("You are now the Host of this Jam!");
    } else {
      setIsHost(false);
    }
    peer.setUsers((prev) =>
      prev.map((u) => ({ ...u, isHost: u.id === newHostId }))
    );
  };

  const handleSyncNameUpdate = (newName: string) => {
    setUserName(newName);
  };

  // Peer connection management
  const peer = usePeerConnection({
    roomCode,
    userName,
    isHost,
    onSyncPlay: (idx, seek) => handleSyncPlay(idx, seek),
    onSyncPause: (seek) => handleSyncPause(seek),
    onSyncSeek: (seek) => handleSyncSeek(seek),
    onSyncQueue: (q, idx) => handleSyncQueue(q, idx),
    onSyncHostTransfer: handleSyncHostTransfer,
    onSyncNameUpdate: handleSyncNameUpdate,
    onUserListUpdate: (users) => peer.setUsers(users),
    onPeerJoin: (user, senderPeerId) => {
      // Host adds the new user to the list and broadcasts
      if (peer.isHostRef.current) {
        const uniqueName = generateUniqueName(user.name, []);
        const finalUser = { ...user, name: uniqueName };
        const conn = peer.connectionsRef.current.get(senderPeerId);
        if (conn && conn.open && uniqueName !== user.name) {
          conn.send({
            type: "NAME_UPDATE",
            newName: uniqueName,
            originalName: user.name,
          });
        }
        const updatedUsers = [
          ...peer.users.map((u) => u).filter((u) => u.id !== finalUser.id),
          finalUser,
        ];
        peer.setUsers(updatedUsers);
        peer.broadcast({ type: "USER_LIST", users: updatedUsers });
        peer.broadcast({
          type: "UPDATE_QUEUE",
          queue: queueRef.current,
          activeIndex: currentIndex,
        });
        if (hostStateRef.current.isPlaying) {
          const conn2 = peer.connectionsRef.current.get(senderPeerId);
          if (conn2 && conn2.open) {
            conn2.send({
              type: "PLAY",
              trackIndex: currentIndex,
              seekTime: hostStateRef.current.seekTime,
              timestamp: Date.now(),
            });
          }
        }
      }
    },
    onUserUpdate: (user) => {
      peer.setUsers((prev) => {
        const filtered = prev.filter((u) => u.id !== user.id);
        return [...filtered, user];
      });
    },
  });

  // Audio player hook
  const audio = useAudioPlayer({
    queue,
    currentIndex,
    isShuffle,
    onTrackChange: (idx) => {
      setCurrentIndex(idx);
      currentIndexRef.current = idx;
    },
    onPlay: (idx, seek) => {
      hostStateRef.current = { seekTime: seek, isPlaying: true };
      const msg: SyncMessage = {
        type: "PLAY",
        trackIndex: idx,
        seekTime: seek,
        timestamp: Date.now(),
      };
      peer.broadcast(msg);
    },
    onPause: (seek) => {
      hostStateRef.current = { seekTime: seek, isPlaying: false };
      peer.broadcast({ type: "PAUSE", seekTime: seek });
    },
    onSeek: (seek) => {
      hostStateRef.current = { ...hostStateRef.current, seekTime: seek };
      peer.broadcast({
        type: "SEEK",
        seekTime: seek,
        timestamp: Date.now(),
      });
    },
    onAutoNext: () => {
      const nextIdx = (currentIndex + 1) % queue.length;
      return nextIdx;
    },
  });

  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Send initial sync to new connections (host only)
  // Broadcast queue updates from this client
  const broadcastQueueUpdate = (newQueue: Track[], activeIndex: number) => {
    setQueue(newQueue);
    setCurrentIndex(activeIndex);
    peer.broadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex,
    });
  };

  // Queue operations
  const handleAddTrack = (track: Track) => {
    const updatedQueue = [...queue, track];
    broadcastQueueUpdate(updatedQueue, currentIndex);
    toast.success("Track added to queue!");
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

    broadcastQueueUpdate(newQueue, newActive);
  };

  const handleRemoveTrack = (idx: number) => {
    if (queue.length <= 1) {
      toast.error("Queue must have at least one track.");
      return;
    }
    const newQueue = queue.filter((_, i) => i !== idx);
    let newActive = currentIndex;
    if (idx < currentIndex) newActive = currentIndex - 1;
    else if (idx === currentIndex)
      newActive = Math.min(currentIndex, newQueue.length - 1);

    broadcastQueueUpdate(newQueue, newActive);
  };

  const handleTransferHost = (targetUserId: string) => {
    if (!isHost) return;
    setIsHost(false);
    peer.setUsers((prev) =>
      prev.map((u) => ({ ...u, isHost: u.id === targetUserId }))
    );
    peer.broadcast({ type: "HOST_TRANSFER", newHostId: targetUserId });
    toast.info("Host controls transferred.");
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">
            Meoww
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RoomDrawer
            roomCode={roomCode}
            userName={userName}
            onLeave={handleLeaveRoom}
          />
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <NowPlaying
            track={audio.currentTrack}
            isHost={isHost}
            isConnected={peer.isConnected}
            ping={peer.ping}
            currentTime={audio.currentTime}
            duration={audio.duration}
            isPlaying={audio.isPlaying}
            isMuted={audio.isMuted}
            isShuffle={isShuffle}
            onTogglePlay={audio.togglePlay}
            onNext={audio.goToNext}
            onPrevious={audio.goToPrevious}
            onShuffleToggle={() => setIsShuffle((p) => !p)}
            onMuteToggle={() => audio.setIsMuted((p) => !p)}
            onSeek={(time) => audio.seekTo(time, isHost)}
          />

          <div className="border border-gray-300 p-4 bg-gray-50 text-xs font-mono text-gray-600 space-y-1.5">
            <p className="font-bold text-black uppercase">
              🎧 Tip for your own music:
            </p>
            <p>
              You can add any MP3 link from GitHub, or upload your local
              test.mp3 file directly using the "Add Track" button.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <ParticipantsList
            users={peer.users}
            myId={peer.myId}
            isHost={isHost}
            onTransferHost={handleTransferHost}
          />

          <QueueList
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            onPlay={(idx) => audio.playTrack(idx, 0)}
            onReorder={handleReorder}
            onRemove={handleRemoveTrack}
            onAddClick={() => setAddSongOpen(true)}
          />
        </div>
      </main>

      <audio
        ref={audio.audioRef}
        src={audio.currentTrack?.url}
        preload="auto"
        onTimeUpdate={() => {
          if (audio.audioRef.current) {
            audio.setCurrentTime(audio.audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audio.audioRef.current) {
            audio.setDuration(audio.audioRef.current.duration);
          }
        }}
        onCanPlay={() => audio.setAudioLoaded(true)}
        onPlay={() => {
          // The useAudioPlayer hook also tracks this internally
        }}
        onPause={() => {
          // The useAudioPlayer hook also tracks this internally
        }}
        onEnded={audio.handleEnded}
      />

      <AddTrackDialog
        open={addSongOpen}
        onOpenChange={setAddSongOpen}
        userName={userName}
        onAdd={handleAddTrack}
      />

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Room;