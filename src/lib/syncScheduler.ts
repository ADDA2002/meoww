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
}

type SchedulerListener = (tracks: ScheduledTrack[]) => void;

class SyncScheduler {
  private tracks: Map<string, ScheduledTrack> = new Map();
  private listeners: SchedulerListener[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private activeTrackId: string | null = null;

  constructor() {
    // Create a single shared audio element
    this.audioElement = new Audio();
    this.audioElement.preload = "auto";
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
      
      // Create a local URL for the blob (this is in-memory, not network)
      const blobUrl = URL.createObjectURL(blob);
      
      // Update track with blob URL and mark as buffered
      track.blobUrl = blobUrl;
      track.status = "buffered";
      this.notifyListeners();

      console.log(`[SyncScheduler] ✅ Buffered "${track.track.title}" (${(blob.size / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.error(`[SyncScheduler] ❌ Failed to fetch:`, err);
      track.status = "failed";
      track.error = err instanceof Error ? err.message : "Unknown error";
      this.notifyListeners();
    }
  }

  /**
   * Phase 4: Start the precision countdown.
   * Continuously checks the synced clock and triggers playback at the exact moment.
   */
  startCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    console.log(`[SyncScheduler] ⏱️ Starting precision countdown...`);

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
   * Check if any scheduled track should play RIGHT NOW.
   * Triggers playback at the exact synced millisecond.
   */
  private checkAndTrigger(): void {
    if (!this.audioElement || !syncedClock.isReady()) return;

    const syncedNow = syncedClock.now();

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.status === "playing" || track.status === "failed") continue;

      // Check if we've reached the target time AND the file is buffered
      if (syncedNow >= track.targetSyncedTime && track.blobUrl) {
        this.triggerPlayback(trackId, track);
      } else if (syncedNow >= track.targetSyncedTime && !track.blobUrl) {
        // Target time reached but not buffered yet - this is a sync failure
        console.warn(`[SyncScheduler] ⚠️ Target time reached but track not buffered yet`);
      }
    }
  }

  /**
   * The Drop: Execute playback at the precise synced millisecond.
   * Audio is already in memory, so this triggers instant execution.
   */
  private triggerPlayback(trackId: string, scheduled: ScheduledTrack): void {
    if (!this.audioElement || !scheduled.blobUrl) return;

    console.log(`[SyncScheduler] 🎵 THE DROP: Playing "${scheduled.track.title}" at synced time ${syncedClock.now()}`);

    // Set the source to the pre-fetched blob
    this.audioElement.src = scheduled.blobUrl;
    this.audioElement.currentTime = 0; // Start from beginning
    this.audioElement.volume = 1.0;

    // Play!
    this.audioElement.play().catch(err => {
      console.error(`[SyncScheduler] ❌ Playback failed:`, err);
      scheduled.status = "failed";
      scheduled.error = err.message;
      this.notifyListeners();
    });

    scheduled.status = "playing";
    this.activeTrackId = trackId;
    this.notifyListeners();
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
    return this.audioElement!;
  }

  /**
   * Get current active track.
   */
  getActiveTrack(): ScheduledTrack | null {
    if (!this.activeTrackId) return null;
    return this.tracks.get(this.activeTrackId) || null;
  }

  /**
   * Stop playback and clear all scheduled tracks.
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