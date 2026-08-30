import { useEffect, useRef, useState } from "react";
import { Track } from "@/types/music";

interface UseAudioPlayerOptions {
  queue: Track[];
  currentIndex: number;
  isShuffle: boolean;
  onTrackChange: (index: number) => void;
  onPlay: (trackIndex: number, seekTime: number) => void;
  onPause: (seekTime: number) => void;
  onSeek: (seekTime: number) => void;
  onAutoNext: () => number; // returns next index
}

export function useAudioPlayer({
  queue,
  currentIndex,
  isShuffle,
  onTrackChange,
  onPlay,
  onPause,
  onSeek,
  onAutoNext,
}: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);

  const currentTrack = queue[currentIndex] || null;

  // Sync mute state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Reset loaded state when track changes
  useEffect(() => {
    setAudioLoaded(false);
  }, [currentTrack?.url]);

  const playTrack = (trackIndex: number, seekTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    onTrackChange(trackIndex);

    const targetUrl = queue[trackIndex]?.url;
    if (!targetUrl) return;

    const startPlayback = () => {
      audio.currentTime = seekTime;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            onPlay(trackIndex, seekTime);
          })
          .catch((err) => {
            console.log("Play attempt failed, retrying:", err);
            setTimeout(() => {
              audio
                .play()
                .then(() => {
                  setIsPlaying(true);
                  onPlay(trackIndex, seekTime);
                })
                .catch(console.error);
            }, 300);
          });
      }
    };

    if (audio.src !== targetUrl) {
      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      };
      audio.addEventListener("canplay", onCanPlay);
      audio.src = targetUrl;
      audio.load();
    } else if (audio.readyState >= 2) {
      startPlayback();
    } else {
      const onCanPlay = () => {
        audio.removeEventListener("canplay", onCanPlay);
        startPlayback();
      };
      audio.addEventListener("canplay", onCanPlay);
      audio.load();
    }
  };

  const pause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
    onPause(audio.currentTime);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      pause();
    } else {
      playTrack(currentIndex, audio.currentTime);
    }
  };

  const goToNext = () => {
    if (queue.length === 0) return;
    let nextIdx = 0;
    if (isShuffle) {
      if (queue.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === currentIndex);
      }
    } else {
      nextIdx = (currentIndex + 1) % queue.length;
    }
    playTrack(nextIdx, 0);
  };

  const goToPrevious = () => {
    if (queue.length === 0) return;
    let prevIdx = 0;
    if (isShuffle) {
      if (queue.length > 1) {
        do {
          prevIdx = Math.floor(Math.random() * queue.length);
        } while (prevIdx === currentIndex);
      }
    } else {
      prevIdx = (currentIndex - 1 + queue.length) % queue.length;
    }
    playTrack(prevIdx, 0);
  };

  const seekTo = (time: number, broadcast: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
    if (broadcast) {
      onSeek(time);
    }
  };

  const handleEnded = () => {
    const nextIdx = onAutoNext();
    if (nextIdx >= 0) {
      playTrack(nextIdx, 0);
    }
  };

  return {
    audioRef,
    currentTrack,
    isPlaying,
    isMuted,
    currentTime,
    duration,
    audioLoaded,
    setIsMuted,
    setDuration,
    setAudioLoaded,
    togglePlay,
    goToNext,
    goToPrevious,
    playTrack,
    seekTo,
    handleEnded,
    setCurrentTime,
  };
}