/**
 * Phase 1: Server-Synced Clock
 * 
 * Eliminates clock skew between devices by:
 * 1. Measuring Round Trip Time (RTT) via ping-pong with Firebase server timestamp
 * 2. Calculating clock offset between local time and server time
 * 3. Exposing a "Synced Master Time" that any device can use
 * 
 * Formula: SyncedTime = LocalTime + Offset
 */

import { db, ref, set, onValue, serverTimestamp, remove } from "./firebase";

interface PingResult {
  rtt: number;          // Round trip time in ms
  serverTime: number;   // Server's timestamp at midpoint
  localTime: number;    // Our local time at midpoint
  offset: number;       // serverTime - localTime
}

class SyncedClock {
  private offset: number = 0;
  private rtt: number = 0;
  private isCalibrated: boolean = false;
  private calibrationListeners: ((calibrated: boolean) => void)[] = [];

  /**
   * Performs a single ping to measure RTT and clock offset.
   * Uses Firebase server timestamp as the reference clock.
   */
  async ping(): Promise<PingResult> {
    if (!db) {
      // Fallback: assume no offset if Firebase unavailable
      console.warn("[SyncedClock] Firebase unavailable, using local time");
      return {
        rtt: 0,
        serverTime: Date.now(),
        localTime: Date.now(),
        offset: 0,
      };
    }

    const t1 = Date.now(); // Local time before send

    // Write our local time + request a server timestamp
    const pingRef = ref(db, `_ping/${Date.now()}-${Math.random().toString(36).substr(2, 5)}`);
    
    try {
      // Set with server timestamp - Firebase will replace `serverTime` with actual server time
      await set(pingRef, {
        localTime: t1,
        serverTime: serverTimestamp(),
      });

      // Read it back to get the server's actual timestamp
      const snapshot = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Ping timeout")), 5000);
        onValue(pingRef, (snap) => {
          clearTimeout(timeout);
          resolve(snap);
        }, { onlyOnce: true });
      });

      const t2 = Date.now(); // Local time after receive
      const data = snapshot.val();

      if (!data) {
        throw new Error("No ping data received");
      }

      const rtt = t2 - t1;
      const serverTime = typeof data.serverTime === 'number' ? data.serverTime : t1 + rtt / 2;
      const localTimeAtMidpoint = t1 + rtt / 2;
      const offset = serverTime - localTimeAtMidpoint;

      // Cleanup
      remove(pingRef).catch(() => {});

      return { rtt, serverTime, localTime: localTimeAtMidpoint, offset };
    } catch (err) {
      console.warn("[SyncedClock] Ping failed:", err);
      return {
        rtt: 0,
        serverTime: Date.now(),
        localTime: Date.now(),
        offset: 0,
      };
    }
  }

  /**
   * Performs multiple pings and averages the results for better accuracy.
   * Uses median filtering to reject outliers.
   */
  async calibrate(pingCount: number = 5): Promise<void> {
    if (this.isCalibrated) return;

    console.log(`[SyncedClock] Calibrating with ${pingCount} pings...`);
    
    const results: PingResult[] = [];
    for (let i = 0; i < pingCount; i++) {
      const result = await this.ping();
      results.push(result);
      // Small delay between pings
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Sort by offset and take median (more robust than mean)
    const offsets = results.map(r => r.offset).sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];

    // Average RTT
    const avgRtt = results.reduce((sum, r) => sum + r.rtt, 0) / results.length;

    this.offset = medianOffset;
    this.rtt = avgRtt;
    this.isCalibrated = true;

    console.log(`[SyncedClock] ✅ Calibrated: offset=${medianOffset}ms, avgRtt=${avgRtt.toFixed(1)}ms`);
    
    this.calibrationListeners.forEach(cb => cb(true));
  }

  /**
   * Returns the current "Synced Master Time" - what the server thinks the time is RIGHT NOW.
   * Formula: LocalTime + Offset
   */
  now(): number {
    return Date.now() + this.offset;
  }

  /**
   * Returns the calibration status and metrics.
   */
  getMetrics(): { offset: number; rtt: number; isCalibrated: boolean } {
    return {
      offset: this.offset,
      rtt: this.rtt,
      isCalibrated: this.isCalibrated,
    };
  }

  /**
   * Returns true if the clock is calibrated and ready to use.
   */
  isReady(): boolean {
    return this.isCalibrated;
  }

  /**
   * Subscribe to calibration completion.
   */
  onCalibrated(callback: (calibrated: boolean) => void): void {
    this.calibrationListeners.push(callback);
    if (this.isCalibrated) {
      callback(true);
    }
  }
}

// Singleton instance
export const syncedClock = new SyncedClock();