import { useCallback, useRef } from "react";
import type { RoomUser, SyncMessage, Track } from "@/types/music";

interface UseRoomSyncOptions {
  isHost: boolean;
  userName: string;
  queue: Track[];
  currentIndex: number;
  users: RoomUser[];
  onUsersChange: (users: RoomUser[]) => void;
  onQueueChange: (queue: Track[], activeIndex: number) => void;
  onPlay: (trackIndex: number, seekTime: number, timestamp: number) => void;
  onPause: (seekTime: number) => void;
  onSeek: (seekTime: number) => void;
  onNameUpdate: (newName: string, originalName: string) => void;
  broadcast: (msg: SyncMessage) => void;
}

export function useRoomSync({
  isHost,
  userName,
  queue,
  currentIndex,
  users,
  onUsersChange,
  onQueueChange,
  onPlay,
  onPause,
  onSeek,
  onNameUpdate,
  broadcast,
}: UseRoomSyncOptions) {
  const usersRef = useRef(users);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);

  useRef(() => {
    usersRef.current = users;
  });
  useRef(() => {
    queueRef.current = queue;
  });
  useRef(() => {
    currentIndexRef.current = currentIndex;
  });

  // Handle incoming messages
  const handleMessage = useCallback((msg: SyncMessage, _senderId: string) => {
    switch (msg.type) {
      case "NAME_UPDATE":
        onNameUpdate(msg.newName, msg.originalName);
        break;

      case "JOIN": {
        const existingUser = usersRef.current.find(u => u.id === msg.user.id);
        if (!existingUser) {
          const updatedUsers = [...usersRef.current, msg.user];
          onUsersChange(updatedUsers);
        }
        break;
      }

      case "USER_LIST":
        onUsersChange(msg.users);
        break;

      case "PLAY":
        onPlay(msg.trackIndex, msg.seekTime, msg.timestamp);
        break;

      case "PAUSE":
        onPause(msg.seekTime);
        break;

      case "SEEK":
        onSeek(msg.seekTime);
        break;

      case "UPDATE_QUEUE":
        onQueueChange(msg.queue, msg.activeIndex);
        break;
    }
  }, [onUsersChange, onQueueChange, onPlay, onPause, onSeek, onNameUpdate]);

  // Generate unique name
  const generateUniqueName = useCallback((baseName: string, existingUsers: RoomUser[]): string => {
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
  }, []);

  // Broadcast current state to new peer (host only)
  const syncStateToPeer = useCallback((peerId: string, _conn: any) => {
    if (!isHost) return;

    // Send current users
    broadcast({ type: "USER_LIST", users: usersRef.current });

    // Send current queue
    broadcast({ type: "UPDATE_QUEUE", queue: queueRef.current, activeIndex: currentIndexRef.current });
  }, [isHost, broadcast]);

  return {
    handleMessage,
    generateUniqueName,
    syncStateToPeer,
  };
}