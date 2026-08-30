import React from "react";

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  isHost: boolean;
  onSeek: (time: number) => void;
}

const formatTime = (secs: number) => {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const ProgressBar: React.FC<ProgressBarProps> = ({ currentTime, duration, isHost, onSeek }) => {
  return (
    <div className="space-y-1.5 mb-6">
      <input
        type="range"
        min={0}
        max={duration || 100}
        value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
        disabled={!isHost}
        className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black"
      />
      <div className="flex justify-between text-xs font-mono text-gray-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};

export default ProgressBar;