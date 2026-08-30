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
  private stateListener: ((state: FirebaseSyncState | null) => void)[] = [];
  private connectionStateListener: ((connected: boolean) => void)[] = [];
  private sessionEndedListener: (() => void)[] = [];
  private userRef: any = null;
  private stateRef: any = null;
  private roomRef: any = null;
  private connected: boolean = false;
  private isDestroyed: boolean = false;

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

        console.log(`[FirebaseSignaling] Writing my presence to ${this.userRef.toString()}`);
        
        // Set up onDisconnect BEFORE writing to ensure it registers
        if (this.isHost) {
          // Host: room exists as long as host is connected
          onDisconnect(this.userRef).remove();
          onDisconnect(this.stateRef).remove();
          onDisconnect(this.roomRef).remove();
        } else {
          // Non-host: just remove their presence
          onDisconnect(this.userRef).remove();
        }

        set(this.userRef, userData).then(() => {
          console.log(`[FirebaseSignaling] ✅ My presence written`);
          this.connected = true;
          this.notifyConnectionState(true);

          // Manually query users after writing (onValue won't fire for own write)
          console.log(`[FirebaseSignaling] Broadcasting initial users...`);
          this.broadcastInitialUsers();

          // Subscribe to room deletion (for non-host users - detects when host leaves)
          if (!this.isHost) {
            console.log(`[FirebaseSignaling] Setting up room deletion listener for non-host...`);
            onValue(this.roomRef, (snapshot: any) => {
              if (!snapshot.exists() && !this.isDestroyed) {
                console.log(`[FirebaseSignaling] 🔔 Room deleted (host left), notifying session ended`);
                this.notifySessionEnded();
              }
            }, (error: any) => {
              console.error(`[FirebaseSignaling] ❌ onValue room error:`, error);
            });
          }

          // Subscribe to user list changes
          console.log(`[FirebaseSignaling] Setting up onValue for users...`);
          onValue(ref(db, `rooms/${this.roomCode}/users`), (snapshot: any) => {
            const usersData = snapshot.val();
            console.log(`[FirebaseSignaling] 🔔 onValue users fired, data:`, usersData);
            
            // Check if host is still in the room
            if (!this.isHost && usersData) {
              const hostStillPresent = Object.values(usersData).some((u: any) => u.isHost === true);
              if (!hostStillPresent) {
                console.log(`[FirebaseSignaling] 🔔 Host no longer present, room should end`);
                this.notifySessionEnded();
                return;
              }
            }
            
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
            if (state) {
              this.notifyStateChange(state);
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
    if (!db || !this.stateRef) return;

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

  onStateChange(callback: (state: FirebaseSyncState | null) => void) {
    this.stateListener.push(callback);
  }

  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionStateListener.push(callback);
  }

  onSessionEnded(callback: () => void) {
    console.log(`[FirebaseSignaling] onSessionEnded registered`);
    this.sessionEndedListener.push(callback);
  }

  private notifyMessage(msg: SyncMessage) {
    console.log(`[FirebaseSignaling] notifyMessage called, listeners: ${this.listeners.length}, msg.type: ${msg.type}`);
    this.listeners.forEach((cb, i) => {
      console.log(`[FirebaseSignaling] → Calling listener ${i}`);
      cb(msg);
    });
  }

  private notifyStateChange(state: FirebaseSyncState | null) {
    this.stateListener.forEach(cb => cb(state));
  }

  private notifyConnectionState(connected: boolean) {
    this.connectionStateListener.forEach(cb => cb(connected));
  }

  private notifySessionEnded() {
    console.log(`[FirebaseSignaling] notifySessionEnded called, listeners: ${this.sessionEndedListener.length}`);
    this.isDestroyed = true;
    this.connected = false;
    this.notifyConnectionState(false);
    this.sessionEndedListener.forEach((cb, i) => {
      console.log(`[FirebaseSignaling] → Calling session ended listener ${i}`);
      cb();
    });
  }

  disconnect() {
    console.log(`[FirebaseSignaling] disconnect() called by ${this.myId} (host=${this.isHost})`);
    
    if (this.isDestroyed) {
      console.log(`[FirebaseSignaling] Already destroyed, skipping`);
      return;
    }

    if (!db) return;

    // Remove own user presence
    if (this.userRef) {
      remove(this.userRef).catch(() => {});
    }

    // If host disconnects, remove the entire room (this will trigger session ended for others)
    if (this.isHost) {
      console.log(`[FirebaseSignaling] Host leaving, removing entire room`);
      remove(this.roomRef).catch(() => {});
      this.notifySessionEnded();
    } else {
      // For non-host, just wait for onDisconnect to clean up
      // Check if host is still present
      console.log(`[FirebaseSignaling] Non-host leaving, checking if host remains`);
      get(ref(db, `rooms/${this.roomCode}/users`)).then((snapshot: any) => {
        const usersData = snapshot.val();
        if (usersData) {
          const hostPresent = Object.values(usersData).some((u: any) => u.isHost === true && u.id !== this.myId);
          if (!hostPresent) {
            console.log(`[FirebaseSignaling] Host no longer present after non-host disconnect`);
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