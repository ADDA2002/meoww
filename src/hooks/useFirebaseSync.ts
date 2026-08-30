import { useState, useEffect, useRef, useCallback } from "react";
import FirebaseSignaling, { FirebaseSyncState } from "@/lib/firebaseSignaling";
import { Track, SyncMessage } from "@/types/music";

interface UseFirebaseSyncOptions {
  roomCode: string;
  myId: string;
  userName: string;
  isHost: boolean;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  onMessage: (msg: SyncMessage) => void;
  onStateChange: (state: FirebaseSyncState) => void;
  onSessionEnded?: () => void;
}

export function useFirebaseSync({
  roomCode,
  myId,
  userName,
  isHost,
  onMessage,
  onStateChange,
  onSessionEnded,
}: UseFirebaseSyncOptions) {
  const signalingRef = useRef<FirebaseSignaling | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!roomCode || !myId) return;

    const signaling = new FirebaseSignaling(roomCode, myId, userName, isHost);
    signalingRef.current = signaling;

    signaling.onMessage(onMessage);
    signaling.onStateChange(onStateChange);
    signaling.onConnectionChange(setIsConnected);

    if (onSessionEnded) {
      signaling.onSessionEnded(onSessionEnded);
    }

    signaling.connect();

    return () => {
      signaling.disconnect();
    };
  }, [roomCode, myId]);

  const broadcast = useCallback((msg: SyncMessage) => {
    signalingRef.current?.send(msg);
  }, []);

  const updatePlaybackState = useCallback((updates: Partial<FirebaseSyncState>) => {
    if (!isHost) return;
    signalingRef.current?.updateState(updates);
  }, [isHost]);

  const kickUser = useCallback((targetId: string, targetName: string, reason?: string) => {
    broadcast({ type: "KICK_USER", targetId, targetName, reason });
  }, [broadcast]);

  const banUser = useCallback((targetId: string, targetName: string, reason?: string) => {
    broadcast({ type: "BAN_USER", targetId, targetName, reason });
  }, [broadcast]);

  const getUsers = useCallback(async () => {
    return signalingRef.current?.getUsers() || [];
  }, []);

  const getState = useCallback(async () => {
    return signalingRef.current?.getState() || null;
  }, []);

  return {
    isConnected,
    broadcast,
    updatePlaybackState,
    kickUser,
    banUser,
    getUsers,
    getState,
  };
}