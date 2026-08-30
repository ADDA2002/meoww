const handleNext = () => {
    if (queue.length === 0) return;
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;
    
    setCurrentIndex(nextIdx);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        // Pause first, then play with new track (small delay for sync)
        broadcast({ type: "PAUSE", seekTime: 0 });
        setTimeout(() => {
          broadcast({
            type: "PLAY",
            trackIndex: nextIdx,
            seekTime: 0,
            timestamp: Date.now(),
          });
        }, 100);
      }).catch(() => {});
    }
  };

  const handlePrevious = () => {
    if (queue.length === 0) return;
    const prevIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex - 1 + queue.length) % queue.length;
    
    setCurrentIndex(prevIdx);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      audio.play().then(() => {
        setIsPlaying(true);
        broadcast({ type: "PAUSE", seekTime: 0 });
        setTimeout(() => {
          broadcast({
            type: "PLAY",
            trackIndex: prevIdx,
            seekTime: 0,
            timestamp: Date.now(),
          });
        }, 100);
      }).catch(() => {});
    }
  };