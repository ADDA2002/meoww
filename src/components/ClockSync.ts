/**
 * Clock synchronization system for Meoww rooms.
 * 
 * Uses NTP-style round-trip measurement to compute clock offsets
 * between the host and every listener, so all devices can compute
 * identical playback times from a single absolute anchor.
 *
 * The math:
 *   t1 = host's clock when request was sent
 *   t2 = listener's clock when request was received  (echoed back)
 *   t3 = listener's clock when response was sent     (echoed back)
 *   t4 = host's clock when response was received
 *
 *   offset = ((t2 - t1) + (t3 - t4)) / 2
 *   rtt    =  (t4 - t1) - (t3 - t2)
 *
 * `offset` is how far the listener's clock is ahead of the host's clock.
 * To convert a host-anchor timestamp to listener-local time:
 *   listenerLocal = hostAnchor + offset
 *
 * All work is done with `performance.now()` for sub-millisecond precision.
 */

export interface PingMessage {
  type: "PING_REQUEST";
  pingId: number;
  hostT1: number;
}

export interface PongMessage {
  type: "PING_RESPONSE";
  pingId: number;
  hostT1: number;
  listenerT2: number;
  listenerT3: number;
  hostT4?: number;
}

export interface SyncAnchor {
  /**
   * Host's performance.now() value at the moment playback was started.
   * Listeners need this in conjunction with the host's per-frame
   * performance.now() to compute elapsed time.
   */
  hostPerfNow: number;
  /**
   * Host's wall-clock time (Date.now() ms) at the moment playback was started.
   * This is the universal reference every listener converts to local time
   * using the calibrated clock offset.
   */
  hostWallMs: number;
  /**
   * Listener's own wall-clock time at the moment of arrival.
   * Used as a fallback if no clock offset is yet known.
   */
  listenerWallMs?: number;
  /**
   * The computed clock offset to apply: (listenerClock - hostClock) in ms.
   * Positive => listener clock is ahead of host clock.
   */
  offsetMs: number;
  /**
   * RTT measured at anchor time, in ms.
   */
  rttMs: number;
}

const PING_HISTORY_LIMIT = 8;

export class ClockSync {
  private hostPerfNow = 0;
  private offsetMs = 0;
  private rttMs = 0;
  private sampleCount = 0;
  private offsetSamples: number[] = [];
  private rttSamples: number[] = [];
  private lastSyncTime = 0;

  /**
   * Returns the calibrated offset between this device's clock and the host's clock.
   * Positive => local clock is ahead of host clock.
   */
  getOffsetMs(): number {
    return this.offsetMs;
  }

  getRttMs(): number {
    return this.rttMs;
  }

  getSampleCount(): number {
    return this.sampleCount;
  }

  /**
   * Reset all calibration (e.g. when the host changes).
   */
  reset(): void {
    this.offsetMs = 0;
    this.rttMs = 0;
    this.sampleCount = 0;
    this.offsetSamples = [];
    this.rttSamples = [];
    this.lastSyncTime = 0;
  }

  /**
   * Used by listeners to ingest a ping response and refine the offset.
   */
  ingestPong(pong: PongMessage, hostT4: number): void {
    const t1 = pong.hostT1;
    const t2 = pong.listenerT2;
    const t3 = pong.listenerT3;
    const t4 = hostT4;

    const rtt = (t4 - t1) - (t3 - t2);
    // Sanity: ignore impossible values
    if (rtt < 0 || rtt > 5000) return;
    // offset: positive means listener's clock is ahead of host's clock
    const offset = ((t2 - t1) + (t3 - t4)) / 2;

    this.offsetSamples.push(offset);
    this.rttSamples.push(rtt);
    if (this.offsetSamples.length > PING_HISTORY_LIMIT) {
      this.offsetSamples.shift();
      this.rttSamples.shift();
    }

    // Use the minimum RTT sample as the most accurate — pairs with its offset
    let bestIdx = 0;
    for (let i = 1; i < this.rttSamples.length; i++) {
      if (this.rttSamples[i] < this.rttSamples[bestIdx]) bestIdx = i;
    }
    this.offsetMs = this.offsetSamples[bestIdx];
    this.rttMs = this.rttSamples[bestIdx];
    this.sampleCount = this.offsetSamples.length;
    this.lastSyncTime = Date.now();
  }

  /**
   * Used by host to build a ping request at host T1.
   */
  buildPing(pingId: number, hostPerfT1: number): PingMessage {
    return {
      type: "PING_REQUEST",
      pingId,
      hostT1: hostPerfT1,
    };
  }

  /**
   * Used by listener to build a ping response.
   * t2 = local perf.now() at receipt, t3 = local perf.now() at send.
   * Returning them as separate values lets the host compute both directions.
   */
  buildPong(ping: PingMessage): PongMessage {
    const t3 = performance.now();
    return {
      type: "PING_RESPONSE",
      pingId: ping.pingId,
      hostT1: ping.hostT1,
      listenerT2: ping.listenerT2 ?? t3,
      listenerT3: t3,
    };
  }

  /**
   * Convert a host-side wall-clock anchor to the local wall-clock time.
   */
  hostWallToLocal(hostWallMs: number): number {
    return hostWallMs + this.offsetMs;
  }

  /**
   * Convert a host-side performance.now() anchor to the local perf.now() time.
   * Note: performance.now() is local to each device, so this conversion uses
   * the wall-clock offset. Caller must be sure hostPerfNow and hostWallMs were
   * captured at the same instant on the host.
   */
  hostPerfToLocal(hostPerfNow: number, hostWallMs: number): number {
    // hostPerfNow is host's perf.now() at the moment hostWallMs was captured.
    // Local time = local perf.now() at the moment that, in local wall-clock,
    // corresponds to hostWallMs. That moment is (hostWallMs + offsetMs).
    // We compute local perf.now() at that moment by adjusting the local
    // perf.now() by the difference between current wall-clock and that moment.
    const targetLocalWallMs = hostWallMs + this.offsetMs;
    const nowLocalWallMs = Date.now();
    const wallDelta = targetLocalWallMs - nowLocalWallMs;
    return performance.now() + wallDelta;
  }

  /**
   * Build a sync anchor for a new playback. Host-side: pass hostPerfNow and
   * hostWallMs captured at the same instant. Listener-side: pass the
   * message's host anchor plus the calibrated offset.
   */
  buildAnchor(hostPerfNow: number, hostWallMs: number): SyncAnchor {
    return {
      hostPerfNow,
      hostWallMs,
      offsetMs: this.offsetMs,
      rttMs: this.rttMs,
    };
  }

  /**
   * Listener: take a host-side anchor and translate to local perf.now() reference.
   * Returns the local perf.now() value at the anchor moment.
   */
  anchorToLocalPerf(anchor: SyncAnchor): number {
    return this.hostPerfToLocal(anchor.hostPerfNow, anchor.hostWallMs);
  }

  /**
   * Elapsed time (seconds) since the anchor, computed locally using perf.now().
   * This is the number every device will show for the same moment.
   */
  elapsedSince(anchor: SyncAnchor): number {
    const localPerfAtAnchor = this.anchorToLocalPerf(anchor);
    const localPerfNow = performance.now();
    return Math.max(0, (localPerfNow - localPerfAtAnchor) / 1000);
  }

  /**
   * Whether enough samples have been collected for confident sync.
   */
  isCalibrated(): boolean {
    return this.sampleCount >= 3;
  }

  /**
   * Time (ms) since the last successful pong was received.
   */
  msSinceLastSync(): number {
    return Date.now() - this.lastSyncTime;
  }
}