const handleEnded = () => {
      console.log("[Room] ⏹️ audioElement ended event fired!");
      setSchedulerIsPlaying(false);
      // Auto-advance for host
      if (isHost && queueRef.current.length > 0) {
        const nextIdx = isShuffleRef.current
          ? Math.floor(Math.random() * queueRef.current.length)
          : (currentIndexRef.current + 1) % queueRef.current.length;

        setCurrentIndex(nextIdx);
        const nextTrack = queueRef.current[nextIdx];
        if (nextTrack && syncedClock.isReady()) {
          const targetTime = syncedClock.now() + 2000;
          syncScheduler.scheduleTrack(nextTrack, targetTime, `track-${nextIdx}`);
          syncScheduler.startCountdown();
        }
      }
    };