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
  | { type: "PLAY"; trackIndex: number; seekTime: number; timestamp: number }
  | { type: "PAUSE"; seekTime: number }
  | { type: "SEEK"; seekTime: number; timestamp: number }
  | { type: "UPDATE_QUEUE"; queue: Track[]; activeIndex: number }
  | { type: "REQUEST_SYNC"; requesterId: string }
  | { type: "HOST_TRANSFER"; newHostId: string }
  | { type: "CHAT"; sender: string; text: string; time: string }
  // ============= PREDICTIVE SYNC MESSAGES (NEW) =============
  | {
      type: "PREDICTIVE_PLAY";
      trackIndex: number;
      hostAudioCtxTime: number;
      hostWallClockTime: number;
      startOffset: number;
    }
  | {
      type: "PREDICTIVE_PAUSE";
      hostAudioCtxTime: number;
      hostWallClockTime: number;
      currentPosition: number;
    }
  | {
      type: "PREDICTIVE_SEEK";
      trackIndex?: number;
      hostAudioCtxTime: number;
      hostWallClockTime: number;
      seekTo: number;
    }
  | {
      type: "TIME_SYNC_REQUEST";
      senderId: string;
      clientSendTime: number;
    }
  | {
      type: "TIME_SYNC_RESPONSE";
      receiverId: string;
      clientSendTime: number;
      serverReceiveTime: number;
      serverSendTime: number;
    };