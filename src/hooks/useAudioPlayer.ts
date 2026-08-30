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
  }, []);

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

  // Stable play function - does NOT depend on isLoaded state
  // This prevents the auto-play useEffect from re-running when isLoaded changes
  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      // Check audio's ready state directly from the element, NOT from React state
      // This avoids triggering re-renders and stale closures
      if (audio.readyState < 3) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Audio load timeout"));
          }, 10000); // 10 second timeout

          const checkLoaded = () => {
            if (audio.readyState >= 3) {
              clearTimeout(timeout);
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
  }, []); // Empty deps - this function never changes reference

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