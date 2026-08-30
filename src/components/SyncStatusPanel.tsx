import { useState, useEffect } from "react";
import { Clock, Wifi, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { syncedClock } from "@/lib/syncedClock";
import { syncScheduler, ScheduledTrack } from "@/lib/syncScheduler";

interface SyncStatusPanelProps {
  isHost: boolean;
}

export function SyncStatusPanel({ isHost }: SyncStatusPanelProps) {
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [offset, setOffset] = useState(0);
  const [rtt, setRtt] = useState(0);
  const [scheduledTracks, setScheduledTracks] = useState<ScheduledTrack[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    // Subscribe to calibration
    syncedClock.onCalibrated((calibrated) => {
      setIsCalibrated(calibrated);
      const metrics = syncedClock.getMetrics();
      setOffset(metrics.offset);
      setRtt(metrics.rtt);
    });

    // Subscribe to scheduler
    const unsub = syncScheduler.subscribe((tracks) => {
      setScheduledTracks(tracks);
    });

    return () => {
      unsub();
    };
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (scheduledTracks.length === 0) {
      setCountdown(null);
      return;
    }

    const interval = setInterval(() => {
      if (!isCalibrated) {
        setCountdown(null);
        return;
      }

      const syncedNow = syncedClock.now();
      // Find the next track to play
      const nextTrack = scheduledTracks
        .filter(t => t.status === "pending" || t.status === "fetching" || t.status === "buffered")
        .sort((a, b) => a.targetSyncedTime - b.targetSyncedTime)[0];

      if (nextTrack) {
        setCountdown(nextTrack.targetSyncedTime - syncedNow);
      } else {
        setCountdown(null);
      }
    }, 50); // Update every 50ms for smooth countdown

    return () => clearInterval(interval);
  }, [scheduledTracks, isCalibrated]);

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return "0.00s";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10); // 2-digit precision
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(2, "0")}`;
    }
    return `${seconds}.${millis.toString().padStart(2, "0")}s`;
  };

  const getStatusIcon = (status: ScheduledTrack["status"]) => {
    switch (status) {
      case "pending": return <Clock className="w-3 h-3 text-gray-400" />;
      case "fetching": return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
      case "buffered": return <CheckCircle2 className="w-3 h-3 text-green-600" />;
      case "playing": return <CheckCircle2 className="w-3 h-3 text-black" />;
      case "failed": return <AlertCircle className="w-3 h-3 text-red-500" />;
    }
  };

  const getStatusText = (status: ScheduledTrack["status"]) => {
    switch (status) {
      case "pending": return "Queued";
      case "fetching": return "Fetching...";
      case "buffered": return "Ready";
      case "playing": return "Playing";
      case "failed": return "Failed";
    }
  };

  return (
    <div className="border border-black bg-white p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] text-xs font-mono">
      {/* Calibration Status */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Wifi className={`w-3.5 h-3.5 ${isCalibrated ? "text-green-600" : "text-amber-500"}`} />
          <span className="font-bold uppercase tracking-wider text-black">
            {isCalibrated ? "SYNCED" : "SYNCING..."}
          </span>
        </div>
        {isCalibrated && (
          <span className="text-gray-500">
            {offset >= 0 ? "+" : ""}{offset.toFixed(0)}ms
          </span>
        )}
      </div>

      {/* Countdown (if a track is scheduled) */}
      {countdown !== null && scheduledTracks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-500 uppercase text-[10px]">Drop In</span>
            <span className="font-bold text-base tabular-nums text-black">
              {formatCountdown(countdown)}
            </span>
          </div>
          
          {/* Active track status */}
          {scheduledTracks.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {getStatusIcon(t.status)}
                <span className="truncate text-[11px]">{t.track.title}</span>
              </div>
              <span className={`text-[10px] uppercase font-bold ${
                t.status === "buffered" ? "text-green-600" :
                t.status === "playing" ? "text-black" :
                t.status === "failed" ? "text-red-500" :
                "text-gray-500"
              }`}>
                {getStatusText(t.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!isCalibrated && (
        <div className="text-gray-500 text-[10px] mt-1">
          Measuring network latency...
        </div>
      )}
      
      {isCalibrated && scheduledTracks.length === 0 && (
        <div className="text-gray-500 text-[10px]">
          {isHost ? "Schedule a track to begin" : "Waiting for host..."}
        </div>
      )}
    </div>
  );
}