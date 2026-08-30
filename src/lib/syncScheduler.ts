/**
 * Phase 2-4: The Precision Countdown & The Drop
 * 
 * Handles the lifecycle of a synchronized track:
 * - Phase 2: Receives "play at" target timestamp from server
 * - Phase 3: Pre-fetches audio file into memory (Blob) during buffer window
 * - Phase 4: Triggers playback at the exact synced millisecond
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
  // Track ID for ready-state matching
  trackId: string;
}

type SchedulerListener = (tracks: ScheduledTrack[]) => void;
type ReadyListener = (trackId: string) => void;

class SyncScheduler {
  private tracks: Map<string, ScheduledTrack> = new Map();
  private listeners: SchedulerListener[] = [];
  private readyListeners: ReadyListener[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private activeTrackId: string | null = null;
  // When true, the countdown will wait for both host and member to be ready
  private waitForSyncGate: boolean = false;
  // Track which trackId we're waiting for the gate on
  private gatingTrackId: string | null = null;

  constructor() {
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
  scheduleTrack(track: Track, targetSyncedTime: number, id?: string, trackId?: string): string {
    const scheduleId = id || `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const schedulableTrackId = trackId || `track-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const scheduled: ScheduledTrack = {
      track,
      targetSyncedTime,
      status: "pending",
      trackId: schedulableTrackId,
    };

    this.tracks.set(scheduleId, scheduled);
    this.notifyListeners();

    console.log(`[SyncScheduler] 📅 Scheduled "${track.title}" (trackId: ${schedulableTrackId}) for synced time ${targetSyncedTime} (in ${targetSyncedTime - syncedClock.now()}ms)`);

    this.prefetchTrack(scheduleId, track.url);

    return scheduleId;
  }

  /**
   * Phase 3: Pre-fetch the audio file into memory as a Blob.
   * This avoids network stutter during playback.
   */
  private async prefetchTrack(trackId: string, url: string): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) return;

    track.status = "fetching";
    this.notifyListeners();

    try {
      console.log(`[SyncScheduler] 📥 Fetching audio: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      console.log(`[SyncScheduler] ✅ Buffered "${track.track.title}" - ${blob.size} bytes, type: ${blob.type}`);
      
      track.blobUrl = blobUrl;
      track.status = "buffered";
      this.notifyListeners();

      // Notify any ready listeners for this track
      this.readyListeners.forEach(cb => cb(track.trackId));
    } catch (err) {
      console.error(`[SyncScheduler] ❌ Failed to fetch audio:`, err);
      track.status = "failed";
      track.error = err instanceof Error ? err.message : "Unknown error";
      this.notifyListeners();
    }
  }

  /**
   * Enable sync-gate mode. The countdown will not trigger playback
   * until `unlockCountdown()` is called (e.g., when both sides are ready).
   */
  enableSyncGate(trackId: string): void {
    this.waitForSyncGate = true;
    this.gatingTrackId = trackId;
    console.log(`[SyncScheduler] 🔒 Sync gate ENABLED for trackId: ${trackId}`);
  }

  /**
   * Manually unlock the countdown (call when both host and member are ready).
   */
  unlockCountdown(): void {
    if (!this.waitForSyncGate) {
      console.log(`[SyncScheduler] unlockCountdown called but gate is not enabled`);
      return;
    }
    console.log(`[SyncScheduler] 🔓 Sync gate UNLOCKED - countdown will proceed`);
    this.waitForSyncGate = false;
    this.gatingTrackId = null;
  }

  /**
   * Phase 4: Start the precision countdown.
   * Continuously checks the synced clock and triggers playback at the exact moment.
   */
  startCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    if (!syncedClock.isReady()) {
      console.log(`[SyncScheduler] ⏱️ Countdown started but clock NOT calibrated yet`);
    } else {
      console.log(`[SyncScheduler] ⏱️ Countdown started - synced now: ${syncedClock.now()}, syncGate: ${this.waitForSyncGate}`);
    }

    this.countdownInterval = setInterval(() => {
      this.checkAndTrigger();
    }, 10);
  }

  stopCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      console.log(`[SyncScheduler] ⏹️ Countdown stopped`);
    }
  }

  /**
   * Check if any scheduled track should play RIGHT NOW.
   * Triggers playback at the exact synced millisecond.
   */
  private checkAndTrigger(): void {
    if (!this.audioElement) {
      console.warn("[SyncScheduler] No audio element available");
      return;
    }

    if (!syncedClock.isReady()) {
      return;
    }

    const syncedNow = syncedClock.now();

    for (const [scheduleId, track] of this.tracks.entries()) {
      if (track.status === "playing" || track.status === "failed") continue;

      const timeUntilTarget = track.targetSyncedTime - syncedNow;
      
      if (timeUntilTarget > 0 && timeUntilTarget <= 5000 && timeUntilTarget % 1000 < 10) {
        console.log(`[SyncScheduler] ⏱️ Countdown: ${(timeUntilTarget / 1000).toFixed(1)}s until "${track.track.title}" plays (gate: ${this.waitForSyncGate})`);
      }

      if (syncedNow >= track.targetSyncedTime) {
        // If sync gate is enabled, don't trigger yet
        if (this.waitForSyncGate) {
          if (timeUntilTarget > -1000) { // Only log occasionally
            // Don't spam logs every 10ms
          }
          continue;
        }

        if (track.blobUrl) {
          console.log(`[SyncScheduler] 🎵 Target time reached! Triggering playback for "${track.track.title}"`);
          this.triggerPlayback(scheduleId, track);
        } else {
          console.warn(`[SyncScheduler] ⚠️ Target time reached but blobUrl is undefined! Status: ${track.status}`);
        }
      }
    }
  }

  /**
   * The Drop: Execute playback at the precise synced millisecond.
   * Audio is already in memory, so this triggers instant execution.
   */
  private triggerPlayback(scheduleId: string, scheduled: ScheduledTrack): void {
    if (!this.audioElement) {
      console.error("[SyncScheduler] ❌ No audio element in triggerPlayback!");
      return;
    }

    if (!scheduled.blobUrl) {
      console.error("[SyncScheduler] ❌ triggerPlayback called but blobUrl is undefined!");
      return;
    }

    console.log(`[SyncScheduler] 🎵 THE DROP: Playing "${scheduled.track.title}" at synced time ${syncedClock.now()}`);

    this.audioElement.src = scheduled.blobUrl;
    this.audioElement.currentTime = 0;
    this.audioElement.volume = 1.0;

    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log(`[SyncScheduler] ✅ Play started successfully for "${scheduled.track.title}"`);
        scheduled.status = "playing";
        this.activeTrackId = scheduleId;
        this.notifyListeners();
      }).catch(err => {
        console.error(`[SyncScheduler] ❌ Playback failed:`, err);
        scheduled.status = "failed";
        scheduled.error = err.message;
        this.notifyListeners();
      });
    } else {
      scheduled.status = "playing";
      this.activeTrackId = scheduleId;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to track status updates.
   */
  subscribe(callback: SchedulerListener): () => void {
    this.listeners.push(callback);
    callback(Array.from(this.tracks.values()));
    
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Subscribe to "track ready" events (when a track is fully buffered).
   * Useful for telling the host "I'm ready, you can start the countdown."
   */
  onTrackReady(callback: ReadyListener): () => void {
    this.readyListeners.push(callback);
    return () => {
      this.readyListeners = this.readyListeners.filter(cb => cb !== callback);
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

  getActiveTrack(): ScheduledTrack | null {
    if (!this.activeTrackId) return null;
    return this.tracks.get(this.activeTrackId) || null;
  }

  /**
   * Stop playback and clear all scheduled tracks.
   */
  clear(): void {
    this.stopCountdown();
    this.waitForSyncGate = false;
    this.gatingTrackId = null;
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
    }

    for (const track of this.tracks.values()) {
      if (track.blobUrl) {
        URL.revokeObjectURL(track.blobUrl);
      }
    }

    this.tracks.clear();
    this.activeTrackId = null;
    this.notifyListeners();
  }

  getAllTracks(): ScheduledTrack[] {
    return Array.from(this.tracks.values());
  }

  private notifyListeners(): void {
    const tracks = Array.from(this.tracks.values());
    this.listeners.forEach(cb => cb(tracks));
  }
}

export const syncScheduler = new SyncScheduler();