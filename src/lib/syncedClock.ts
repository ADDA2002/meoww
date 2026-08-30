/**
 * Server-Synced Clock
 * 
 * Calibrates local time against Firebase server time using ping-pong method.
 * Accounts for network latency by estimating the server time at the midpoint of RTT.
 */

import { db, ref, set, onValue, serverTimestamp, remove } from "./firebase";

interface PingResult {
  rtt: number;
  serverTime: number;
  localTimeAtMidpoint: number;
  offset: number;
}

class SyncedClock {
  private offset: number = 0;
  private rtt: number = 0;
  private isCalibrated: boolean = false;
  private calibrationListeners: ((calibrated: boolean) => void)[] = [];
  private isCalibrating: boolean = false;

  async ping(): Promise<PingResult> {
    const t1 = Date.now();
    
    if (!db) {
      return {
        rtt: 0,
        serverTime: t1,
        localTimeAtMidpoint: t1,
        offset: 0,
      };
    }

    const pingId = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const pingRef = ref(db, `_ping/${pingId}`);
    
    try {
      // Write with local timestamp
      await set(pingRef, {
        localTime: t1,
        serverTime: serverTimestamp(),
      });

      // Read back with server timestamp
      const snapshot = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Ping timeout")), 5000);
        onValue(pingRef, (snap) => {
          if (snap.exists()) {
            clearTimeout(timeout);
            resolve(snap);
          }
        }, { onlyOnce: true });
      });

      const t2 = Date.now();
      const data = snapshot.val();

      if (!data || !data.serverTime) {
        throw new Error("No server time in response");
      }

      const rtt = t2 - t1;
      
      // Firebase serverTimestamp() returns Unix timestamp in milliseconds
      // If value is too small (< 1e12), assume it's in seconds and convert
      let serverTime = data.serverTime;
      if (serverTime < 1e12) {
        serverTime = serverTime * 1000;
      }
      
      // Estimate local time at the moment server processed our request (midpoint of RTT)
      const localTimeAtMidpoint = t1 + rtt / 2;
      
      // Offset = how much server time differs from local time
      // Positive = server is ahead, Negative = server is behind
      const offset = serverTime - localTimeAtMidpoint;

      // Cleanup
      remove(pingRef).catch(() => {});

      // Sanity check: offset should be reasonable (-1 hour to +1 hour)
      // If not, discard this ping result
      const MAX_REASONABLE_OFFSET = 60 * 60 * 1000; // 1 hour
      if (Math.abs(offset) > MAX_REASONABLE_OFFSET) {
        console.warn(`[SyncedClock] Discarding ping: offset ${offset}ms is unreasonable`);
        return {
          rtt,
          serverTime,
          localTimeAtMidpoint,
          offset: 0,
        };
      }

      return { rtt, serverTime, localTimeAtMidpoint, offset };
    } catch (err) {
      return {
        rtt: 0,
        serverTime: t1,
        localTimeAtMidpoint: t1,
        offset: 0,
      };
    }
  }

  async calibrate(pingCount: number = 3): Promise<void> {
    if (this.isCalibrated) return;
    if (this.isCalibrating) return;

    this.isCalibrating = true;
    console.log(`[SyncedClock] Calibrating with ${pingCount} pings...`);
    
    const results: PingResult[] = [];
    for (let i = 0; i < pingCount; i++) {
      const result = await this.ping();
      if (result.rtt > 0) {
        results.push(result);
        console.log(`[SyncedClock] Ping ${i + 1}/${pingCount}: RTT=${result.rtt.toFixed(0)}ms, offset=${result.offset.toFixed(0)}ms`);
      }
      if (i < pingCount - 1 && results.length < pingCount) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (results.length === 0) {
      console.warn(`[SyncedClock] No valid pings, using local clock`);
      this.isCalibrating = false;
      return;
    }

    // Use median offset to be robust against outliers
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