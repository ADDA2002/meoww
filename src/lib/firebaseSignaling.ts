import { db, ref, onValue, set, push, remove, onDisconnect, serverTimestamp, get } from "./firebase";
import { Track, RoomUser, SyncMessage } from "@/types/music";

export interface FirebaseSyncState {
  roomCode: string;
  hostId: string;
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  queue: Track[];
  users: RoomUser[];
  lastUpdated: number;
  timestamp: number;
}

export interface FirebaseChatMessage {
  id: string;
  sender: string;
  text: string;
  time: string;
}

class FirebaseSignaling {
  private roomCode: string;
  private myId: string;
  private myName: string;
  private isHost: boolean;
  private listeners: ((msg: SyncMessage) => void)[] = [];
  private stateListener: ((state: FirebaseSyncState) => void)[] = [];
  private connectionStateListener: ((connected: boolean) => void)[] = [];
  private roomRef: any = null;
  private userRef: any = null;
  private stateRef: any = null;
  private connected: boolean = false;

  constructor(roomCode: string, myId: string, myName: string, isHost: boolean) {
    this.roomCode = roomCode.toLowerCase();
    this.myId = myId;
    this.myName = myName;
    this.isHost = isHost;
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      // Firebase not available - run in offline mode
      if (!db) {
        console.warn("⚠️ Firebase not available, running in offline mode");
        this.connected = true;
        this.notifyConnectionState(true);
        resolve();
        return;
      }

      try {
        this.roomRef = ref(db, `rooms/${this.roomCode}`);
        this.userRef = ref(db, `rooms/${this.roomCode}/users/${this.myId}`);
        this.stateRef = ref(db, `rooms/${this.roomCode}/state`);

        // Set up my user presence
        const userData = {
          id: this.myId,
          name: this.myName,
          isHost: this.isHost,
          joinedAt: Date.now(),
          lastSeen: serverTimestamp()
        };

        set(this.userRef, userData).then(() => {
          // Auto-remove on disconnect
          onDisconnect(this.userRef).remove();
          
          this.connected = true;
          this.notifyConnectionState(true);
          
          console.log("✅ Firebase signaling connected");
          
          // If I'm the host, initialize state if it doesn't exist
          if (this.isHost) {
            this.initializeRoomState();
          }
          
          // Subscribe to room state changes
          onValue(this.stateRef, (snapshot: any) => {
            const state = snapshot.val();
            if (state) {
              this.notifyStateChange(state);
            }
          });

          // Subscribe to user list changes
          onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
            const usersData = snapshot.val();
            if (usersData) {
              const users: RoomUser[] = Object.values(usersData);
              this.notifyMessage({ type: "USER_LIST", users });
            }
          });

          // Check if room exists and get host info
          onValue(this.roomRef, (snapshot: any) => {
            const roomData = snapshot.val();
            if (roomData && roomData.state) {
              this.notifyStateChange(roomData.state);
            }
          }, (error: any) => {
            console.warn("Room state read error:", error);
          });

          resolve();
        }).catch((err) => {
          console.error("❌ Firebase write failed:", err);
          // Still allow offline mode
          this.connected = true;
          this.notifyConnectionState(true);
          resolve();
        });

        // Handle disconnection
        this.roomRef?.onDisconnect?.(() => {
          this.connected = false;
          this.notifyConnectionState(false);
        });
      } catch (err) {
        console.error("❌ Firebase setup error:", err);
        // Still allow offline mode
        this.connected = true;
        this.notifyConnectionState(true);
        resolve();
      }
    });
  }

  private initializeRoomState() {
    if (!db || !this.stateRef) return;
    
    set(this.stateRef, {
      roomCode: this.roomCode,
      hostId: this.myId,
      currentTrackIndex: 0,
      isPlaying: false,
      currentTime: 0,
      queue: [],
      users: [],
      timestamp: Date.now(),
      lastUpdated: serverTimestamp()
    });
  }

  // Send a sync message
  send(msg: SyncMessage) {
    if (!db) return;

    const msgRef = push(ref(db, `rooms/${this.roomCode}/messages`), {
      ...msg,
      senderId: this.myId,
      senderName: this.myName,
      timestamp: serverTimestamp()
    });

    // Auto-delete after 30 seconds to keep DB clean
    setTimeout(() => {
      if (msgRef) {
        remove(msgRef).catch(() => {});
      }
    }, 30000);
  }

  // Update room state (host only)
  updateState(updates: Partial<FirebaseSyncState>) {
    if (!db || !this.stateRef || !this.isHost) return;

    set(this.stateRef, {
      ...updates,
      roomCode: this.roomCode,
      hostId: this.myId,
      timestamp: Date.now(),
      lastUpdated: serverTimestamp()
    });
  }

  // Subscribe to sync messages
  onMessage(callback: (msg: SyncMessage) => void) {
    this.listeners.push(callback);
    
    if (!db) return;
    
    const messagesRef = ref(db, `rooms/${this.roomCode}/messages`);
    onValue(messagesRef, (snapshot: any) => {
      const messages = snapshot.val();
      if (messages) {
        Object.values(messages).forEach((msg: any) => {
          if (msg.senderId !== this.myId) {
            // Remove internal fields before sending
            const { senderId, senderName, timestamp, ...syncMsg } = msg;
            callback(syncMsg as SyncMessage);
          }
        });
      }
    });
  }

  // Subscribe to state changes
  onStateChange(callback: (state: FirebaseSyncState) => void) {
    this.stateListener.push(callback);
  }

  // Subscribe to connection state
  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionStateListener.push(callback);
  }

  private notifyMessage(msg: SyncMessage) {
    this.listeners.forEach(cb => cb(msg));
  }

  private notifyStateChange(state: FirebaseSyncState) {
    this.stateListener.forEach(cb => cb(state));
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionStateListener.forEach(cb => cb(connected));
  }

  // Leave room and cleanup
  disconnect() {
    if (!db) return;

    // Remove my user entry
    if (this.userRef) {
      remove(this.userRef).catch(() => {});
    }

    // If I'm the host and no one else, delete the room
    if (this.isHost) {
      const usersRef = ref(db, `rooms/${this.roomCode}/users`);
      onValue(usersRef, (snapshot: any) => {
        const users = snapshot.val();
        if (!users || Object.keys(users).length <= 1) {
          remove(ref(db, `rooms/${this.roomCode}`)).catch(() => {});
        }
      }, { onlyOnce: true } as any);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Get current users in room
  async getUsers(): Promise<RoomUser[]> {
    if (!db) return [];
    
    return new Promise((resolve) => {
      const usersRef = ref(db, `rooms/${this.roomCode}/users`);
      onValue(usersRef, (snapshot: any) => {
        const usersData = snapshot.val();
        resolve(usersData ? Object.values(usersData) : []);
      }, { onlyOnce: true } as any);
    });
  }

  // Get current room state
  async getState(): Promise<FirebaseSyncState | null> {
    if (!db || !this.stateRef) return null;
    
    return new Promise((resolve) => {
      onValue(this.stateRef, (snapshot: any) => {
        resolve(snapshot.val());
      }, { onlyOnce: true } as any);
    });
  }
}

export default FirebaseSignaling;