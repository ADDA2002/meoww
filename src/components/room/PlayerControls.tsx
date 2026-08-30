import React from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Volume2,
  VolumeX,
} from "lucide-react";

interface PlayerControlsProps {
  isPlaying: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffleToggle: () => void;
  onMuteToggle: () => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  isPlaying,
  isShuffle,
  isMuted,
  onTogglePlay,
  onNext,
  onPrevious,
  onShuffleToggle,
  onMuteToggle,
}) => {
  return (
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
  );
};

export default PlayerControls;