import React from "react";
import { Track } from "@/types/music";
import PlayerStatusBar from "./PlayerStatusBar";
import TrackInfo from "./TrackInfo";
import ProgressBar from "./ProgressBar";
import PlayerControls from "./PlayerControls";
import ListenerNotice from "./ListenerNotice";

interface MusicPlayerCardProps {
  currentTrack: Track | null;
  isHost: boolean;
  isConnected: boolean;
  ping: number;
  isPlaying: boolean;
  isShuffle: boolean;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onShuffleToggle: () => void;
  onMuteToggle: () => void;
  onSeek: (time: number) => void;
}

const MusicPlayerCard: React.FC<MusicPlayerCardProps> = ({
  currentTrack,
  isHost,
  isConnected,
  ping,
  isPlaying,
  isShuffle,
  isMuted,
  currentTime,
  duration,
  onTogglePlay,
  onNext,
  onPrevious,
  onShuffleToggle,
  onMuteToggle,
  onSeek,
}) => {
  return (
    <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative">
      <PlayerStatusBar isHost={isHost} isConnected={isConnected} ping={ping} />
      <TrackInfo track={currentTrack} />
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        isHost={isHost}
        onSeek={onSeek}
      />
      <PlayerControls
        isPlaying={isPlaying}
        isShuffle={isShuffle}
        isMuted={isMuted}
        onTogglePlay={onTogglePlay}
        onNext={onNext}
        onPrevious={onPrevious}
        onShuffleToggle={onShuffleToggle}
        onMuteToggle={onMuteToggle}
      />
      <ListenerNotice visible={!isHost} />
    </div>
  );
};

export default MusicPlayerCard;