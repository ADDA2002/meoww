export interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration?: number;
  cover?: string;
  addedBy?: string;
  isLocalFile?: boolean;
}

export interface RoomUser {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

/**
 * Anchor for clock-anchored playback.
 * The host captures (hostPerfNow, hostWallMs) at the exact moment playback
 * begins. Every listener converts this to its own local perf.now() reference
 * using the calibrated clock offset, then computes elapsed time by simple
 * subtraction — never needing another network message.
 */
export interface SyncAnchor {
  hostPerfNow: number;
  hostWallMs: number;
  offsetMs: number;
  rttMs: number;
}

export type SyncMessage =
  | { type: "JOIN"; user: RoomUser }
  | { type: "JOIN_REJECT"; reason: string; existingName: string }
  | { type: "NAME_UPDATE"; newName: string; originalName: string }
  | { type: "USER_LIST"; users: RoomUser[] }
  // Anchor-based playback. pause is no longer anchored — it's instantaneous.
  | { type: "PLAY"; anchor: SyncAnchor; trackIndex: number }
  | { type: "PAUSE"; perfNowAtPause: number; wallMsAtPause: number; trackIndex: number }
  | { type: "RESUME"; anchor: SyncAnchor; trackIndex: number }
  | { type: "SEEK"; anchor: SyncAnchor; trackIndex: number }
  | { type: "TRACK_CHANGE"; trackIndex: number; anchor: SyncAnchor }
  | { type: "UPDATE_QUEUE"; queue: Track[]; activeIndex: number }
  | { type: "REQUEST_SYNC"; requesterId: string }
  | { type: "HOST_TRANSFER"; newHostId: string }
  | { type: "CHAT"; sender: string; text: string; time: string }
  | { type: "PING_REQUEST"; pingId: number; hostT1: number }
  | { type: "PING_RESPONSE"; pingId: number; hostT1: number; listenerT2: number; listenerT3: number };