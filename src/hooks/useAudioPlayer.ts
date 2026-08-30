import { useRef, useState, useCallback, useEffect } from "react";
import type { Track } from "@/types/music";

interface UseAudioPlayerOptions {
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isMuted: boolean;
  currentTrack: Track | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  togglePlay: () => void;
  seek: (time: number) => void;
  toggleMute: () => void;
  setCurrentTime: (time: number) => void;
  setDuration: (dur: number) => void;
  setIsPlaying: (playing: boolean) => void;
}

export function useAudioPlayer({
  queue,
  currentIndex,
  isHost,
}: UseAudioPlayerOptions): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);
  const queueRef = useRef(queue);
  const isHostRef = useRef(isHost);

  const currentTrack = queue[currentIndex] ?? null;

  // Keep refs updated
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Handle mute
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingRef.current) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      const targetUrl = queueRef.current[currentIndexRef.current]?.url;
      if (!targetUrl) return;

      const startPlayback = () => {
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
    }
  }, []);

  // Seek to time
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    isMuted,
    currentTrack,
    audioRef,
    togglePlay,
    seek,
    toggleMute,
    setCurrentTime,
    setDuration,
    setIsPlaying,
  };
}