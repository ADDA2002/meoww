const handleNext = () => {
    if (queue.length === 0) return;
    const nextIdx = isShuffle
      ? Math.floor(Math.random() * queue.length)
      : (currentIndex + 1) % queue.length;
    
    setCurrentIndex(nextIdx);
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      setTimeout(() => {
        audio.play().then(() => {
          setIsPlaying(true);
          broadcast({ type: "PLAY", trackIndex: nextIdx, seekTime: 0, timestamp: Date.now() });
        }).catch(() => {});
      }, 5000);
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
      setTimeout(() => {
        audio.play().then(() => {
          setIsPlaying(true);
          broadcast({ type: "PLAY", trackIndex: prevIdx, seekTime: 0, timestamp: Date.now() });
        }).catch(() => {});
      }, 5000);
    }
  };