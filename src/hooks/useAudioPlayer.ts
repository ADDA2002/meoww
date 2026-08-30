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
  const isLoadedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const onTrackEndedRef = useRef(onTrackEnded);
  onTrackEndedRef.current = onTrackEnded;

  // Track change state to prevent race conditions
  const isTrackChangingRef = useRef(false);
  const pendingPlayRef = useRef(false);

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      if (isHost) {
        onTimeUpdate?.(time);
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleCanPlay = () => {
      isLoadedRef.current = true;
      isTrackChangingRef.current = false;
      
      // If we were asked to play while loading, do it now
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        audio.play().then(() => {
          setIsPlaying(true);
        }).catch(console.error);
      }
    };

    const handleWaiting = () => {
      isLoadedRef.current = false;
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onTrackEndedRef.current?.();
    };

    const handleError = (e: Event) => {
      console.error("Audio error:", e);
      isLoadedRef.current = false;
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, []);

  // Update track source when track changes - NO auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    // Mark that we're changing tracks
    isTrackChangingRef.current = true;
    pendingPlayRef.current = false;

    // Pause current playback when track changes
    audio.pause();
    isLoadedRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);

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

    // If track is still loading, mark that we want to play when ready
    if (isTrackChangingRef.current) {
      pendingPlayRef.current = true;
      return;
    }

    if (!isLoadedRef.current) {
      // Wait for audio to load
      await new Promise<void>((resolve) => {
        const checkLoaded = setInterval(() => {
          if (isLoadedRef.current) {
            clearInterval(checkLoaded);
            resolve();
          }
        }, 50);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkLoaded);
          resolve();
        }, 10000);
      });
    }
    
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Play failed:", err);
      }
    }
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    pendingPlayRef.current = false;
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
    isLoaded: isLoadedRef.current,
    setIsMuted,
    currentTime,
    duration,
    play,
    pause,
    seek,
    getCurrentTime,
  };
}