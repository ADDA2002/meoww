import { useRef, useState, useCallback, useEffect } from "react";
import type { Track } from "@/types/music";

interface UseAudioPlayerOptions {
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onTrackEnd?: () => void;
}

export function useAudioPlayer({
  queue,
  currentIndex,
  isHost,
  onPlayStateChange,
  onTimeUpdate,
  onDurationChange,
  onTrackEnd,
}: UseAudioPlayerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);

  const currentTrack = queue[currentIndex] ?? null;

  // Keep refs updated
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Handle mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Play a specific track
  const playTrack = useCallback((trackIndex: number, seekTime: number = 0) => {
    const audio = audioRef.current;
    if (!audio) return;

    const targetUrl = queue[trackIndex]?.url;
    if (!targetUrl) return;

    const startPlayback = () => {
      audio.currentTime = seekTime;
      audio.play().then(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
        onPlayStateChange?.(true);
      }).catch(console.error);
    };

    if (audio.src !== targetUrl) {
      audio.src = targetUrl;
      audio.load();
      audio.addEventListener("canplay", () => {
        audio.removeEventListener("canplay", arguments.callee);
        startPlayback();
      }, { once: true });
    } else {
      startPlayback();
    }
  }, [queue, onPlayStateChange]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      onPlayStateChange?.(false);
    } else {
      playTrack(currentIndexRef.current, audio.currentTime);
    }
  }, [isPlaying, playTrack, onPlayStateChange]);

  // Seek to time
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Playback from remote sync (listener only)
  const syncPlay = useCallback((trackIndex: number, seekTime: number, _timestamp: number) => {
    if (isHost) return; // Only listeners respond to sync

    const audio = audioRef.current;
    if (!audio) return;

    setCurrentIndex(trackIndex);
    currentIndexRef.current = trackIndex;

    const targetUrl = queue[trackIndex]?.url;
    if (!targetUrl) return;

    const startPlayback = () => {
      audio.currentTime = seekTime;
      audio.play().then(() => {
        setIsPlaying(true);
        isPlayingRef.current = true;
      }).catch(console.error);
    };

    if (audio.src !== targetUrl) {
      audio.src = targetUrl;
      audio.load();
      audio.addEventListener("canplay", () => {
        audio.removeEventListener("canplay", arguments.callee);
        startPlayback();
      }, { once: true });
    } else {
      startPlayback();
    }
  }, [isHost, queue]);

  // Sync pause from remote (listener only)
  const syncPause = useCallback((seekTime: number) => {
    if (isHost) return;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seekTime;
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, [isHost]);

  // Sync seek from remote (listener only)
  const syncSeek = useCallback((seekTime: number) => {
    if (isHost) return;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seekTime;
    }
  }, [isHost]);

  return {
    // State
    isPlaying,
    currentTime,
    duration,
    isMuted,
    currentTrack,
    // Ref for direct audio access
    audioRef,
    // Actions
    playTrack,
    togglePlay,
    seek,
    toggleMute,
    syncPlay,
    syncPause,
    syncSeek,
    // Internal state setter for sync
    setCurrentIndex: (idx: number) => {
      currentIndexRef.current = idx;
    },
  };
}

// Helper to set current index from outside
function setCurrentIndex(idx: number) {
  // This will be overridden by the hook return
}