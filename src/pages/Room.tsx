import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Radio, Play, Pause, SkipForward, SkipBack, Shuffle, Volume2, VolumeX, Music } from "lucide-react";

import RoomDrawer from "@/components/RoomDrawer";
import { formatTime } from "@/lib/utils";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const userName = formatDisplayName(searchParams.get("name") || "Guest");

  // Queue states
  const [queue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isShuffle, setIsShuffle] = useState<boolean>(false);

  // Audio state
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isShuffleRef = useRef(isShuffle);

  currentIndexRef.current = currentIndex;
  queueRef.current = queue;
  isShuffleRef.current = isShuffle;

  const currentTrack = queue[currentIndex] || null;

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      if (queueRef.current.length > 0) {
        const nextIdx = isShuffleRef.current
          ? Math.floor(Math.random() * queueRef.current.length)
          : (currentIndexRef.current + 1) % queueRef.current.length;
        handlePlayTrack(nextIdx);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Update audio source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    audio.pause();
    audio.src = currentTrack.url;
    audio.load();
  }, [currentTrack]);

  const handlePlayTrack = useCallback((idx: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    const track = queueRef.current[idx];
    if (!track) return;

    setCurrentIndex(idx);
    
    if (audio.src !== track.url) {
      audio.src = track.url;
      audio.load();
    }
    
    audio.play().catch(console.error);
  }, []);

  const handleTogglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    
    if (!audio.paused) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (queueRef.current.length === 0) return;
    
    const nextIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current + 1) % queueRef.current.length;

    handlePlayTrack(nextIdx);
  }, [handlePlayTrack]);

  const handlePrevious = useCallback(() => {
    if (queueRef.current.length === 0) return;
    
    const prevIdx = isShuffleRef.current
      ? Math.floor(Math.random() * queueRef.current.length)
      : (currentIndexRef.current - 1 + queueRef.current.length) % queueRef.current.length;

    handlePlayTrack(prevIdx);
  }, [handlePlayTrack]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = parseFloat(e.target.value);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, [isMuted]);

  const handleLeaveRoom = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-green-600">
            <Wifi className="w-3.5 h-3.5" />
            <span>CONNECTED</span>
          </div>
          <RoomDrawer 
            roomCode={roomCode} 
            userName={userName} 
            onLeave={handleLeaveRoom}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-lg mx-auto w-full">
        <div className="w-full">
          {/* Track Cover */}
          <div className="w-full aspect-square bg-gray-100 border-2 border-black flex items-center justify-center mb-8 overflow-hidden">
            {currentTrack?.cover ? (
              <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
            ) : (
              <Music className="w-24 h-24 text-gray-400" />
            )}
          </div>

          {/* Track Info */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight truncate">
              {currentTrack?.title || "No Track"}
            </h2>
            <p className="text-sm text-gray-600 mt-1 truncate">
              {currentTrack?.artist || "Add songs to queue"}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-black bg-gray-200 h-1.5 appearance-none border border-black cursor-pointer"
            />
            <div className="flex justify-between text-xs font-mono text-gray-500 mt-2">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={isShuffle ? "default" : "ghost"}
              size="icon"
              onClick={() => setIsShuffle(!isShuffle)}
              className={`border border-black transition-colors ${
                isShuffle 
                  ? "bg-black text-white hover:bg-neutral-800" 
                  : "bg-white text-black hover:bg-gray-100"
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevious}
              className="p-3 border border-black bg-white hover:bg-gray-100 text-black"
            >
              <SkipBack className="w-5 h-5" />
            </Button>
            
            <Button
              onClick={handleTogglePlay}
              className="w-16 h-16 border-2 border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </Button>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNext}
              className="p-3 border border-black bg-white hover:bg-gray-100 text-black"
            >
              <SkipForward className="w-5 h-5" />
            </Button>
            
            <Button
              variant={isMuted ? "default" : "ghost"}
              size="icon"
              onClick={handleToggleMute}
              className={`border border-black transition-colors ${
                isMuted 
                  ? "bg-black text-white hover:bg-neutral-800" 
                  : "bg-white text-black hover:bg-gray-100"
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Real-Time Audio Sync
      </footer>
    </div>
  );
};

// Add missing Wifi import
import { Wifi } from "lucide-react";

export default Room;