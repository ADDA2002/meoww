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

export type SyncMessage =
  | { type: "JOIN"; user: RoomUser }
  | { type: "JOIN_REJECT"; reason: string; existingName: string }
  | { type: "NAME_UPDATE"; newName: string; originalName: string }
  | { type: "USER_LIST"; users: RoomUser[] }
  // SYNC PROTOCOL v2: Epoch-based scheduling
  // All clients agree on a wall-clock timestamp (epoch) at which
  // playback should be at a specific position. This compensates for
  // network latency because all clients reference the same clock.
  | { type: "PLAY"; epoch: number; position: number; trackIndex: number }
  | { type: "PAUSE"; epoch: number; position: number }
  | { type: "SEEK"; epoch: number; position: number; trackIndex: number }
  | { type: "UPDATE_QUEUE"; queue: Track[]; activeIndex: number }
  | { type: "REQUEST_SYNC"; requesterId: string }
  | { type: "HOST_TRANSFER"; newHostId: string }
  | { type: "CHAT"; sender: string; text: string; time: string };