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
  playTrack: (trackIndex: number, seekTime?: number) => void;
  syncPlay: (trackIndex: number, seekTime: number, timestamp: number) => void;
  syncPause: (seekTime: number) => void;
  syncSeek: (seekTime: number) => void;
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

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const playTrack = useCallback((trackIndex: number, seekTime: number = 0) => {
    const audio = audioRef.current;
    if (!audio) return;

    const targetUrl = queueRef.current[trackIndex]?.url;
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
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    } else {
      playTrack(currentIndexRef.current, audio.currentTime);
    }
  }, [isPlaying, playTrack]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const syncPlay = useCallback((trackIndex: number, seekTime: number, _timestamp: number) => {
    if (isHostRef.current) return;

    const audio = audioRef.current;
    if (!audio) return;

    const targetUrl = queueRef.current[trackIndex]?.url;
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
  }, []);

  const syncPause = useCallback((seekTime: number) => {
    if (isHostRef.current) return;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seekTime;
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, []);

  const syncSeek = useCallback((seekTime: number) => {
    if (isHostRef.current) return;

    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seekTime;
    }
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
    playTrack,
    syncPlay,
    syncPause,
    syncSeek,
  };
}