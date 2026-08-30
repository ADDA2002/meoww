const handlePrevious = () => {
    if (queue.length === 0) return;
    
    // If we're more than 3 seconds into the current track, restart it instead of going back
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: currentIndex, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
      return;
    }
    
    const prevIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex - 1 + queue.length) % queue.length;
    
    setCurrentIndex(prevIdx);
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
      }).catch(() => {});
    }
  };