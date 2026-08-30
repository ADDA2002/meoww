import { db, ref, onValue, set, push, remove, onDisconnect, serverTimestamp, get } from "./firebase";
import { Track, RoomUser, SyncMessage } from "@/types/music";

export interface FirebaseSyncState {
  roomCode: string;
  hostId: string;
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  queue: Track[];
  lastUpdateId: string;
  lastUpdated: number;
}

class FirebaseSignaling {
  private roomCode: string;
  private myId: string;
  private myName: string;
  private isHost: boolean;
  private listeners: ((msg: SyncMessage) => void)[] = [];
  private stateListener: ((state: FirebaseSyncState | null) => void)[] = [];
  private connectionStateListener: ((connected: boolean) => void)[] = [];
  private sessionEndedListener: (() => void)[] = [];
  private userRef: any = null;
  private stateRef: any = null;
  private roomRef: any = null;
  private connected: boolean = false;
  private isDestroyed: boolean = false;
  
  private lastProcessedUpdateId: string = "";
  private unsubscribers: (() => void)[] = [];

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
        this.roomRef = ref(db, `rooms/${this.roomCode}`);
        this.userRef = ref(db, `rooms/${this.roomCode}/users/${this.myId}`);
        this.stateRef = ref(db, `rooms/${this.roomCode}/state`);

        const userData = {
          id: this.myId,
          name: this.myName,
          isHost: this.isHost,
          joinedAt: serverTimestamp(),
          lastSeen: serverTimestamp()
        };

        if (this.isHost) {
          onDisconnect(this.userRef).remove();
          onDisconnect(this.stateRef).remove();
          onDisconnect(this.roomRef).remove();
        } else {
          onDisconnect(this.userRef).remove();
        }

        set(this.userRef, userData).then(() => {
          console.log(`[FirebaseSignaling] ✅ My presence written`);
          this.connected = true;
          this.notifyConnectionState(true);

          this.setupListeners();

          if (this.isHost) {
            console.log(`[FirebaseSignaling] I am host, initializing room state`);
            set(this.stateRef, {
              roomCode: this.roomCode,
              hostId: this.myId,
              currentTrackIndex: 0,
              isPlaying: false,
              currentTime: 0,
              queue: [],
              lastUpdateId: `init-${Date.now()}`,
              lastUpdated: Date.now()
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

  private setupListeners() {
    const roomUnsub = onValue(this.roomRef, (snapshot: any) => {
      if (!snapshot.exists() && !this.isDestroyed && !this.isHost) {
        this.notifySessionEnded();
      }
    }, (error: any) => {
      console.error(`[FirebaseSignaling] ❌ onValue room error:`, error);
    });
    this.unsubscribers.push(() => roomUnsub());

    const usersUnsub = onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
      const usersData = snapshot.val();
      
      if (!this.isHost && usersData) {
        const hostStillPresent = Object.values(usersData).some((u: any) => u.isHost === true && u.id !== this.myId);
        if (!hostStillPresent) {
          this.notifySessionEnded();
          return;
        }
      }
      
      if (usersData) {
        const users: RoomUser[] = Object.values(usersData);
        this.notifyMessage({ type: "USER_LIST", users });
      } else {
        this.notifyMessage({ type: "USER_LIST", users: [] });
      }
    }, (error: any) => {
      console.error(`[FirebaseSignaling] ❌ onValue users error:`, error);
    });
    this.unsubscribers.push(() => usersUnsub());

    const stateUnsub = onValue(this.stateRef, (snapshot: any) => {
      const state = snapshot.val();
      if (state) {
        if (state.lastUpdateId === this.lastProcessedUpdateId) {
          return;
        }
        this.lastProcessedUpdateId = state.lastUpdateId || "";
        console.log(`[FirebaseSignaling] 🔔 State update:`, state.lastUpdateId, "isPlaying:", state.isPlaying, "trackIdx:", state.currentTrackIndex);
        this.notifyStateChange(state);
      }
    }, (error: any) => {
      console.error(`[FirebaseSignaling] ❌ onValue state error:`, error);
    });
    this.unsubscribers.push(() => stateUnsub());
  }

  private broadcastInitialUsers() {
    if (!db) {
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
      
      this.notifyMessage({ type: "USER_LIST", users });
    }).catch((err) => {
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
    if (!db || !this.stateRef) return;

    const updateId = `${this.myId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    set(this.stateRef, {
      ...updates,
      roomCode: this.roomCode,
      hostId: this.isHost ? this.myId : undefined,
      lastUpdateId: updateId,
      lastUpdated: Date.now()
    });
    
    this.lastProcessedUpdateId = updateId;
  }

  onMessage(callback: (msg: SyncMessage) => void) {
    this.listeners.push(callback);
  }

  onStateChange(callback: (state: FirebaseSyncState | null) => void) {
    this.stateListener.push(callback);
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionStateListener.push(callback);
  }

  onSessionEnded(callback: () => void) {
    this.sessionEndedListener.push(callback);
  }

  private notifyMessage(msg: SyncMessage) {
    this.listeners.forEach((cb) => cb(msg));
  }

  private notifyStateChange(state: FirebaseSyncState | null) {
    this.stateListener.forEach(cb => cb(state));
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionStateListener.forEach(cb => cb(connected));
  }

  private notifySessionEnded() {
    this.isDestroyed = true;
    this.connected = false;
    this.notifyConnectionState(false);
    this.sessionEndedListener.forEach((cb) => cb());
  }

  disconnect() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    
    this.unsubscribers.forEach(unsub => {
      try { unsub(); } catch (e) { console.warn("Error unsubscribing:", e); }
    });
    this.unsubscribers = [];

    if (!db) return;

    if (this.userRef) {
      remove(this.userRef).catch(() => {});
    }

    if (this.isHost && this.roomRef) {
      remove(this.roomRef).catch(() => {});
      this.notifySessionEnded();
    } else {
      get(ref(db, `rooms/${this.roomCode}/users`)).then((snapshot: any) => {
        const usersData = snapshot.val();
        if (usersData) {
          const hostPresent = Object.values(usersData).some((u: any) => u.isHost === true && u.id !== this.myId);
          if (!hostPresent) {
            this.notifySessionEnded();
          }
        }
      }).catch(() => {});
    }
  }

  isConnected(): boolean {
    return this.connected && !this.isDestroyed;
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