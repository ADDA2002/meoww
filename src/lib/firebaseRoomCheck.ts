import { db, ref, get } from "./firebase";

/**
 * Check if a room exists in Firebase by looking up the room state
 */
export const checkFirebaseRoomExists = async (code: string): Promise<boolean> => {
  if (!db) {
    console.warn("Firebase not available, allowing through");
    return true; // Allow through if Firebase isn't available (offline mode)
  }

  try {
    const roomRef = ref(db, `rooms/${code.trim().toLowerCase()}`);
    const snapshot = await get(roomRef);
    return snapshot.exists();
  } catch (err) {
    console.error("Room check error:", err);
    return false;
  }
};