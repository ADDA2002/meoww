import { SyncAnchor } from "@/types/music";
import { ClockSync } from "@/components/ClockSync";

/**
 * The shared playback clock.
 *
 * Every device runs its own instance. All devices compute the same elapsed
 * time for any given moment, because they all anchor to a host-captured
 * (perfNow, wallMs) pair and convert it to local perf.now() using the
 * calibrated offset.
 *
 * Display: microsecond-precise via performance.now(), formatted to
 * mm:ss.mmmµµµ. The displayed value is identical on every device.
 */
export class PlaybackClock {
  private clock: ClockSync;
  private anchor: SyncAnchor | null = null;
  private pausedPerfNow: number | null = null;
  private isPaused: boolean = false;
  private trackIndex: number = 0;

  constructor(clock: ClockSync) {
    this.clock = clock;
  }

  /**
   * Host-side: capture a fresh anchor at the exact moment playback starts.
   * Call this immediately before audio.play() and store the result for
   * broadcast.
   */
  captureStartAnchor(trackIndex: number): SyncAnchor {
    const hostPerfNow = performance.now();
    const hostWallMs = Date.now();
    this.anchor = { hostPerfNow, hostWallMs, offsetMs: 0, rttMs: 0 };
    this.pausedPerfNow = null;
    this.isPaused = false;
    this.trackIndex = trackIndex;
    return this.anchor;
  }

  /**
   * Listener-side: ingest an anchor from the host and convert to local.
   * Also handles the case where this is a resume from pause.
   */
  ingestAnchor(anchor: SyncAnchor, trackIndex: number): void {
    this.anchor = { ...anchor };
    this.pausedPerfNow = null;
    this.isPaused = false;
    this.trackIndex = trackIndex;
  }

  /**
   * Mark the clock as paused. The captured perf.now() at pause becomes the
   * new (frozen) reference for resume.
   */
  markPaused(trackIndex: number, perfNowAtPause?: number, wallMsAtPause?: number): void {
    this.isPaused = true;
    this.trackIndex = trackIndex;
    if (perfNowAtPause !== undefined && wallMsAtPause !== undefined) {
      // Convert host pause instant to local perf.now() reference
      this.pausedPerfNow = this.clock.hostPerfToLocal(perfNowAtPause, wallMsAtPause);
    } else {
      // Local pause: use our own perf.now() directly
      this.pausedPerfNow = performance.now();
    }
  }

  /**
   * Resume from a pause using a fresh host anchor.
   */
  resume(anchor: SyncAnchor, trackIndex: number): void {
    this.anchor = { ...anchor };
    this.pausedPerfNow = null;
    this.isPaused = false;
    this.trackIndex = trackIndex;
  }

  /**
   * Seek: install a new anchor and rewind to time 0. The host broadcasts
   * a fresh anchor; listeners replace their current anchor with it.
   */
  seek(anchor: SyncAnchor, trackIndex: number): void {
    this.anchor = { ...anchor };
    this.pausedPerfNow = null;
    this.isPaused = false;
    this.trackIndex = trackIndex;
  }

  /**
   * Skip to a different track: install a new anchor at the new track's start.
   */
  changeTrack(trackIndex: number, anchor: SyncAnchor): void {
    this.anchor = { ...anchor };
    this.pausedPerfNow = null;
    this.isPaused = false;
    this.trackIndex = trackIndex;
  }

  /**
   * Returns elapsed playback time in seconds with sub-millisecond precision.
   * Every device returns the same number for the same wall-clock moment.
   */
  getElapsedSeconds(): number {
    if (!this.anchor) return 0;
    if (this.isPaused) {
      // While paused, time stays at the pause instant — display is frozen
      // uniformly across devices.
      if (this.pausedPerfNow === null) return 0;
      const localAnchorPerf = this.clock.anchorToLocalPerf(this.anchor);
      return Math.max(0, (this.pausedPerfNow - localAnchorPerf) / 1000);
    }
    return this.clock.elapsedSince(this.anchor);
  }

  isPausedNow(): boolean {
    return this.isPaused;
  }

  getTrackIndex(): number {
    return this.trackIndex;
  }

  hasAnchor(): boolean {
    return this.anchor !== null;
  }

  /**
   * Format the elapsed time with microsecond precision.
   * mm:ss.mmmµµµ
   */
  formatElapsed(): string {
    const secs = this.getElapsedSeconds();
    if (!isFinite(secs) || secs < 0) return "0:00.000000";
    const minutes = Math.floor(secs / 60);
    const wholeSecs = Math.floor(secs % 60);
    const fractional = secs - Math.floor(secs);
    const ms = Math.floor(fractional * 1000);
    const microRemainder = Math.floor((fractional * 1000 - ms) * 1000);
    return `${minutes}:${wholeSecs < 10 ? "0" : ""}${wholeSecs}.${ms < 100 ? "0" : ""}${ms < 10 ? "0" : ""}${ms}.${microRemainder < 100 ? "0" : ""}${microRemainder < 10 ? "0" : ""}${microRemainder}`;
  }
}