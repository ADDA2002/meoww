/**
 * Phase 2-4: The Precision Countdown & The Drop
 * 
 * Handles the lifecycle of a synchronized track:
 * - Phase 2: Receives "play at" target timestamp from server
 * - Phase 3: Pre-fetches audio file into memory (Blob) during buffer window
 * - Phase 4: Triggers playback at the exact synced millisecond
 * - NEW: Synced pause - triggers pause at the exact synced millisecond
 * 
 * Key insight: We wait for audio to be FULLY BUFFERED before the target time,
 * then trigger .play() at the precise synced moment for zero-delay playback.
 */

import { syncedClock } from "./syncedClock";
import { Track } from "@/types/music";

export interface ScheduledTrack {
  track: Track;
  // The "global target time" (synced clock ms) when playback should START
  targetSyncedTime: number;
  // The local Blob URL once the file is fully fetched
  blobUrl?: string;
  // Status of this scheduled track
  status: "pending" | "fetching" | "buffered" | "playing" | "failed";
  // Error message if failed
  error?: string;
}

export interface ScheduledPause {
  // The "global target time" (synced clock ms) when playback should PAUSE
  targetSyncedTime: number;
  // The position in the track to pause at (in seconds)
  pauseAtTime: number;
  // Status
  status: "pending" | "executed" | "failed";
}

type SchedulerListener = (tracks: ScheduledTrack[]) => void;

class SyncScheduler {
  private tracks: Map<string, ScheduledTrack> = new Map();
  private pendingPauses: ScheduledPause[] = [];
  private listeners: SchedulerListener[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private activeTrackId: string | null = null;

  constructor() {
    // Create a single shared audio element
    if (typeof window !== "undefined") {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      console.log("[SyncScheduler] Audio element created");
    }
  }

  /**
   * Phase 2: Schedule a track to play at a specific synced time.
   * The targetSyncedTime is in milliseconds (Synced Master Time).
   */
  scheduleTrack(track: Track, targetSyncedTime: number, id?: string): string {
    const trackId = id || `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const scheduled: ScheduledTrack = {
      track,
      targetSyncedTime,
      status: "pending",
    };

    this.tracks.set(trackId, scheduled);
    this.notifyListeners();

    console.log(`[SyncScheduler] 📅 Scheduled "${track.title}" for synced time ${targetSyncedTime} (in ${targetSyncedTime - syncedClock.now()}ms)`);

    // Phase 3: Start pre-fetching the audio file
    this.prefetchTrack(trackId, track.url);

    return trackId;
  }

  /**
   * Schedule a pause to occur at a specific synced time.
   * The pause will be triggered at the exact synced millisecond.
   */
  schedulePause(pauseAtTime: number, targetSyncedTime: number): void {
    console.log(`[SyncScheduler] ⏸️ Pause scheduled at synced time ${targetSyncedTime} (in ${targetSyncedTime - syncedClock.now()}ms), at position ${pauseAtTime}s`);
    
    this.pendingPauses.push({
      targetSyncedTime,
      pauseAtTime,
      status: "pending",
    });
  }

  /**
   * Phase 3: Pre-fetch the audio file into memory as a Blob.
   * This avoids network stutter during playback.
   */
  private async prefetchTrack(trackId: string, url: string): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) return;

    // Update status to fetching
    track.status = "fetching";
    this.notifyListeners();

    try {
      console.log(`[SyncScheduler] 📥 Fetching audio: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get the entire file as a Blob
      const blob = await response.blob();
      
      console.log(`[SyncScheduler] 📥 Blob created, size: ${blob.size} bytes, type: ${blob.type}`);
      
      // Create a local URL for the blob (this is in-memory, not network)
      const blobUrl = URL.createObjectURL(blob);
      
      console.log(`[SyncScheduler] ✅ Buffered "${track.track.title}" - Blob URL: ${blobUrl.substring(0, 50)}...`);
      
      // Update track with blob URL and mark as buffered
      track.blobUrl = blobUrl;
      track.status = "buffered";
      this.notifyListeners();
    } catch (err) {
      console.error(`[SyncScheduler] ❌ Failed to fetch audio:`, err);
      track.status = "failed";
      track.error = err instanceof Error ? err.message : "Unknown error";
      this.notifyListeners();
    }
  }

  /**
   * Phase 4: Start the precision countdown.
   * Continuously checks the synced clock and triggers playback/pause at the exact moment.
   */
  startCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    if (!syncedClock.isReady()) {
      console.log(`[SyncScheduler] ⏱️ Countdown started but clock NOT calibrated yet`);
    } else {
      console.log(`[SyncScheduler] ⏱️ Countdown started - synced now: ${syncedClock.now()}`);
    }

    // Check every 10ms for sub-frame precision
    this.countdownInterval = setInterval(() => {
      this.checkAndTrigger();
    }, 10);
  }

  /**
   * Stop the precision countdown.
   */
  stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      console.log(`[SyncScheduler] ⏹️ Countdown stopped`);
    }
  }

  /**
   * Check if any scheduled track should play or any scheduled pause should fire RIGHT NOW.
   * Triggers playback/pause at the exact synced millisecond.
   */
  private checkAndTrigger(): void {
    if (!this.audioElement) {
      console.warn("[SyncScheduler] No audio element available");
      return;
    }

    if (!syncedClock.isReady()) {
      return; // Clock not ready, skip this check
    }

    const syncedNow = syncedClock.now();

    // Check for scheduled pauses first
    for (let i = this.pendingPauses.length - 1; i >= 0; i--) {
      const pause = this.pendingPauses[i];
      if (pause.status === "executed" || pause.status === "failed") continue;

      if (syncedNow >= pause.targetSyncedTime) {
        console.log(`[SyncScheduler] ⏸️ Pause target time reached! Executing pause at position ${pause.pauseAtTime}s`);
        this.executePause(pause);
        this.pendingPauses.splice(i, 1);
      }
    }

    // Check for scheduled plays
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.status === "playing" || track.status === "failed") continue;

      const timeUntilTarget = track.targetSyncedTime - syncedNow;
      
      // Log countdown every second
      if (timeUntilTarget > 0 && timeUntilTarget <= 5000 && timeUntilTarget % 1000 < 10) {
        console.log(`[SyncScheduler] ⏱️ Countdown: ${(timeUntilTarget / 1000).toFixed(1)}s until "${track.track.title}" plays`);
      }

      // Check if we've reached the target time
      if (syncedNow >= track.targetSyncedTime) {
        if (track.blobUrl) {
          console.log(`[SyncScheduler] 🎵 Target time reached! blobUrl exists. Calling triggerPlayback for "${track.track.title}"`);
          this.triggerPlayback(trackId, track);
        } else {
          console.warn(`[SyncScheduler] ⚠️ Target time reached but blobUrl is undefined! Status: ${track.status}`);
        }
      }
    }
  }

  /**
   * Execute a scheduled pause at the exact synced millisecond.
   * Seeks to the position first, then pauses.
   */
  private executePause(pause: ScheduledPause): void {
    if (!this.audioElement) {
      console.error("[SyncScheduler] ❌ No audio element for pause!");
      pause.status = "failed";
      return;
    }

    try {
      // Seek to the exact position (to be in sync with host)
      this.audioElement.currentTime = pause.pauseAtTime;
      // Pause immediately
      this.audioElement.pause();
      pause.status = "executed";
      console.log(`[SyncScheduler] ⏸️ Pause executed at position ${pause.pauseAtTime}s`);
    } catch (err) {
      console.error(`[SyncScheduler] ❌ Pause failed:`, err);
      pause.status = "failed";
    }
  }

  /**
   * The Drop: Execute playback at the precise synced millisecond.
   * Audio is already in memory, so this triggers instant execution.
   */
  private triggerPlayback(trackId: string, scheduled: ScheduledTrack): void {
    if (!this.audioElement) {
      console.error("[SyncScheduler] ❌ No audio element in triggerPlayback!");
      return;
    }

    if (!scheduled.blobUrl) {
      console.error("[SyncScheduler] ❌ triggerPlayback called but blobUrl is undefined!");
      return;
    }

    console.log(`[SyncScheduler] 🎵 THE DROP: Playing "${scheduled.track.title}" at synced time ${syncedClock.now()}`);
    console.log(`[SyncScheduler] 🎵 Blob URL: ${scheduled.blobUrl.substring(0, 50)}...`);

    // Set the source to the pre-fetched blob
    this.audioElement.src = scheduled.blobUrl;
    this.audioElement.currentTime = 0; // Start from beginning
    this.audioElement.volume = 1.0;

    // Play!
    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log(`[SyncScheduler] ✅ Play started successfully for "${scheduled.track.title}"`);
        scheduled.status = "playing";
        this.activeTrackId = trackId;
        this.notifyListeners();
      }).catch(err => {
        console.error(`[SyncScheduler] ❌ Playback failed:`, err);
        scheduled.status = "failed";
        scheduled.error = err.message;
        this.notifyListeners();
      });
    } else {
      // Older browser that doesn't return a promise
      scheduled.status = "playing";
      this.activeTrackId = trackId;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to track status updates.
   */
  subscribe(callback: SchedulerListener): () => void {
    this.listeners.push(callback);
    // Immediately notify with current state
    callback(Array.from(this.tracks.values()));
    
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Get the audio element (for UI controls to attach to).
   */
  getAudioElement(): HTMLAudioElement {
    if (!this.audioElement) {
      console.warn("[SyncScheduler] Audio element was null, creating new one");
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
    }
    return this.audioElement;
  }

  /**
   * Get current active track.
   */
  getActiveTrack(): ScheduledTrack | null {
    if (!this.activeTrackId) return null;
    return this.tracks.get(this.activeTrackId) || null;
  }

  /**
   * Stop playback and clear all scheduled tracks and pauses.
   */
  clear(): void {
    this.stopCountdown();
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
    }

    // Revoke all blob URLs to free memory
    for (const track of this.tracks.values()) {
      if (track.blobUrl) {
        URL.revokeObjectURL(track.blobUrl);
      }
    }

    this.tracks.clear();
    this.pendingPauses = [];
    this.activeTrackId = null;
    this.notifyListeners();
  }

  /**
   * Get all current scheduled tracks.
   */
  getAllTracks(): ScheduledTrack[] {
    return Array.from(this.tracks.values());
  }

  private notifyListeners(): void {
    const tracks = Array.from(this.tracks.values());
    this.listeners.forEach(cb => cb(tracks));
  }
}

// Singleton instance
export const syncScheduler = new SyncScheduler();