import React from "react";
import { Music, AlertCircle } from "lucide-react";
import { Track } from "@/types/music";
import { formatTime } from "@/lib/formatTime";
import PlayerControls from "./PlayerControls";

interface NowPlayingProps {
  track: Track | null;
  isHost: boolean;
  isConnected: boolean;
  ping: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  isShuffle: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffleToggle: () => void;
  onMuteToggle: () => void;
  onSeek: (time: number) => void;
}

const NowPlaying: React.FC<NowPlayingProps> = ({
  track,
  isHost,
  isConnected,
  ping,
  currentTime,
  duration,
  isPlaying,
  isMuted,
  isShuffle,
  onTogglePlay,
  onNext,
  onPrevious,
  onShuffleToggle,
  onMuteToggle,
  onSeek,
}) => {
  return (
    <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
      {/* Latency & Host Status Bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 ${
              isConnected ? "bg-black" : "bg-red-500"
            } animate-pulse`}
          ></span>
          <span className="font-semibold text-gray-700 uppercase">
            {isHost ? "YOU ARE HOST" : "LISTENER MODE (SYNCED)"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <span>ping {ping}ms</span>
        </div>
      </div>

      {/* Song Info */}
      <div className="flex gap-4 items-center mb-6">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
          {track?.cover ? (
            <img
              src={track.cover}
              alt="Cover"
              className="w-full h-full object-cover grayscale"
            />
          ) : (
            <Music className="w-8 h-8 text-gray-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-black truncate">
            {track ? track.title : "No Track Selected"}
          </h2>
          <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
            {track ? track.artist : "Queue is empty"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
            <span>ADDED BY:</span>
            <span className="font-bold text-black uppercase">
              {track?.addedBy || "Host"}
            </span>
          </div>
        </div>
      </div>

      {/* Time progress bar */}
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

      {/* Controls */}
      <PlayerControls
        isPlaying={isPlaying}
        isMuted={isMuted}
        isShuffle={isShuffle}
        onTogglePlay={onTogglePlay}
        onNext={onNext}
        onPrevious={onPrevious}
        onShuffleToggle={onShuffleToggle}
        onMuteToggle={onMuteToggle}
      />

      {!isHost && (
        <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
          <span>
            Host controls playback. All can add and organize songs in the queue
            below.
          </span>
        </div>
      )}
    </div>
  );
};

export default NowPlaying;