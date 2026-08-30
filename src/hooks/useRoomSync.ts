import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { RoomUser, SyncMessage } from "@/types/music";
import { toast } from "sonner";

interface UseRoomSyncOptions {
  roomCode: string;
  initialName: string;
  initialIsHost: boolean;
  onJoinAccepted?: (me: RoomUser, isDuplicate: boolean, uniqueName: string) => void;
  onNameUpdate?: (newName: string, originalName: string) => void;
  onUserListUpdate?: (users: RoomUser[]) => void;
  onPlay?: (trackIndex: number, seekTime: number, timestamp: number) => void;
  onPause?: (seekTime: number) => void;
  onSeek?: (seekTime: number, timestamp: number) => void;
  onQueueUpdate?: (queue: any[], activeIndex: number) => void;
  onHostTransfer?: (newHostId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
}

export const useRoomSync = (options: UseRoomSyncOptions) => {
  const { roomCode, initialName, initialIsHost } = options;

  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const isHostRef = useRef<boolean>(initialIsHost);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const broadcast = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }, []);

  // Generate a unique name by adding a number suffix with a space if there's a conflict
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

  const handleIncomingMessage = useCallback((msg: SyncMessage, senderPeerId: string) => {
    switch (msg.type) {
      case "NAME_UPDATE": {
        setUserName(msg.newName);
        options.onNameUpdate?.(msg.newName, msg.originalName);
        break;
      }
      case "PLAY":
        options.onPlay?.(msg.trackIndex, msg.seekTime, msg.timestamp);
        break;
      case "PAUSE":
        options.onPause?.(msg.seekTime);
        break;
      case "SEEK":
        options.onSeek?.(msg.seekTime, msg.timestamp);
        break;
      case "UPDATE_QUEUE":
        options.onQueueUpdate?.(msg.queue, msg.activeIndex);
        break;
      case "USER_LIST":
        options.onUserListUpdate?.(msg.users);
        break;
      case "HOST_TRANSFER":
        options.onHostTransfer?.(msg.newHostId);
        break;
      default:
        break;
    }
  }, [options]);

  // Initialize peer
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = initialIsHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(generatedId);

    const peer = new Peer(generatedId, { debug: 1 });
    peerRef.current = peer;

    const me: RoomUser = {
      id: generatedId,
      name: initialName,
      isHost: initialIsHost,
      joinedAt: Date.now(),
    };

    peer.on("open", () => {
      setIsConnected(true);

      if (!initialIsHost) {
        const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });
        setupConnection(conn, me);
      }
    });

    peer.on("connection", (conn) => {
      setupConnection(conn, me);
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err);
      if (err.type === "unavailable-id" && initialIsHost) {
        toast.error("Room host already active. Joining as listener.");
        setIsHost(false);
      } else {
        toast.error("Connection notice: " + (err.message || "Working in local mode."));
      }
    });

    return () => {
      peer.destroy();
    };

    function setupConnection(conn: DataConnection, currentUser: RoomUser) {
      conn.on("open", () => {
        connectionsRef.current.set(conn.peer, conn);
        conn.send({ type: "JOIN", user: currentUser });
      });

      conn.on("data", (data: any) => {
        handleIncomingMessage(data as SyncMessage, conn.peer);
      });

      conn.on("close", () => {
        connectionsRef.current.delete(conn.peer);
        options.onPeerDisconnect?.(conn.peer);
      });
    }
  }, [roomCode]);

  const sendTo = useCallback((peerId: string, msg: SyncMessage) => {
    const conn = connectionsRef.current.get(peerId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }, []);

  return {
    myId,
    userName,
    setUserName,
    isHost,
    setIsHost,
    isConnected,
    broadcast,
    sendTo,
    generateUniqueName,
  };
};