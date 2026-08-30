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
  onPeerDisconnect?: (peerId: string) => void;
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
  const isHostRef = useRef<boolean>(initialIsHost);
  const initialNameRef = useRef<string>(initialName);

  // Keep refs in sync
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

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

  // Add user locally and broadcast update to all peers
  const addUser = useCallback((user: RoomUser) => {
    setUsers((prev) => {
      if (prev.find((u) => u.id === user.id)) return prev;
      const updated = [...prev, user];
      usersRef.current = updated;
      // Broadcast to all existing connections
      broadcast({ type: "USER_LIST", users: updated });
      return updated;
    });
  }, [broadcast]);

  // Remove user locally and broadcast update
  const removeUser = useCallback((userId: string) => {
    setUsers((prev) => {
      const updated = prev.filter((u) => u.id !== userId);
      usersRef.current = updated;
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
      name: initialNameRef.current,
      isHost: initialIsHost,
      joinedAt: Date.now(),
    };

    const peer = new Peer(peerId, { debug: 1 });
    peerRef.current = peer;

    peer.on("open", () => {
      console.log("Peer opened:", peerId);
      setIsConnected(true);

      // Add myself to the users list
      setUsers([me]);
      usersRef.current = [me];

      if (!initialIsHost) {
        // I'm a listener - connect to host
        const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
        console.log("Connecting to host:", hostPeerId);
        
        const conn = peer.connect(hostPeerId, { reliable: true });

        const timeout = setTimeout(() => {
          toast.error("Could not connect to host. Make sure the host is in the room.");
        }, 5000);

        conn.on("open", () => {
          console.log("Connected to host!");
          clearTimeout(timeout);
          connectionsRef.current.set(hostPeerId, conn);
          // Send JOIN message to host
          conn.send({ type: "JOIN", user: me });
        });

        conn.on("data", (data: any) => {
          console.log("Received from host:", data.type);
          handleIncomingMessage(data as SyncMessage);
        });

        conn.on("close", () => {
          console.log("Disconnected from host");
          connectionsRef.current.delete(hostPeerId);
          options.onPeerDisconnect?.(hostPeerId);
        });

        conn.on("error", (err: any) => {
          clearTimeout(timeout);
          console.error("Connection error:", err);
          toast.error("Connection lost to host.");
        });
      }
    });

    // Host handles incoming connections
    peer.on("connection", (conn) => {
      console.log("Host: incoming connection from", conn.peer);
      const timeout = setTimeout(() => {
        console.log("Connection timed out:", conn.peer);
        conn.close();
      }, 10000);

      conn.on("open", () => {
        console.log("Host: connection opened with", conn.peer);
        clearTimeout(timeout);
        connectionsRef.current.set(conn.peer, conn);
      });

      conn.on("data", (data: any) => {
        clearTimeout(timeout);
        console.log("Host received:", data.type, "from", conn.peer);
        handleIncomingMessage(data as SyncMessage, conn);
      });

      conn.on("close", () => {
        console.log("Host: connection closed", conn.peer);
        connectionsRef.current.delete(conn.peer);
        const disconnectedUser = usersRef.current.find((u) => u.id === conn.peer);
        if (disconnectedUser) {
          removeUser(conn.peer);
          options.onPeerDisconnect?.(conn.peer);
        }
      });
    });

    peer.on("error", (err: any) => {
      console.error("PeerJS error:", err);
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
            
            console.log("Host: added user", newUser.name, "total users:", usersRef.current.length);
            
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
            console.log("Listener: received user list with", msg.users.length, "users");
            setUsers(msg.users);
            usersRef.current = msg.users;
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
        default:
          break;
      }
    }
  }, [roomCode]);

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