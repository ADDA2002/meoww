/**
 * Phase 1: Server-Synced Clock
 * 
 * OPTIMIZED: Reduced calibration pings from 5 to 3 for faster startup.
 */

import { db, ref, set, onValue, serverTimestamp, remove } from "./firebase";

interface PingResult {
  rtt: number;
  serverTime: number;
  localTime: number;
  offset: number;
}

class SyncedClock {
  private offset: number = 0;
  private rtt: number = 0;
  private isCalibrated: boolean = false;
  private calibrationListeners: ((calibrated: boolean) => void)[] = [];
  private isCalibrating: boolean = false;

  async ping(): Promise<PingResult> {
    if (!db) {
      return {
        rtt: 0,
        serverTime: Date.now(),
        localTime: Date.now(),
        offset: 0,
      };
    }

    const t1 = Date.now();
    const pingRef = ref(db, `_ping/${Date.now()}-${Math.random().toString(36).substr(2, 5)}`);
    
    try {
      await set(pingRef, {
        localTime: t1,
        serverTime: serverTimestamp(),
      });

      const snapshot = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Ping timeout")), 3000); // Reduced from 5s
        onValue(pingRef, (snap) => {
          clearTimeout(timeout);
          resolve(snap);
        }, { onlyOnce: true });
      });

      const t2 = Date.now();
      const data = snapshot.val();

      if (!data) {
        throw new Error("No ping data");
      }

      const rtt = t2 - t1;
      const serverTime = typeof data.serverTime === 'number' ? data.serverTime : t1 + rtt / 2;
      const localTimeAtMidpoint = t1 + rtt / 2;
      const offset = serverTime - localTimeAtMidpoint;

      remove(pingRef).catch(() => {});

      return { rtt, serverTime, localTime: localTimeAtMidpoint, offset };
    } catch (err) {
      return {
        rtt: 0,
        serverTime: Date.now(),
        localTime: Date.now(),
        offset: 0,
      };
    }
  }

  /**
   * OPTIMIZED: 3 pings instead of 5 for faster calibration (~300ms vs ~600ms)
   */
  async calibrate(pingCount: number = 3): Promise<void> {
    if (this.isCalibrated) return;
    if (this.isCalibrating) return;

    this.isCalibrating = true;
    console.log(`[SyncedClock] Calibrating with ${pingCount} pings...`);
    
    const results: PingResult[] = [];
    for (let i = 0; i < pingCount; i++) {
      const result = await this.ping();
      results.push(result);
      console.log(`[SyncedClock] Ping ${i + 1}/${pingCount}: RTT=${result.rtt.toFixed(0)}ms, offset=${result.offset.toFixed(0)}ms`);
      if (i < pingCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms
      }
    }

    const offsets = results.map(r => r.offset).sort((a, b) => a - b);
    const medianOffset = offsets[Math.floor(offsets.length / 2)];
    const avgRtt = results.reduce((sum, r) => sum + r.rtt, 0) / results.length;

    this.offset = medianOffset;
    this.rtt = avgRtt;
    this.isCalibrated = true;
    this.isCalibrating = false;

    console.log(`[SyncedClock] ✅ Calibrated: offset=${medianOffset.toFixed(0)}ms, avgRtt=${avgRtt.toFixed(0)}ms`);
    
    this.calibrationListeners.forEach(cb => cb(true));
  }

  now(): number {
    return Date.now() + this.offset;
  }

  getMetrics(): { offset: number; rtt: number; isCalibrated: boolean } {
    return {
      offset: this.offset,
      rtt: this.rtt,
      isCalibrated: this.isCalibrated,
    };
  }

  isReady(): boolean {
    return this.isCalibrated;
  }

  onCalibrated(callback: (calibrated: boolean) => void): void {
    this.calibrationListeners.push(callback);
    if (this.isCalibrated) {
      callback(true);
    }
  }
}

export const syncedClock = new SyncedClock();