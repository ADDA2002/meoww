/**
 * Phase 2-4: The Precision Countdown & The Drop
 * 
 * Handles the lifecycle of a synchronized track:
 * - Phase 2: Receives "play at" target timestamp from server
 * - Phase 3: Pre-fetches audio file progressively (starts playback when buffered)
 * - Phase 4: Triggers playback at the exact synced millisecond
 * 
 * OPTIMIZATION: Progressive loading - doesn't wait for full download,
 * starts playback once enough data is buffered (~1 second before target time)
 */

import { syncedClock } from "./syncedClock";
import { Track } from "@/types/music";

export interface ScheduledTrack {
  track: Track;
  // The "global target time" (synced clock ms) when playback should START
  targetSyncedTime: number;
  // The audio URL (can be blob URL or original URL for progressive loading)
  audioUrl: string;
  // Status of this scheduled track
  status: "pending" | "fetching" | "buffering" | "playing" | "failed";
  // Error message if failed
  error?: string;
  // Whether this is using blob (true) or progressive loading (false)
  isBlob: boolean;
}

type SchedulerListener = (tracks: ScheduledTrack[]) => void;

class SyncScheduler {
  private tracks: Map<string, ScheduledTrack> = new Map();
  private listeners: SchedulerListener[] = [];
  private audioElement: HTMLAudioElement | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private activeTrackId: string | null = null;
  // Buffer window: how many ms before target time to start buffering
  private bufferWindow: number = 1500; // Start buffering 1.5s before target

  constructor() {
    // Create a single shared audio element
    if (typeof window !== "undefined") {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      this.audioElement.crossOrigin = "anonymous";
      console.log("[SyncScheduler] Audio element created (optimized)");
    }
  }

  /**
   * Phase 2: Schedule a track to play at a specific synced time.
   * Uses progressive loading - starts buffering early and plays when ready.
   */
  scheduleTrack(track: Track, targetSyncedTime: number, id?: string): string {
    const trackId = id || `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const scheduled: ScheduledTrack = {
      track,
      targetSyncedTime,
      audioUrl: track.url,
      status: "pending",
      isBlob: false,
    };

    this.tracks.set(trackId, scheduled);
    this.notifyListeners();

    const timeUntilTarget = targetSyncedTime - syncedClock.now();
    console.log(`[SyncScheduler] 📅 Scheduled "${track.title}" for synced time ${targetSyncedTime} (in ${timeUntilTarget}ms)`);

    // Start pre-fetching immediately
    this.prefetchTrack(trackId, track.url);

    return trackId;
  }

  /**
   * Progressive pre-fetch: Also start loading directly into the audio element
   * so it's ready to play as soon as enough is buffered
   */
  private prefetchTrack(trackId: string, url: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    track.status = "fetching";
    this.notifyListeners();

    // Also preload into the audio element directly for faster start
    // This allows the browser to buffer the stream progressively
    if (this.audioElement && !track.isBlob) {
      console.log(`[SyncScheduler] 📥 Preloading audio directly: ${url}`);
      this.audioElement.src = url;
      this.audioElement.load();
      
      // Start countdown immediately - it will wait until the right moment
      if (!this.countdownInterval) {
        this.startCountdown();
      }
    }

    // Also do blob fetch for backup (in case network is slow)
    this.fetchAsBlob(trackId, url);
  }

  /**
   * Fetch as blob for backup - this ensures we have a local copy
   * but we don't wait for it to complete before playing
   */
  private async fetchAsBlob(trackId: string, url: string): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track) return;

    try {
      console.log(`[SyncScheduler] 📥 Backup blob fetch: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      console.log(`[SyncScheduler] ✅ Blob ready: ${blob.size} bytes`);
      
      // If we don't have a blob yet, use this one
      if (track && !track.isBlob) {
        track.audioUrl = blobUrl;
        track.isBlob = true;
        track.status = "buffering";
        this.notifyListeners();
      } else if (track) {
        // Revoke if we already have a blob (avoid memory leak)
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      console.warn(`[SyncScheduler] ⚠️ Blob fetch failed (using stream):`, err);
      // Don't fail - we can still use the direct stream
    }
  }

  /**
   * Phase 4: Start the precision countdown.
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

    // Check every 5ms for sub-frame precision (optimized from 10ms)
    this.countdownInterval = setInterval(() => {
      this.checkAndTrigger();
    }, 5);
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

    for (const [trackId, track] of this.tracks.entries()) {
      if (track.status === "playing" || track.status === "failed") continue;

      const timeUntilTarget = track.targetSyncedTime - syncedNow;
      
      // Log countdown every 500ms when close
      if (timeUntilTarget > 0 && timeUntilTarget <= 2000 && timeUntilTarget % 500 < 5) {
        console.log(`[SyncScheduler] ⏱️ ${timeUntilTarget}ms until "${track.track.title}" plays`);
      }

      // Start buffering early (1.5s before target)
      if (timeUntilTarget > 0 && timeUntilTarget <= this.bufferWindow && track.status === "fetching") {
        console.log(`[SyncScheduler] 📥 Buffering "${track.track.title}" (${timeUntilTarget}ms before target)`);
        track.status = "buffering";
        this.notifyListeners();
        
        // Ensure audio element has the source
        if (this.audioElement.src !== track.audioUrl && track.isBlob) {
          this.audioElement.src = track.audioUrl;
        }
      }

      // Check if we've reached the target time
      if (syncedNow >= track.targetSyncedTime) {
        console.log(`[SyncScheduler] 🎵 Target time reached! Triggering "${track.track.title}"`);
        this.triggerPlayback(trackId, track);
      }
    }
  }

  /**
   * Execute playback at the precise synced millisecond.
   */
  private triggerPlayback(trackId: string, scheduled: ScheduledTrack): void {
    if (!this.audioElement) {
      console.error("[SyncScheduler] ❌ No audio element!");
      return;
    }

    console.log(`[SyncScheduler] 🎵 THE DROP: Playing "${scheduled.track.title}" at synced time ${syncedClock.now()}`);
    console.log(`[SyncScheduler] 🎵 Using: ${scheduled.isBlob ? "blob" : "stream"} - ${scheduled.audioUrl.substring(0, 50)}...`);

    // Set source to blob if available, otherwise use stream
    this.audioElement.src = scheduled.audioUrl;
    this.audioElement.currentTime = 0;
    this.audioElement.volume = 1.0;

    // Try to play!
    const playPromise = this.audioElement.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log(`[SyncScheduler] ✅ Play started successfully`);
        scheduled.status = "playing";
        this.activeTrackId = trackId;
        this.notifyListeners();
      }).catch(err => {
        console.error(`[SyncScheduler] ❌ Playback failed:`, err);
        // Try again in a moment
        setTimeout(() => {
          if (this.audioElement && scheduled.status !== "playing") {
            console.log(`[SyncScheduler] 🔄 Retrying playback...`);
            this.audioElement.play().catch(console.error);
          }
        }, 50);
      });
    } else {
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
    callback(Array.from(this.tracks.values()));
    
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Get the audio element.
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
   * Stop playback and clear all scheduled tracks.
   */
  clear(): void {
    this.stopCountdown();
    
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = "";
    }

    for (const track of this.tracks.values()) {
      if (track.isBlob) {
        URL.revokeObjectURL(track.audioUrl);
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