import React from "react";
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Volume2, 
  VolumeX,
  Music,
  AlertCircle
} from "lucide-react";
import type { Track } from "@/types/music";
import { formatTime } from "@/lib/utils";

interface PlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  isShuffle: boolean;
  isHost: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffleToggle: () => void;
  onMuteToggle: () => void;
  onSeek: (time: number) => void;
}

export const Player: React.FC<PlayerProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  isMuted,
  isShuffle,
  isHost,
  onTogglePlay,
  onNext,
  onPrevious,
  onShuffleToggle,
  onMuteToggle,
  onSeek,
}) => {
  return (
    <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-black animate-pulse"></span>
          <span className="font-semibold text-gray-700 uppercase">
            {isHost ? "YOU ARE HOST" : "LISTENER MODE (SYNCED)"}
          </span>
        </div>
      </div>

      {/* Song Info */}
      <div className="flex gap-4 items-center mb-6">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
          {currentTrack?.cover ? (
            <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
          ) : (
            <Music className="w-8 h-8 text-gray-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-black truncate">
            {currentTrack ? currentTrack.title : "No Track Selected"}
          </h2>
          <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
            {currentTrack ? currentTrack.artist : "Queue is empty"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
            <span>ADDED BY:</span>
            <span className="font-bold text-black uppercase">{currentTrack?.addedBy || "Host"}</span>
          </div>
        </div>
      </div>

      {/* Time Progress */}
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
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onShuffleToggle}
          className={`p-2 border border-black transition-colors ${
            isShuffle ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
          }`}
          title={isShuffle ? "Shuffle On" : "Shuffle Off"}
        >
          <Shuffle className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onPrevious}
          className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
          title="Previous Song"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={onNext}
          className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors"
          title="Next Song"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onMuteToggle}
          className={`p-2 border border-black transition-colors ${
            isMuted ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Listener Notice */}
      {!isHost && (
        <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
          <span>Host controls playback. All can add and organize songs in the queue below.</span>
        </div>
      )}
    </div>
  );
};