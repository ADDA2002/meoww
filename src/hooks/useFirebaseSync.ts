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
  onSessionEnded?: () => void;
  onKicked?: (targetName: string, reason?: string) => void;
  onBanned?: (targetName: string, reason?: string) => void;
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
  onSessionEnded,
  onKicked,
  onBanned,
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
    
    // Also update Firebase state for persistence and other clients to sync
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
      } else if (msg.type === "VETO_TOGGLE") {
        stateUpdates.vetoActive = msg.active;
      }
      
      if (Object.keys(stateUpdates).length > 0) {
        signalingRef.current?.updateState(stateUpdates);
      }
    }
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
    kickUser,
    banUser,
    getUsers,
    getState,
  };
}