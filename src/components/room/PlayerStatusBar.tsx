import React from "react";

interface PlayerStatusBarProps {
  isHost: boolean;
  isConnected: boolean;
  ping: number;
}

const PlayerStatusBar: React.FC<PlayerStatusBarProps> = ({ isHost, isConnected, ping }) => {
  return (
    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 ${isConnected ? "bg-black" : "bg-red-500"} animate-pulse`}></span>
        <span className="font-semibold text-gray-700 uppercase">
          {isHost ? "YOU ARE HOST" : "LISTENER MODE (SYNCED)"}
        </span>
      </div>
      <div className="flex items-center gap-1 text-gray-500">
        <span>ping {ping}ms</span>
      </div>
    </div>
  );
};

export default PlayerStatusBar;