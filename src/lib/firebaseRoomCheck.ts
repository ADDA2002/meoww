import { db, ref, get } from "./firebase";

/**
 * Check if a room exists in Firebase by looking up the room state.
 * On any error, returns true (allow through) to avoid blocking users
 * with false negatives from network/permission issues.
 */
export const checkFirebaseRoomExists = async (code: string): Promise<boolean> => {
  if (!db) {
    return true; // Allow through if Firebase isn't initialized
  }

  try {
    const roomRef = ref(db, `rooms/${code.trim().toLowerCase()}`);
    const snapshot = await get(roomRef);
    return snapshot.exists();
  } catch (err) {
    console.warn("Room check skipped (Firebase error):", err);
    return true; // Allow through on any Firebase error
  }
};