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
  | { type: "USER_LIST"; users: RoomUser[] };