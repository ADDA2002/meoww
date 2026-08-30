import { formatTime } from "@/lib/utils";

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  isHost: boolean;
  isConnected: boolean;
  onSeek: (time: number) => void;
}

export function ProgressBar({ currentTime, duration, isHost, isConnected, onSeek }: ProgressBarProps) {
  const canSeek = isConnected;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canSeek) return;
    const targetTime = parseFloat(e.target.value);
    onSeek(targetTime);
  };

  return (
    <div className="space-y-1.5 mb-6">
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={handleSeek}
        disabled={!canSeek}
        className="w-full accent-black bg-gray-200 h-1.5 appearance-none border border-black disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      />
      <div className="flex justify-between text-xs font-mono text-gray-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}