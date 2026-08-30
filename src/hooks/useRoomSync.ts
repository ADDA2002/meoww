import { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { RoomUser, SyncMessage, Track } from "@/types/music";
import { toast } from "sonner";

interface UseRoomSyncOptions {
  roomCode: string;
  initialName: string;
  initialIsHost: boolean;
  onUserListUpdate?: (users: RoomUser[]) => void;
  onQueueUpdate?: (queue: Track[], activeIndex: number) => void;
  onPlay?: (trackIndex: number, seekTime: number, timestamp: number) => void;
  onPause?: (seekTime: number) => void;
  onSeek?: (seekTime: number, timestamp: number) => void;
  onHostTransfer?: (newHostId: string) => void;
  onPeerDisconnect?: (peerId: string) => void;
  onJoinRequest?: (user: RoomUser, respond: (accept: boolean, users: RoomUser[], queue: Track[], activeIndex: number) => void) => void;
}

export const useRoomSync = (options: UseRoomSyncOptions) => {
  const { roomCode, initialName, initialIsHost } = options;

  const [myId, setMyId] = useState<string>("");
  const [userName, setUserName] = useState<string>(initialName);
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [users, setUsers] = useState<RoomUser[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const usersRef = useRef<RoomUser[]>([]);
  const queueRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(0);

  // Keep refs in sync
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  const broadcast = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }, []);

  const sendTo = useCallback((peerId: string, msg: SyncMessage) => {
    const conn = connectionsRef.current.get(peerId);
    if (conn && conn.open) {
      conn.send(msg);
    }
  }, []);

  // Add user locally and broadcast update
  const addUser = useCallback((user: RoomUser) => {
    setUsers((prev) => {
      if (prev.find((u) => u.id === user.id)) return prev;
      const updated = [...prev, user];
      // Broadcast to all existing connections
      broadcast({ type: "USER_LIST", users: updated });
      return updated;
    });
  }, [broadcast]);

  // Remove user locally and broadcast update
  const removeUser = useCallback((userId: string) => {
    setUsers((prev) => {
      const updated = prev.filter((u) => u.id !== userId);
      broadcast({ type: "USER_LIST", users: updated });
      return updated;
    });
  }, [broadcast]);

  // Update queue locally and broadcast
  const updateQueue = useCallback((newQueue: Track[], newActiveIndex: number) => {
    setQueue(newQueue);
    setCurrentIndex(newActiveIndex);
    queueRef.current = newQueue;
    currentIndexRef.current = newActiveIndex;
    broadcast({
      type: "UPDATE_QUEUE",
      queue: newQueue,
      activeIndex: newActiveIndex,
    });
  }, [broadcast]);

  // Initialize peer
  useEffect(() => {
    if (!roomCode) return;

    const peerId = initialIsHost
      ? `meoww-room-${roomCode.toLowerCase()}`
      : `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;

    setMyId(peerId);

    const me: RoomUser = {
      id: peerId,
      name: initialName,
      isHost: initialIsHost,
      joinedAt: Date.now(),
    };

    const peer = new Peer(peerId, { debug: 0 });
    peerRef.current = peer;

    peer.on("open", () => {
      setIsConnected(true);

      if (initialIsHost) {
        // I'm the host - add myself to users list
        addUser(me);
      } else {
        // I'm a listener - connect to host
        const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
        const conn = peer.connect(hostPeerId, { reliable: true });

        const timeout = setTimeout(() => {
          toast.error("Could not connect to host. Make sure the host is in the room.");
        }, 5000);

        conn.on("open", () => {
          clearTimeout(timeout);
          connectionsRef.current.set(hostPeerId, conn);
          // Send JOIN message to host
          conn.send({ type: "JOIN", user: me });
        });

        conn.on("data", (data: any) => {
          handleIncomingMessage(data as SyncMessage);
        });

        conn.on("close", () => {
          connectionsRef.current.delete(hostPeerId);
          options.onPeerDisconnect?.(hostPeerId);
        });

        conn.on("error", (err: any) => {
          clearTimeout(timeout);
          console.warn("Connection error:", err);
          toast.error("Connection lost to host.");
        });
      }
    });

    // Host handles incoming connections
    peer.on("connection", (conn) => {
      const timeout = setTimeout(() => {
        conn.close();
      }, 10000);

      conn.on("open", () => {
        clearTimeout(timeout);
        connectionsRef.current.set(conn.peer, conn);
      });

      conn.on("data", (data: any) => {
        clearTimeout(timeout);
        handleIncomingMessage(data as SyncMessage, conn);
      });

      conn.on("close", () => {
        connectionsRef.current.delete(conn.peer);
        const disconnectedUser = usersRef.current.find((u) => u.id === conn.peer);
        if (disconnectedUser) {
          removeUser(conn.peer);
          options.onPeerDisconnect?.(conn.peer);
        }
      });
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err);
      if (err.type === "unavailable-id" && initialIsHost) {
        toast.error("Room already exists. Try joining instead.");
      } else if (err.type !== "browser-bad-https") {
        toast.error("Connection issue: " + (err.message || "Check your connection."));
      }
    });

    return () => {
      peer.destroy();
    };

    function handleIncomingMessage(msg: SyncMessage, conn?: DataConnection) {
      switch (msg.type) {
        case "JOIN": {
          if (initialIsHost && conn) {
            // New user joining - add them
            const newUser = msg.user;
            addUser(newUser);
            
            // Send current state to the new user
            conn.send({
              type: "USER_LIST",
              users: usersRef.current,
            });
            
            if (queueRef.current.length > 0) {
              conn.send({
                type: "UPDATE_QUEUE",
                queue: queueRef.current,
                activeIndex: currentIndexRef.current,
              });
            }
          }
          break;
        }
        case "USER_LIST":
          if (!initialIsHost) {
            setUsers(msg.users);
            options.onUserListUpdate?.(msg.users);
          }
          break;
        case "UPDATE_QUEUE":
          if (!initialIsHost) {
            setQueue(msg.queue);
            setCurrentIndex(msg.activeIndex);
            queueRef.current = msg.queue;
            currentIndexRef.current = msg.activeIndex;
            options.onQueueUpdate?.(msg.queue, msg.activeIndex);
          }
          break;
        case "PLAY":
          options.onPlay?.(msg.trackIndex, msg.seekTime, msg.timestamp);
          break;
        case "PAUSE":
          options.onPause?.(msg.seekTime);
          break;
        case "SEEK":
          options.onSeek?.(msg.seekTime, msg.timestamp);
          break;
        case "HOST_TRANSFER":
          if (conn) {
            // I'm receiving host transfer
            setIsHost(true);
            setIsHost(true); // Will be set again below
            // Update user's own host status
            setUsers((prev) =>
              prev.map((u) => ({
                ...u,
                isHost: u.id === myId,
              }))
            );
          }
          options.onHostTransfer?.(msg.newHostId);
          break;
        default:
          break;
      }
    }
  }, [roomCode, initialName, initialIsHost]);

  return {
    myId,
    userName,
    setUserName,
    isHost,
    setIsHost,
    isConnected,
    users,
    queue,
    currentIndex,
    broadcast,
    sendTo,
    addUser,
    removeUser,
    updateQueue,
  };
};