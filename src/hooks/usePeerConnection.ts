import { useEffect, useRef, useCallback, useState } from "react";
import Peer, { DataConnection } from "peerjs";
import type { RoomUser, SyncMessage } from "@/types/music";

interface UsePeerConnectionOptions {
  roomCode: string;
  isHost: boolean;
  userName: string;
  onMessage: (msg: SyncMessage, senderId: string) => void;
  onPeerConnect: (peerId: string) => void;
  onPeerDisconnect: (peerId: string) => void;
}

export function usePeerConnection({
  roomCode,
  isHost,
  userName,
  onMessage,
  onPeerConnect,
  onPeerDisconnect,
}: UsePeerConnectionOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [myId, setMyId] = useState<string>("");
  
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const isHostRef = useRef(isHost);
  const userNameRef = useRef(userName);

  // Keep refs in sync
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  // Generate unique peer ID
  const generatePeerId = useCallback(() => {
    if (isHost) {
      return `meoww-room-${roomCode.toLowerCase()}`;
    }
    return `meoww-user-${roomCode.toLowerCase()}-${Math.random().toString(36).substring(2, 7)}`;
  }, [roomCode, isHost]);

  // Initialize PeerJS
  useEffect(() => {
    if (!roomCode) return;

    const peerId = generatePeerId();
    setMyId(peerId);

    const peer = new Peer(peerId, { debug: 1 });
    peerRef.current = peer;

    peer.on("open", () => {
      setIsConnected(true);
    });

    peer.on("connection", (conn) => {
      handleIncomingConnection(conn);
    });

    peer.on("error", (err: any) => {
      console.warn("PeerJS error:", err.type, err.message);
    });

    return () => {
      peer.destroy();
    };
  }, [roomCode]);

  // Handle incoming connection (host only)
  const handleIncomingConnection = (conn: DataConnection) => {
    const currentUser: RoomUser = {
      id: myId,
      name: userNameRef.current,
      isHost: isHostRef.current,
      joinedAt: Date.now(),
    };

    conn.on("open", () => {
      connectionsRef.current.set(conn.peer, conn);
      conn.send({ type: "JOIN", user: currentUser });
      onPeerConnect(conn.peer);
    });

    conn.on("data", (data) => {
      onMessage(data as SyncMessage, conn.peer);
    });

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
      onPeerDisconnect(conn.peer);
    });
  };

  // Connect to host (listener only)
  const connectToHost = useCallback(() => {
    if (isHost || !peerRef.current) return;

    const hostPeerId = `meoww-room-${roomCode.toLowerCase()}`;
    const currentUser: RoomUser = {
      id: myId,
      name: userNameRef.current,
      isHost: false,
      joinedAt: Date.now(),
    };

    const conn = peerRef.current.connect(hostPeerId, { reliable: true });

    conn.on("open", () => {
      connectionsRef.current.set(conn.peer, conn);
      conn.send({ type: "JOIN", user: currentUser });
      onPeerConnect(conn.peer);
    });

    conn.on("data", (data) => {
      onMessage(data as SyncMessage, conn.peer);
    });

    conn.on("close", () => {
      connectionsRef.current.delete(conn.peer);
      onPeerDisconnect(conn.peer);
    });
  }, [isHost, roomCode, myId, onMessage, onPeerConnect, onPeerDisconnect]);

  // Broadcast to all connected peers
  const broadcast = useCallback((msg: SyncMessage) => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }, []);

  // Send to specific peer
  const sendTo = useCallback((peerId: string, msg: SyncMessage) => {
    const conn = connectionsRef.current.get(peerId);
    if (conn?.open) {
      conn.send(msg);
    }
  }, []);

  // Connect when listener joins
  useEffect(() => {
    if (!isHost && isConnected && myId) {
      connectToHost();
    }
  }, [isHost, isConnected, myId, connectToHost]);

  return {
    isConnected,
    myId,
    broadcast,
    sendTo,
  };
}