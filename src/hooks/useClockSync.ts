import { useState, useEffect, useRef, useCallback } from "react";

export interface ClockOffset {
  offsetMs: number;
  rttMs: number;
  lastSync: number;
}

interface SyncPeerMessage {
  type: "CLOCK_SYNC_REQUEST";
  clientSendTime: number;
  seq: number;
}

interface SyncHostMessage {
  type: "CLOCK_SYNC_RESPONSE";
  clientSendTime: number;
  serverReceiveTime: number;
  serverSendTime: number;
  seq: number;
}

export interface ClockSyncResult {
  offsetMs: number;
  rttMs: number;
  stdDevMs: number;
  samples: number;
}

const SAMPLES_PER_SYNC = 5;
const SYNC_INTERVAL_MS = 10000;

export function useClockSync(
  peer: any,
  isHost: boolean,
  hostPeerId: string | null,
  onOffsetUpdate?: (offset: number) => void
) {
  const [clockOffset, setClockOffset] = useState<number>(0);
  const [syncQuality, setSyncQuality] = useState<{
    rttMs: number;
    samples: number;
    stdDevMs: number;
  }>({ rttMs: 0, samples: 0, stdDevMs: 0 });

  const measurementsRef = useRef<{ rtt: number; offset: number }[]>([]);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRequestsRef = useRef<Map<number, { sendTime: number; resolve: (r: ClockSyncResult) => void }>>(new Map());
  const seqRef = useRef(0);

  // Get the current synchronized time (adjusted for clock offset)
  const getSyncedTime = useCallback((): number => {
    return performance.now() + clockOffset;
  }, [clockOffset]);

  // Perform a single sync measurement
  const performSyncMeasurement = useCallback((): Promise<ClockSyncResult> => {
    return new Promise((resolve) => {
      if (!peer || !hostPeerId) {
        resolve({ offsetMs: 0, rttMs: 0, stdDevMs: 0, samples: 0 });
        return;
      }

      const conn = peer.connect(hostPeerId, { reliable: true, serialization: "json" });
      const seq = ++seqRef.current;
      const sendTime = performance.now();

      const timeout = setTimeout(() => {
        conn.close();
        resolve({ offsetMs: clockOffset, rttMs: 9999, stdDevMs: 9999, samples: measurementsRef.current.length });
      }, 3000);

      conn.on("open", () => {
        const request: SyncPeerMessage = {
          type: "CLOCK_SYNC_REQUEST",
          clientSendTime: sendTime,
          seq,
        };
        conn.send(request);
      });

      conn.on("data", (data: any) => {
        if (data?.type === "CLOCK_SYNC_RESPONSE" && data?.seq === seq) {
          clearTimeout(timeout);
          const clientReceiveTime = performance.now();
          const serverProcessingDelay = data.serverSendTime - data.serverReceiveTime;

          // Calculate one-way latency (accounting for processing delay)
          const rtt = clientReceiveTime - sendTime;
          const oneWayLatency = (rtt - serverProcessingDelay) / 2;

          // Clock offset = (server time at receive + one-way) - client time now
          const serverTimeAtClientNow = data.serverSendTime + oneWayLatency;
          const offset = serverTimeAtClientNow - clientReceiveTime;

          conn.close();

          const result: ClockSyncResult = {
            offsetMs: offset,
            rttMs: rtt,
            stdDevMs: 0,
            samples: measurementsRef.current.length + 1,
          };

          resolve(result);
        }
      });

      conn.on("error", () => {
        clearTimeout(timeout);
        conn.close();
        resolve({ offsetMs: clockOffset, rttMs: 9999, stdDevMs: 9999, samples: measurementsRef.current.length });
      });
    });
  }, [peer, hostPeerId, clockOffset]);

  // Run multiple samples and compute average
  const runSync = useCallback(async (): Promise<ClockSyncResult> => {
    const results: ClockSyncResult[] = [];

    for (let i = 0; i < SAMPLES_PER_SYNC; i++) {
      const result = await performSyncMeasurement();
      results.push(result);
      await new Promise((r) => setTimeout(r, 50)); // Small delay between samples
    }

    // Filter out outliers (RTT > 500ms)
    const validResults = results.filter((r) => r.rttMs < 500);

    if (validResults.length === 0) {
      return { offsetMs: clockOffset, rttMs: 9999, stdDevMs: 9999, samples: 0 };
    }

    // Calculate weighted average (prefer lower RTT results)
    const weights = validResults.map((r) => 1 / (r.rttMs + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const weightedOffset = validResults.reduce(
      (sum, r, i) => sum + r.offsetMs * weights[i],
      0
    ) / totalWeight;

    const avgRtt =
      validResults.reduce((sum, r) => sum + r.rttMs, 0) / validResults.length;

    // Calculate standard deviation of offsets
    const mean = weightedOffset;
    const variance =
      validResults.reduce((sum, r) => sum + Math.pow(r.offsetMs - mean, 2), 0) /
      validResults.length;
    const stdDev = Math.sqrt(variance);

    const finalResult: ClockSyncResult = {
      offsetMs: weightedOffset,
      rttMs: avgRtt,
      stdDevMs: stdDev,
      samples: validResults.length,
    };

    return finalResult;
  }, [performSyncMeasurement, clockOffset]);

  // Host-side: handle incoming sync requests
  useEffect(() => {
    if (!isHost || !peer) return;

    const handleSyncRequest = (conn: any, data: SyncPeerMessage) => {
      if (data.type !== "CLOCK_SYNC_REQUEST") return;

      const serverReceiveTime = performance.now();
      const response: SyncHostMessage = {
        type: "CLOCK_SYNC_RESPONSE",
        clientSendTime: data.clientSendTime,
        serverReceiveTime,
        serverSendTime: performance.now(),
        seq: data.seq,
      };
      conn.send(response);
    };

    peer.on("connection", (conn: any) => {
      conn.on("data", (data: any) => handleSyncRequest(conn, data));
    });

    return () => {
      peer.removeAllListeners("connection");
    };
  }, [isHost, peer]);

  // Listener-side: periodic sync
  useEffect(() => {
    if (isHost || !hostPeerId) return;

    const doSync = async () => {
      const result = await runSync();
      measurementsRef.current.push({ rtt: result.rttMs, offset: result.offsetMs });

      // Keep last 10 measurements for rolling average
      if (measurementsRef.current.length > 10) {
        measurementsRef.current.shift();
      }

      // Compute rolling average
      const avgOffset =
        measurementsRef.current.reduce((s, m) => s + m.offset, 0) /
        measurementsRef.current.length;

      setClockOffset(avgOffset);
      setSyncQuality({
        rttMs: result.rttMs,
        samples: measurementsRef.current.length,
        stdDevMs: result.stdDevMs,
      });

      onOffsetUpdate?.(avgOffset);
    };

    // Initial sync
    const initialTimeout = setTimeout(doSync, 1000);

    // Periodic sync
    syncIntervalRef.current = setInterval(doSync, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isHost, hostPeerId, runSync, onOffsetUpdate]);

  return {
    clockOffset,
    getSyncedTime,
    syncQuality,
    runSync,
  };
}