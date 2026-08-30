import { useState, useEffect, useRef, useCallback } from "react";
import { Track } from "@/types/music";

interface UseAudioPlayerOptions {
  track: Track | null;
  isHost: boolean;
  onTimeUpdate?: (time: number) => void;
  onTrackEnded?: () => void;
}

export function useAudioPlayer({ track, isHost, onTimeUpdate, onTrackEnded }: UseAudioPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      if (isHost) {
        onTimeUpdate?.(audio.currentTime);
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("canplay", () => {
      setIsLoaded(true);
    });

    audio.addEventListener("waiting", () => {
      setIsLoaded(false);
    });

    audio.addEventListener("pause", () => {
      setIsPlaying(false);
    });

    audio.addEventListener("play", () => {
      setIsPlaying(true);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
      onTrackEndedRef.current?.();
    });

    audio.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      setIsLoaded(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [isHost]);

  // Update track source when track changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    // Reset state for new track
    setIsLoaded(false);
    setCurrentTime(0);
    setDuration(0);

    audio.src = track.url;
    audio.load();
  }, [track]);

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Stable play function - no dependencies to prevent re-renders triggering it
  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Check audio's ready state directly from the element, not from React state
      // This prevents the play function from getting new references when isLoaded changes
      if (audio.readyState < 3) {
        await new Promise<void>((resolve) => {
          const checkLoaded = () => {
            if (audio.readyState >= 3) {
              resolve();
            } else {
              setTimeout(checkLoaded, 50);
            }
          };
          checkLoaded();
        });
      }

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Play failed:", err);
      setIsPlaying(false);
    }
  }, []); // Empty dependencies - stable reference

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const getCurrentTime = useCallback(() => {
    return audioRef.current?.currentTime || 0;
  }, []);

  return {
    isPlaying,
    isMuted,
    isLoaded,
    setIsMuted,
    currentTime,
    duration,
    play,
    pause,
    seek,
    getCurrentTime,
  };
}