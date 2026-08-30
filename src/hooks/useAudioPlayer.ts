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
  const pendingSeekRef = useRef<number | null>(null);
  const generationRef = useRef(0);

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
      setIsLoaded(true);
      // Apply pending seek if any
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
    });

    audio.addEventListener("canplay", () => {
      setIsLoaded(true);
      // Apply pending seek if any
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
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

    // Increment generation to invalidate any in-flight play() calls
    generationRef.current += 1;
    pendingSeekRef.current = null;

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

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const myGeneration = generationRef.current;

    try {
      // Wait for audio to be ready if not loaded
      if (!isLoaded) {
        await new Promise<void>((resolve) => {
          const checkLoaded = () => {
            // If generation changed, track changed, abort
            if (myGeneration !== generationRef.current) {
              resolve();
              return;
            }
            if (audio.readyState >= 3) { // HAVE_FUTURE_DATA
              resolve();
            } else {
              setTimeout(checkLoaded, 50);
            }
          };
          checkLoaded();
        });
      }

      // Check if generation changed while we were waiting
      if (myGeneration !== generationRef.current) {
        return; // Track changed, this play() is stale
      }

      // Apply pending seek right before playing
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Play failed:", err);
      setIsPlaying(false);
    }
  }, [isLoaded]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // If audio is loaded, seek immediately
    if (audio.readyState >= 1) {
      audio.currentTime = time;
      setCurrentTime(time);
    } else {
      // Otherwise, store the seek to apply when loaded
      pendingSeekRef.current = time;
    }
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