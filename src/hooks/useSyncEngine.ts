import { useState, useEffect, useRef, useCallback } from "react";
import { syncEngine, SyncEngineResult } from "@/lib/syncEngine";

export interface UseSyncEngineResult extends SyncEngineResult {
  displayTime: string;
  fullPrecisionTime: string;
  totalMs: number;
  formatTime: (seconds: number) => string;
}

export function useSyncEngine(): UseSyncEngineResult {
  const [state, setState] = useState<SyncEngineResult>({
    currentTime: 0,
    progress: 0,
    isPlaying: false,
  });

  const displayRef = useRef<{ display: string; full: string; ms: number }>({
    display: "0:00",
    full: "0:00.000μ000",
    ms: 0,
  });

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((result) => {
      setState(result);

      // Pre-compute display values
      displayRef.current = {
        display: syncEngine.getDisplayTime(),
        full: syncEngine.getFullPrecisionTime().formatted,
        ms: Math.floor(result.currentTime * 1000),
      };
    });

    return unsubscribe;
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  return {
    ...state,
    displayTime: displayRef.current.display,
    fullPrecisionTime: displayRef.current.full,
    totalMs: displayRef.current.ms,
    formatTime,
  };
}