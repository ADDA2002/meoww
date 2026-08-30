import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { RoomUser, SyncMessage, Track } from "@/types/music";
import { generateUniqueName } from "@/lib/userNames";
import { toast } from "sonner";

interface UsePeerConnectionOptions {
  roomCode: string;
  userName: string;
  isHost: boolean;
  onSyncPlay: (trackIndex: number, seekTime: number, timestamp: number) => void;
  onSyncPause: (seekTime: number) => void;
  onSyncSeek: (seekTime: number, timestamp: number) => void;
  onSyncQueue: (queue: Track[], activeIndex: number) => void;
  onSyncHostTransfer: (newHostId: string) => void;
  onSyncNameUpdate: (newName: string) => void;
  onUserListUpdate: (users: RoomUser[]) => void;
  onPeerJoin: (user: RoomUser, senderPeerId: string) => void;
  onUserUpdate: (user: RoomUser) => void;
}

export function usePeerConnection({
  roomCode,
  userName,
  isHost,
  onSyncPlay,
  onSyncPause,
  onSyncSeek,
  onSyncQueue,
  onSyncHostTransfer,
  onSyncNameUpdate,
  onUserListUpdate,
  onPeerJoin,
  onUserUpdate,
}: UsePeerConnectionOptions) {
  const [myId, setMyId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [ping, setPing] = useState(0);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const usersRef = useRef<RoomUser[]>([]);
  const isHostRef = useRef(isHost);

  usersRef.current = users;
  isHostRef.current = isHost;

  const broadcast = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) conn.send(msg);
    });
  }, []);

  // Handle incoming messages
  const handleIncoming = useCallback(
    (msg: SyncMessage, senderPeerId: string) => {
      switch (msg.type) {
        case "NAME_UPDATE":
          onSyncNameUpdate(msg.newName);
          break;
        case "JOIN":
          onPeerJoin(msg.user, senderPeerId);
          break;
        case "USER_LIST":
          onUserListUpdate(msg.users);
          break;
        case "PLAY":
          onSyncPlay(msg.trackIndex, msg.seekTime, msg.timestamp);
          break;
        case "PAUSE":
          onSyncPause(msg.seekTime);
          break;
        case "SEEK":
          onSyncSeek(msg.seekTime, msg.timestamp);
          break;
        case "UPDATE_QUEUE":
          onSyncQueue(msg.queue, msg.activeIndex);
          break;
        case "HOST_TRANSFER":
          onSyncHostTransfer(msg.newHostId);
          break;
      }
    },
    [
      onSyncNameUpdate,
      onPeerJoin,
      onUserListUpdate,
      onSyncPlay,
      onSyncPause,
      onSyncSeek,
      onSyncQueue,
      onSyncHostTransfer,
    ]
  );

  const setupConnection = useCallback(
    (conn: DataConnection, me: RoomUser) => {
      conn.on("open", () => {
        if (isHostRef.current) {
          const uniqueName = generateUniqueName(me.name, usersRef.current);
          const finalUser = { ...me, name: uniqueName };

          connectionsRef.current.set(conn.peer, conn);

          if (uniqueName !== me.name) {
            conn.send({ type: "JOIN", user: finalUser });
            conn.send({
              type: "NAME_UPDATE",
              newName: uniqueName,
              originalName: me.name,
            });
            return;
          }

          conn.send({ type: "JOIN", user: me });
        } else {
          connectionsRef.current.set(conn.peer, conn);
          conn.send({ type: "JOIN", user: me });
        }
      });

      conn.on("data", (data: any) => {
        handleIncoming(data as SyncMessage, conn.peer);
      });

      conn.on("close", () => {
        connectionsRef.current.delete(conn.peer);
        setUsers((prev) => prev.filter((u) => u.id !== conn.peer));
      });
    },
    [handleIncoming]
  );

  // Initialize peer
  useEffect(() => {
    if (!roomCode) return;

    const generatedId = isHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(generatedId);

    const finalName = isHost ? userName : generateUniqueName(userName, []);
    const currentUser: RoomUser = {
      id: generatedId,
      name: finalName,
      isHost,
      joinedAt: Date.now(),
    };

    setUsers([currentUser]);

    const peer = new Peer(generatedId, { debug: 1 });
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
      console.warn("PeerJS error:", err);
      if (err.type === "unavailable-id" && isHost) {
        toast.error("Room host already active. Joining as listener.");
      } else {
        toast.error("Connection notice: " + (err.message || "Working in local mode."));
      }
    });

    return () => {
      peer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode]);

  // Ping measurement for listeners
  useEffect(() => {
    if (isHost || !myId) return;

    const measurePing = () => {
      const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
      const testPeer = new Peer(`${myId}-ping-${Date.now()}`, { debug: 0 });

      const timeout = setTimeout(() => {
        try {
          testPeer.destroy();
        } catch (e) {
          /* noop */
        }
      }, 2000);

      testPeer.on("open", () => {
        const startTime = Date.now();
        const conn = testPeer.connect(hostPeerId, { reliable: true });

        conn.on("open", () => {
          clearTimeout(timeout);
          setPing(Date.now() - startTime);
          try {
            conn.close();
          } catch (e) {
            /* noop */
          }
          try {
            testPeer.destroy();
          } catch (e) {
            /* noop */
          }
        });

        conn.on("error", () => {
          clearTimeout(timeout);
          try {
            testPeer.destroy();
          } catch (e) {
            /* noop */
          }
        });
      });

      testPeer.on("error", () => {
        clearTimeout(timeout);
        try {
          testPeer.destroy();
        } catch (e) {
          /* noop */
        }
      });
    };

    const initialTimer = setTimeout(measurePing, 1000);
    const interval = setInterval(measurePing, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isHost, roomCode, myId]);

  return {
    myId,
    isConnected,
    users,
    ping,
    setUsers,
    broadcast,
    connectionsRef,
    isHostRef,
  };
}