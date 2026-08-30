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
  private stateListeners: ((state: FirebaseSyncState) => void)[] = [];
  private connectionStateListener: ((connected: boolean) => void)[] = [];
  private userRef: any = null;
  private stateRef: any = null;
  private connected: boolean = false;
  private initialStateReceived: boolean = false;

  constructor(roomCode: string, myId: string, myName: string, isHost: boolean) {
    this.roomCode = roomCode.toLowerCase();
    this.myId = myId;
    this.myName = myName;
    this.isHost = isHost;
  }

  connect(): Promise<void> {
    return new Promise((resolve) => {
      console.log(`[FirebaseSignaling] ${this.myId} connecting to room ${this.roomCode} (host=${this.isHost})`);

      if (!db) {
        console.warn("⚠️ Firebase not available, running in offline mode");
        this.connected = true;
        this.notifyConnectionState(true);
        this.broadcastInitialUsers();
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

        console.log(`[FirebaseSignaling] Writing my presence to ${this.userRef.toString()}`);
        set(this.userRef, userData).then(() => {
          console.log(`[FirebaseSignaling] ✅ My presence written`);
          onDisconnect(this.userRef).remove();

          this.connected = true;
          this.notifyConnectionState(true);

          // Manually query users after writing (onValue won't fire for own write)
          console.log(`[FirebaseSignaling] Broadcasting initial users...`);
          this.broadcastInitialUsers();

          // Subscribe to user list changes
          console.log(`[FirebaseSignaling] Setting up onValue for users...`);
          onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
            const usersData = snapshot.val();
            console.log(`[FirebaseSignaling] 🔔 onValue users fired, data:`, usersData);
            if (usersData) {
              const users: RoomUser[] = Object.values(usersData);
              console.log(`[FirebaseSignaling] → Notifying USER_LIST:`, users.map(u => u.name));
              this.notifyMessage({ type: "USER_LIST", users });
            } else {
              console.log(`[FirebaseSignaling] → Notifying USER_LIST: []`);
              this.notifyMessage({ type: "USER_LIST", users: [] });
            }
          }, (error: any) => {
            console.error(`[FirebaseSignaling] ❌ onValue users error:`, error);
          });

          // Subscribe to room state changes
          onValue(this.stateRef, (snapshot: any) => {
            const state = snapshot.val();
            console.log(`[FirebaseSignaling] 🔔 onValue state fired:`, state ? "exists" : "null");
            
            // Track if this is the initial state
            const isInitial = !this.initialStateReceived;
            if (isInitial) {
              this.initialStateReceived = true;
            }
            
            if (state) {
              this.notifyStateChange(state, isInitial);
            }
          });

          // Subscribe to sync messages from others
          onValue(ref(db, `rooms/${this.roomCode}/messages`), (snapshot: any) => {
            const messages = snapshot.val();
            console.log(`[FirebaseSignaling] 🔔 onValue messages fired`);
            if (messages) {
              Object.values(messages).forEach((msg: any) => {
                if (msg.senderId !== this.myId) {
                  const { senderId, senderName, timestamp, ...syncMsg } = msg;
                  console.log(`[FirebaseSignaling] → Notifying sync message:`, syncMsg);
                  this.notifyMessage(syncMsg as SyncMessage);
                }
              });
            }
          });

          // If host, initialize room state
          if (this.isHost) {
            console.log(`[FirebaseSignaling] I am host, initializing room state`);
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

  private broadcastInitialUsers() {
    console.log(`[FirebaseSignaling] broadcastInitialUsers() called`);
    
    if (!db) {
      console.log(`[FirebaseSignaling] → Offline mode, notifying self only`);
      this.notifyMessage({ type: "USER_LIST", users: [{
        id: this.myId,
        name: this.myName,
        isHost: this.isHost,
        joinedAt: Date.now()
      }]});
      return;
    }

    console.log(`[FirebaseSignaling] → Querying Firebase for users at rooms/${this.roomCode}/users`);
    get(ref(db, `rooms/${this.roomCode}/users`)).then((snapshot: any) => {
      const usersData = snapshot.val();
      console.log(`[FirebaseSignaling] → get() returned:`, usersData);
      
      const users: RoomUser[] = usersData ? Object.values(usersData) : [{
        id: this.myId,
        name: this.myName,
        isHost: this.isHost,
        joinedAt: Date.now()
      }];
      
      console.log(`[FirebaseSignaling] → Notifying USER_LIST:`, users.map(u => `${u.name}(${u.id})`));
      this.notifyMessage({ type: "USER_LIST", users });
    }).catch((err) => {
      console.error(`[FirebaseSignaling] → get() failed:`, err);
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
    console.log(`[FirebaseSignaling] onMessage registered, listener count: ${this.listeners.length + 1}`);
    this.listeners.push(callback);
  }

  onStateChange(callback: (state: FirebaseSyncState) => void) {
    this.stateListeners.push(callback);
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionStateListener.push(callback);
  }

  private notifyMessage(msg: SyncMessage) {
    console.log(`[FirebaseSignaling] notifyMessage called, listeners: ${this.listeners.length}, msg.type: ${msg.type}`);
    this.listeners.forEach((cb, i) => {
      console.log(`[FirebaseSignaling] → Calling listener ${i}`);
      cb(msg);
    });
  }

  private notifyStateChange(state: FirebaseSyncState, isInitial: boolean = false) {
    this.stateListeners.forEach(cb => cb(state));
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