import { Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PlayerControlsProps {
  isPlaying: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  isHost: boolean;
  isConnected: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShuffle: () => void;
  onToggleMute: () => void;
}

export function PlayerControls({
  isPlaying,
  isShuffle,
  isMuted,
  isHost,
  isConnected,
  onTogglePlay,
  onNext,
  onPrevious,
  onToggleShuffle,
  onToggleMute,
}: PlayerControlsProps) {
  const canControl = isConnected;

  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <Button
        variant={isShuffle ? "default" : "ghost"}
        size="icon"
        onClick={onToggleShuffle}
        disabled={!isConnected}
        className={`border border-black transition-colors disabled:opacity-50 ${
          isShuffle 
            ? "bg-black text-white hover:bg-neutral-800 hover:text-white" 
            : "bg-white text-black hover:bg-gray-100 hover:text-black"
        }`}
      >
        <Shuffle className="w-4 h-4" />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={!canControl}
        className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50"
      >
        <SkipBack className="w-5 h-5" />
      </Button>
      
      <Button
        onClick={onTogglePlay}
        disabled={!canControl}
        className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors disabled:opacity-50"
      >
        {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={!canControl}
        className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors disabled:opacity-50"
      >
        <SkipForward className="w-5 h-5" />
      </Button>
      
      <Button
        variant={isMuted ? "default" : "ghost"}
        size="icon"
        onClick={onToggleMute}
        disabled={!isConnected}
        className={`border border-black transition-colors disabled:opacity-50 ${
          isMuted 
            ? "bg-black text-white hover:bg-neutral-800 hover:text-white" 
            : "bg-white text-black hover:bg-gray-100 hover:text-black"
        }`}
      >
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </Button>
    </div>
  );
}