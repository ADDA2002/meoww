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
  onStateChange?: (state: FirebaseSyncState) => void;
}

export function useFirebaseSync({
  roomCode,
  myId,
  userName,
  isHost,
  queue,
  currentIndex,
  isPlaying,
  onMessage,
  onStateChange,
}: UseFirebaseSyncOptions) {
  const signalingRef = useRef<FirebaseSignaling | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  const isPlayingRef = useRef(isPlaying);

  queueRef.current = queue;
  currentIndexRef.current = currentIndex;
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!roomCode || !myId) return;

    const signaling = new FirebaseSignaling(roomCode, myId, userName, isHost);
    signalingRef.current = signaling;

    signaling.onMessage(onMessage);
    signaling.onConnectionChange(setIsConnected);

    // Subscribe to state changes for syncing when member joins
    if (onStateChange) {
      signaling.onStateChange(onStateChange);
    }

    signaling.connect();

    return () => {
      signaling.disconnect();
    };
  }, [roomCode, myId]);

  const broadcast = useCallback((msg: SyncMessage) => {
    signalingRef.current?.send(msg);
    
    if (isHost) {
      const stateUpdates: Partial<FirebaseSyncState> = {};
      
      if (msg.type === "PLAY") {
        stateUpdates.isPlaying = true;
        stateUpdates.currentTrackIndex = msg.trackIndex;
        stateUpdates.currentTime = msg.seekTime;
        stateUpdates.timestamp = msg.timestamp;
        stateUpdates.queue = queueRef.current;
      } else if (msg.type === "PAUSE") {
        stateUpdates.isPlaying = false;
        stateUpdates.currentTime = msg.seekTime;
      } else if (msg.type === "SEEK") {
        stateUpdates.currentTime = msg.seekTime;
        stateUpdates.timestamp = msg.timestamp;
      } else if (msg.type === "UPDATE_QUEUE") {
        stateUpdates.queue = msg.queue;
        stateUpdates.currentTrackIndex = msg.activeIndex;
      }
      
      if (Object.keys(stateUpdates).length > 0) {
        signalingRef.current?.updateState(stateUpdates);
      }
    }
  }, [isHost]);

  const getUsers = useCallback(async () => {
    return signalingRef.current?.getUsers() || [];
  }, []);

  return {
    isConnected,
    broadcast,
    getUsers,
  };
}