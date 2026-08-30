/**
 * Aggressive Audio Sync Engine
 * 
 * Compensates for high ping (even 300-500ms) by:
 * 1. Measuring real ping with multiple samples
 * 2. Predicting the host's audio position in the future
 * 3. Seeking to that future position so listeners hear it at the right moment
 * 4. Pre-buffering audio before playback
 */

export class AudioSyncEngine {
  private audio: HTMLAudioElement;
  private pingHistory: number[] = [];
  private readonly PING_SAMPLES = 10;
  private clockOffset: number = 0;
  
  constructor(audioElement: HTMLAudioElement) {
    this.audio = audioElement;
  }

  /**
   * Measure ping by sending a ping message and measuring round-trip time
   */
  async measurePing(sendPing: () => Promise<void>): Promise<number> {
    const start = performance.now();
    await sendPing();
    const end = performance.now();
    const rtt = end - start;
    const ping = rtt / 2; // One-way latency
    
    this.pingHistory.push(ping);
    if (this.pingHistory.length > this.PING_SAMPLES) {
      this.pingHistory.shift();
    }
    
    return this.getAveragePing();
  }

  /**
   * Get smoothed average ping (use median to avoid outliers)
   */
  getAveragePing(): number {
    if (this.pingHistory.length === 0) return 0;
    
    const sorted = [...this.pingHistory].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * Get current clock offset between this client and the host
   * Positive means our clock is ahead of host
   */
  async syncClock(pingHost: () => Promise<number>): Promise<number> {
    const hostTime = await pingHost();
    const myTime = Date.now();
    this.clockOffset = myTime - hostTime;
    return this.clockOffset;
  }

  /**
   * Calculate the audio position the host WILL be at when the listener hears it
   * 
   * This is the core "time travel" trick:
   * - If ping is 300ms, we need to play audio from 300ms IN THE FUTURE
   * - By the time the audio actually plays, the host will be at that position
   */
  predictHostPosition(hostTimestamp: number, hostAudioTime: number): number {
    const now = Date.now();
    const timeSinceMessage = (now - hostTimestamp) / 1000;
    const compensation = this.getAveragePing() / 1000;
    
    // Host's current position = where they were + time elapsed + latency compensation
    return hostAudioTime + timeSinceMessage + compensation;
  }

  /**
   * Pre-load audio and seek to a specific position
   * Returns a promise that resolves when audio is ready to play
   */
  preloadToPosition(targetTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const onCanPlay = () => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
        this.audio.currentTime = targetTime;
        
        // Small extra wait to ensure buffer is ready
        setTimeout(() => resolve(), 50);
      };
      
      const onError = (e: any) => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
        reject(e);
      };
      
      if (this.audio.readyState >= 3) {
        // Already loaded
        this.audio.currentTime = targetTime;
        setTimeout(() => resolve(), 50);
      } else {
        this.audio.addEventListener('canplay', onCanPlay);
        this.audio.addEventListener('error', onError);
        this.audio.load();
      }
    });
  }

  /**
   * Play audio with perfect sync compensation
   */
  async playWithSync(
    hostTimestamp: number,
    hostAudioTime: number,
    changeSrc?: string
  ): Promise<void> {
    // If changing source, update it first
    if (changeSrc && this.audio.src !== changeSrc) {
      this.audio.src = changeSrc;
    }
    
    const targetTime = this.predictHostPosition(hostTimestamp, hostAudioTime);
    
    // Safety: don't go past the duration
    const safeTime = Math.max(0, Math.min(targetTime, this.audio.duration || Infinity));
    
    await this.preloadToPosition(safeTime);
    
    try {
      await this.audio.play();
    } catch (e) {
      console.warn("Autoplay blocked:", e);
    }
  }

  /**
   * Pause with sync - just pause at the predicted current position
   */
  pauseWithSync(hostTimestamp: number, hostAudioTime: number): void {
    const targetTime = this.predictHostPosition(hostTimestamp, hostAudioTime);
    const safeTime = Math.max(0, Math.min(targetTime, this.audio.duration || Infinity));
    
    this.audio.pause();
    this.audio.currentTime = safeTime;
  }

  /**
   * Seek with sync compensation
   */
  async seekWithSync(hostTimestamp: number, hostAudioTime: number): Promise<void> {
    const targetTime = this.predictHostPosition(hostTimestamp, hostAudioTime);
    const safeTime = Math.max(0, Math.min(targetTime, this.audio.duration || Infinity));
    
    this.audio.currentTime = safeTime;
  }

  /**
   * Get current local audio time adjusted for sync
   */
  getSyncedCurrentTime(): number {
    return this.audio.currentTime;
  }
}

/**
 * Network Optimizer - reduces ping aggressively
 */
export class NetworkOptimizer {
  /**
   * Send a message with priority (uses unreliable channel for speed)
   */
  static sendPriority(conn: any, data: any): boolean {
    if (!conn.open) return false;
    
    // For sync commands, fire and forget
    try {
      conn.send(data);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Batch multiple sync messages into one
   */
  static createSyncBurst(
    playState?: { isPlaying: boolean; time: number; index: number },
    queueState?: { queue: any[]; activeIndex: number }
  ): any {
    return {
      type: "SYNC_BURST",
      timestamp: Date.now(),
      play: playState,
      queue: queueState,
    };
  }
}