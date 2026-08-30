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
  | { type: "NAME_UPDATE"; newName: string; originalName: string }
  | { type: "USER_LIST"; users: RoomUser[] }
  | { type: "PLAY"; trackIndex: number; seekTime: number; timestamp: number }
  | { type: "PAUSE"; seekTime: number }
  | { type: "SEEK"; seekTime: number; timestamp: number }
  | { type: "UPDATE_QUEUE"; queue: Track[]; activeIndex: number };