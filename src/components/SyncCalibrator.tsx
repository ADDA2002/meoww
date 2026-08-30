import React, { useState, useEffect, useRef, useCallback } from "react";
import { Crosshair, RefreshCw, Zap, Clock, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncEngine } from "@/lib/syncEngine";

interface SyncCalibratorProps {
  peer: any;
  isHost: boolean;
  hostPeerId: string | null;
  onOffsetCalibrated?: (offsetMs: number) => void;
}

interface SyncMeasurement {
  timestamp: number;
  rttMs: number;
  offsetMs: number;
}

type SyncStatus = "idle" | "calibrating" | "synced" | "error";

const CALIBRATION_SAMPLES = 8;
const SYNC_INTERVAL_MS = 15000;

export const SyncCalibrator: React.FC<SyncCalibratorProps> = ({
  peer,
  isHost,
  hostPeerId,
  onOffsetCalibrated,
}) => {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [measurements, setMeasurements] = useState<SyncMeasurement[]>([]);
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [manualOffset, setManualOffset] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(0);
  const [quality, setQuality] = useState<{ rtt: number; stdDev: number; samples: number }>({
    rtt: 0,
    stdDev: 0,
    samples: 0,
  });

  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<boolean>(false);

  // Single ping measurement to host
  const pingHost = useCallback((): Promise<{ rtt: number; offset: number }> => {
    return new Promise((resolve) => {
      if (!peer || !hostPeerId) {
        resolve({ rtt: 9999, offset: 0 });
        return;
      }

      const conn = peer.connect(hostPeerId, { reliable: true, serialization: "json" });
      const sendTime = performance.now();
      let responseReceived = false;

      const cleanup = () => {
        responseReceived = true;
        try { conn.close(); } catch (e) { /* noop */ }
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve({ rtt: 9999, offset: 0 });
      }, 3000);

      conn.on("open", () => {
        conn.send({
          type: "CLOCK_SYNC_REQUEST",
          clientSendTime: sendTime,
          seq: Date.now(),
        });
      });

      conn.on("data", (data: any) => {
        if (data?.type === "CLOCK_SYNC_RESPONSE" && !responseReceived) {
          clearTimeout(timeout);
          const receiveTime = performance.now();
          const rtt = receiveTime - sendTime;
          const processingDelay = data.serverSendTime - data.serverReceiveTime;
          const oneWayLatency = (rtt - processingDelay) / 2;
          const serverTimeAtReceive = data.serverSendTime + oneWayLatency;
          const offset = serverTimeAtReceive - receiveTime;
          cleanup();
          resolve({ rtt, offset });
        }
      });

      conn.on("error", () => {
        clearTimeout(timeout);
        cleanup();
        resolve({ rtt: 9999, offset: 0 });
      });
    });
  }, [peer, hostPeerId]);

  // Run calibration sequence
  const runCalibration = useCallback(async () => {
    if (isHost) return;

    setStatus("calibrating");
    setMeasurements([]);
    abortRef.current = false;

    const newMeasurements: SyncMeasurement[] = [];

    for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
      if (abortRef.current) break;

      const result = await pingHost();
      const timestamp = Date.now();

      newMeasurements.push({
        timestamp,
        rttMs: result.rtt,
        offsetMs: result.offset,
      });

      setMeasurements([...newMeasurements]);

      // Small delay between samples
      await new Promise((r) => setTimeout(r, 100));
    }

    if (abortRef.current) {
      setStatus("idle");
      return;
    }

    // Filter out outliers (RTT > 500ms)
    const validMeasurements = newMeasurements.filter((m) => m.rttMs < 500);

    if (validMeasurements.length === 0) {
      setStatus("error");
      return;
    }

    // Calculate weighted average (prefer lower RTT)
    const weights = validMeasurements.map((m) => 1 / (m.rttMs + 1));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const weightedOffset =
      validMeasurements.reduce((sum, m, i) => sum + m.offsetMs * weights[i], 0) /
      totalWeight;

    const avgRtt =
      validMeasurements.reduce((sum, m) => sum + m.rttMs, 0) /
      validMeasurements.length;

    // Calculate standard deviation
    const variance =
      validMeasurements.reduce(
        (sum, m) => sum + Math.pow(m.offsetMs - weightedOffset, 2),
        0
      ) / validMeasurements.length;
    const stdDev = Math.sqrt(variance);

    setCurrentOffset(weightedOffset);
    setQuality({ rtt: avgRtt, stdDev, samples: validMeasurements.length });
    setLastSyncTime(Date.now());

    // Apply to sync engine
    syncEngine.setClockOffset(weightedOffset);
    onOffsetCalibrated?.(weightedOffset);

    setStatus("synced");
  }, [isHost, pingHost, onOffsetCalibrated]);

  // Apply manual offset adjustment
  const applyManualOffset = useCallback(() => {
    const newOffset = currentOffset + manualOffset;
    setCurrentOffset(newOffset);
    syncEngine.setClockOffset(newOffset);
    onOffsetCalibrated?.(newOffset);
    setManualOffset(0);
    setStatus("synced");
    setLastSyncTime(Date.now());
  }, [currentOffset, manualOffset, onOffsetCalibrated]);

  // Reset to zero offset
  const resetOffset = useCallback(() => {
    setCurrentOffset(0);
    setManualOffset(0);
    syncEngine.setClockOffset(0);
    onOffsetCalibrated?.(0);
    setMeasurements([]);
    setStatus("idle");
  }, [onOffsetCalibrated]);

  // Host: Listen for sync requests
  useEffect(() => {
    if (!isHost || !peer) return;

    const handleSyncRequest = (conn: any, data: any) => {
      if (data?.type !== "CLOCK_SYNC_REQUEST") return;
      const receiveTime = performance.now();
      conn.send({
        type: "CLOCK_SYNC_RESPONSE",
        clientSendTime: data.clientSendTime,
        serverReceiveTime: receiveTime,
        serverSendTime: performance.now(),
        seq: data.seq,
      });
    };

    peer.on("connection", (conn: any) => {
      conn.on("data", (data: any) => handleSyncRequest(conn, data));
    });

    return () => {
      peer.removeAllListeners("connection");
    };
  }, [isHost, peer]);

  // Listeners: Periodic auto-sync
  useEffect(() => {
    if (isHost || !hostPeerId) return;

    // Initial calibration
    const initialTimeout = setTimeout(runCalibration, 1500);

    // Periodic recalibration
    syncIntervalRef.current = setInterval(runCalibration, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isHost, hostPeerId, runCalibration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  // Format offset for display
  const formatOffset = (ms: number) => {
    const sign = ms >= 0 ? "+" : "";
    const abs = Math.abs(ms);
    if (abs < 1) return `${sign}${ms.toFixed(3)}ms`;
    if (abs < 10) return `${sign}${ms.toFixed(2)}ms`;
    return `${sign}${ms.toFixed(1)}ms`;
  };

  if (isHost) return null;

  return (
    <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Crosshair className="w-4 h-4 text-black" />
          <span className="font-bold text-xs uppercase tracking-wider">
            Clock Sync
          </span>
        </div>

        {/* Status Badge */}
        <div
          className={`px-2 py-1 text-[10px] font-mono font-bold uppercase flex items-center gap-1 ${
            status === "synced"
              ? "bg-black text-white"
              : status === "calibrating"
              ? "bg-yellow-400 text-black animate-pulse"
              : status === "error"
              ? "bg-red-500 text-white"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {status === "synced" && <Check className="w-3 h-3" />}
          {status === "calibrating" && <RefreshCw className="w-3 h-3 animate-spin" />}
          {status === "error" && <AlertTriangle className="w-3 h-3" />}
          {status === "idle" && <Clock className="w-3 h-3" />}
          {status}
        </div>
      </div>

      {/* Current Offset Display */}
      <div className="bg-gray-50 border border-gray-200 p-3 mb-4 text-center">
        <div className="text-[10px] font-mono uppercase text-gray-500 mb-1">
          Current Clock Offset
        </div>
        <div
          className={`text-2xl font-mono font-bold ${
            Math.abs(currentOffset) < 10
              ? "text-black"
              : Math.abs(currentOffset) < 50
              ? "text-yellow-600"
              : "text-red-600"
          }`}
        >
          {formatOffset(currentOffset)}
        </div>
        {lastSyncTime > 0 && (
          <div className="text-[10px] font-mono text-gray-400 mt-1">
            Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Quality Indicators */}
      {status === "synced" && quality.samples > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-gray-50 border border-gray-200 p-2">
            <div className="text-[10px] font-mono uppercase text-gray-500">RTT</div>
            <div className="font-mono font-bold text-sm">{quality.rtt.toFixed(1)}ms</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 p-2">
            <div className="text-[10px] font-mono uppercase text-gray-500">StdDev</div>
            <div className="font-mono font-bold text-sm">{quality.stdDev.toFixed(2)}ms</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 p-2">
            <div className="text-[10px] font-mono uppercase text-gray-500">Samples</div>
            <div className="font-mono font-bold text-sm">{quality.samples}</div>
          </div>
        </div>
      )}

      {/* Manual Adjustment */}
      <div className="border border-gray-200 p-3 mb-4">
        <div className="text-[10px] font-mono uppercase text-gray-500 mb-2">
          Fine-tune Offset (ms)
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={manualOffset || ""}
            onChange={(e) => setManualOffset(parseFloat(e.target.value) || 0)}
            placeholder="±0.000"
            step="0.1"
            className="flex-1 border border-gray-300 px-2 py-1.5 text-sm font-mono text-center bg-white"
          />
          <Button
            onClick={applyManualOffset}
            size="sm"
            className="bg-black hover:bg-neutral-800 text-white font-mono text-xs px-3"
          >
            <Zap className="w-3 h-3 mr-1" />
            Apply
          </Button>
        </div>
      </div>

      {/* Calibration Button */}
      <div className="flex gap-2">
        <Button
          onClick={runCalibration}
          disabled={status === "calibrating"}
          className="flex-1 bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2"
        >
          {status === "calibrating" ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Calibrating...
            </>
          ) : (
            <>
              <Crosshair className="w-3 h-3 mr-1" />
              Recalibrate
            </>
          )}
        </Button>
        <Button
          onClick={resetOffset}
          variant="outline"
          size="sm"
          className="border-black font-mono text-xs px-3"
        >
          Reset
        </Button>
      </div>

      {/* Advanced: Measurement History */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full mt-4 text-[10px] font-mono uppercase text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1"
      >
        {showAdvanced ? "Hide" : "Show"} Raw Measurements
      </button>

      {showAdvanced && measurements.length > 0 && (
        <div className="mt-2 bg-gray-50 border border-gray-200 p-2 text-[10px] font-mono max-h-32 overflow-y-auto">
          <div className="grid grid-cols-3 gap-1 mb-2 font-bold text-gray-500">
            <span>#</span>
            <span>RTT (ms)</span>
            <span>Offset (ms)</span>
          </div>
          {measurements.map((m, i) => (
            <div key={i} className="grid grid-cols-3 gap-1">
              <span>{i + 1}</span>
              <span className={m.rttMs > 100 ? "text-red-500" : ""}>{m.rttMs.toFixed(2)}</span>
              <span>{m.offsetMs.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SyncCalibrator;