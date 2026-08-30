export interface SyncState {
  isPlaying: boolean;
  startTime: number;       // performance.now() at moment of play
  startUnixMs: number;     // Unix timestamp in ms at moment of play (for cross-device sync)
  seekOffset: number;      // Additional seek offset in seconds
  duration: number;        // Total song duration in seconds
  clockOffset: number;     // Listener's clock offset from host
}

export interface SyncEngineResult {
  currentTime: number;     // Current playback time in seconds (float)
  progress: number;        // 0-1 progress ratio
  isPlaying: boolean;
}

type SyncCallback = (result: SyncEngineResult) => void;

class SyncEngine {
  private state: SyncState = {
    isPlaying: false,
    startTime: 0,
    startUnixMs: 0,
    seekOffset: 0,
    duration: 0,
    clockOffset: 0,
  };

  private animationFrameId: number | null = null;
  private callbacks: Set<SyncCallback> = new Set();
  private lastReportedSecond: number = -1;

  // Register a callback to receive time updates at 60fps
  subscribe(callback: SyncCallback): () => void {
    this.callbacks.add(callback);
    if (this.callbacks.size === 1) {
      this.startLoop();
    }
    return () => {
      this.callbacks.delete(callback);
      if (this.callbacks.size === 0) {
        this.stopLoop();
      }
    };
  }

  private startLoop() {
    const tick = () => {
      this.notifyCallbacks();
      this.animationFrameId = requestAnimationFrame(tick);
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  private stopLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private notifyCallbacks() {
    if (!this.state.isPlaying) return;

    const result = this.getCurrentState();

    // Only call callbacks if there's a meaningful change (avoid spam)
    const currentSecond = Math.floor(result.currentTime);
    if (currentSecond !== this.lastReportedSecond) {
      this.lastReportedSecond = currentSecond;
    }

    this.callbacks.forEach((cb) => cb(result));
  }

  // Get current state without subscribing
  getCurrentState(): SyncEngineResult {
    if (!this.state.isPlaying) {
      return {
        currentTime: this.state.seekOffset,
        progress: this.state.duration > 0 ? this.state.seekOffset / this.state.duration : 0,
        isPlaying: false,
      };
    }

    const now = performance.now();
    const elapsedSinceStart = (now - this.state.startTime) / 1000;
    const currentTime = this.state.seekOffset + elapsedSinceStart;
    const progress = this.state.duration > 0 ? Math.min(currentTime / this.state.duration, 1) : 0;

    return {
      currentTime: Math.max(0, currentTime),
      progress: Math.max(0, Math.min(1, progress)),
      isPlaying: true,
    };
  }

  // Play - anchor to both performance.now() and Unix time for cross-device sync
  play(opts?: {
    unixTimestamp?: number;    // Unix ms from host (for listeners)
    clockOffset?: number;       // Listener's clock offset
    startPerfNow?: number;      // performance.now() at host when play was pressed
    seekOffset?: number;        // Starting position in seconds
    duration?: number;         // Total duration
  }) {
    const now = performance.now();

    this.state = {
      ...this.state,
      isPlaying: true,
      // Use Unix timestamp if provided (for listeners to anchor to host's clock)
      startUnixMs: opts?.unixTimestamp ?? Date.now(),
      // Use the provided perfNow if this is a sync message, otherwise now
      startTime: opts?.startPerfNow ?? now,
      seekOffset: opts?.seekOffset ?? this.state.seekOffset,
      duration: opts?.duration ?? this.state.duration,
      clockOffset: opts?.clockOffset ?? 0,
    };

    this.lastReportedSecond = -1;
    this.notifyCallbacks();
  }

  // Pause - record current position
  pause(currentTime: number) {
    this.state = {
      ...this.state,
      isPlaying: false,
      seekOffset: currentTime,
    };
    this.notifyCallbacks();
  }

  // Seek to a specific time
  seek(time: number) {
    const wasPlaying = this.state.isPlaying;
    this.state.seekOffset = Math.max(0, time);

    if (wasPlaying) {
      // If playing, reset the start time to now so currentTime = seekOffset + (now - startTime)
      this.state.startTime = performance.now();
    }

    this.notifyCallbacks();
  }

  // Update duration (when audio metadata loads)
  setDuration(duration: number) {
    this.state.duration = duration;
    this.notifyCallbacks();
  }

  // Update clock offset (from useClockSync)
  setClockOffset(offset: number) {
    this.state.clockOffset = offset;
  }

  // Build a SYNC message for broadcasting to listeners
  buildSyncMessage(currentTime: number): {
    startUnixMs: number;
    startPerfNow: number;
    seekTime: number;
    duration: number;
    timestamp: number;
  } {
    const now = performance.now();
    return {
      startUnixMs: Date.now(),
      startPerfNow: now,
      seekTime: currentTime,
      duration: this.state.duration,
      timestamp: Date.now(),
    };
  }

  // Calculate what the current time should be on a remote device
  calculateRemoteTime(localMessage: {
    startUnixMs: number;
    startPerfNow: number;
    seekTime: number;
    duration: number;
    timestamp: number;
  }, remoteClockOffset: number): number {
    const now = performance.now();
    const localTimeSincePlay = (now - localMessage.startPerfNow) / 1000;
    const latencyCompensation = (now - localMessage.timestamp) / 2000; // Half of round-trip estimate
    return localMessage.seekTime + localTimeSincePlay + latencyCompensation;
  }

  // Get high-precision display time (for showing mm:ss.mmm)
  getDisplayTime(): string {
    const state = this.getCurrentState();
    const totalMs = Math.floor(state.currentTime * 1000);
    const seconds = Math.floor(totalMs / 1000);
    const ms = Math.floor((totalMs % 1000) / 100); // Show centiseconds (0-99)
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  }

  // Get full precision time for debugging (mm:ss.mmmμμμ)
  getFullPrecisionTime(): {
    formatted: string;
    totalMs: number;
    seconds: number;
    ms: number;
    μs: number;
  } {
    const state = this.getCurrentState();
    const totalMs = state.currentTime * 1000;
    const totalμs = Math.floor(totalMs * 1000);

    const seconds = Math.floor(totalMs / 1000);
    const ms = Math.floor((totalMs % 1000));
    const μs = Math.floor((totalMs * 1000) % 1000);

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return {
      formatted: `${mins}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}${String.fromCharCode(181)}${μs.toString().padStart(3, "0")}`,
      totalMs,
      seconds,
      ms,
      μs,
    };
  }

  // Reset state
  reset() {
    this.state = {
      isPlaying: false,
      startTime: 0,
      startUnixMs: 0,
      seekOffset: 0,
      duration: 0,
      clockOffset: 0,
    };
    this.lastReportedSecond = -1;
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();