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

  // Only connect when both roomCode and myId are set
  useEffect(() => {
    if (!roomCode || !myId) return;

    // Clean up any existing connection before creating a new one
    if (signalingRef.current) {
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }

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
      signalingRef.current = null;
    };
  }, [roomCode, myId]);

  const broadcast = useCallback((msg: SyncMessage) => {
    signalingRef.current?.send(msg);
  }, []);

  const updatePlaybackState = useCallback((updates: Partial<FirebaseSyncState>) => {
    if (!isHost) return;
    signalingRef.current?.updateState(updates);
  }, [isHost]);

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
    getUsers,
    getState,
  };
}