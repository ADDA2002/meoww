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
      if (!db) {
        console.warn("⚠️ Firebase not available, running in offline mode");
        this.connected = true;
        this.notifyConnectionState(true);
        resolve();
        return;
      }

      try {
        this.userRef = ref(db, `rooms/${this.roomCode}/users/${this.myId}`);
        this.stateRef = ref(db, `rooms/${this.roomCode}/state`);

        const userData = {
          id: this.myId,
          name: this.myName,
          isHost: this.isHost,
          joinedAt: serverTimestamp(),
          lastSeen: serverTimestamp()
        };

        set(this.userRef, userData).then(() => {
          onDisconnect(this.userRef).remove();

          this.connected = true;
          this.notifyConnectionState(true);
          console.log("✅ Firebase connected");

          // ✅ FIX: After writing my presence, MANUALLY query the users list
          // because onValue won't fire for my own write!
          this.broadcastInitialUsers();

          // Subscribe to ongoing user list changes (fires when OTHERS join/leave)
          onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
            const usersData = snapshot.val();
            if (usersData) {
              const users: RoomUser[] = Object.values(usersData);
              console.log("👥 Users changed:", users.map(u => u.name));
              this.notifyMessage({ type: "USER_LIST", users });
            }
          });

          // Subscribe to room state changes
          onValue(this.stateRef, (snapshot: any) => {
            const state = snapshot.val();
            if (state) {
              this.notifyStateChange(state);
            }
          });

          // Subscribe to sync messages from others
          onValue(ref(db, `rooms/${this.roomCode}/messages`), (snapshot: any) => {
            const messages = snapshot.val();
            if (messages) {
              Object.values(messages).forEach((msg: any) => {
                if (msg.senderId !== this.myId) {
                  const { senderId, senderName, timestamp, ...syncMsg } = msg;
                  this.notifyMessage(syncMsg as SyncMessage);
                }
              });
            }
          });

          // If host, initialize room state
          if (this.isHost) {
            set(this.stateRef, {
              roomCode: this.roomCode,
              hostId: this.myId,
              currentTrackIndex: 0,
              isPlaying: false,
              currentTime: 0,
              queue: [],
              timestamp: Date.now(),
              lastUpdated: serverTimestamp()
            });
          }

          resolve();
        }).catch((err) => {
          console.error("❌ Firebase write failed:", err);
          this.connected = true;
          this.notifyConnectionState(true);
          // Still broadcast initial users even on error
          this.broadcastInitialUsers();
          resolve();
        });

      } catch (err) {
        console.error("❌ Firebase setup error:", err);
        this.connected = true;
        this.notifyConnectionState(true);
        this.broadcastInitialUsers();
        resolve();
      }
    });
  }

  // ✅ NEW: Manually query users and broadcast the initial list
  // This fixes the onValue-not-firing-for-your-own-write bug
  private broadcastInitialUsers() {
    if (!db) {
      // Offline mode: just notify self
      this.notifyMessage({ type: "USER_LIST", users: [{
        id: this.myId,
        name: this.myName,
        isHost: this.isHost,
        joinedAt: Date.now()
      }]});
      return;
    }

    get(ref(db, `rooms/${this.roomCode}/users`)).then((snapshot: any) => {
      const usersData = snapshot.val();
      const users: RoomUser[] = usersData ? Object.values(usersData) : [{
        id: this.myId,
        name: this.myName,
        isHost: this.isHost,
        joinedAt: Date.now()
      }];
      console.log("👥 Initial users broadcast:", users.map(u => u.name));
      this.notifyMessage({ type: "USER_LIST", users });
    }).catch(() => {
      // Fallback: at least notify self
      this.notifyMessage({ type: "USER_LIST", users: [{
        id: this.myId,
        name: this.myName,
        isHost: this.isHost,
        joinedAt: Date.now()
      }]});
    });
  }

  send(msg: SyncMessage) {
    if (!db) return;

    const msgRef = push(ref(db, `rooms/${this.roomCode}/messages`), {
      ...msg,
      senderId: this.myId,
      senderName: this.myName,
      timestamp: serverTimestamp()
    });

    setTimeout(() => {
      if (msgRef) remove(msgRef).catch(() => {});
    }, 30000);
  }

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

  onMessage(callback: (msg: SyncMessage) => void) {
    this.listeners.push(callback);
  }

  onStateChange(callback: (state: FirebaseSyncState) => void) {
    this.stateListener.push(callback);
  }

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

  disconnect() {
    if (!db) return;

    if (this.userRef) {
      remove(this.userRef).catch(() => {});
    }

    if (this.isHost) {
      onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
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

  async getUsers(): Promise<RoomUser[]> {
    if (!db) return [{ id: this.myId, name: this.myName, isHost: this.isHost, joinedAt: Date.now() }];
    
    return new Promise((resolve) => {
      get(ref(db, `rooms/${this.roomCode}/users`)).then((snapshot: any) => {
        const usersData = snapshot.val();
        resolve(usersData ? Object.values(usersData) : []);
      }).catch(() => resolve([]));
    });
  }

  async getState(): Promise<FirebaseSyncState | null> {
    if (!db || !this.stateRef) return null;
    
    return new Promise((resolve) => {
      get(this.stateRef).then((snapshot: any) => {
        resolve(snapshot.val());
      }).catch(() => resolve(null));
    });
  }
}

export default FirebaseSignaling;