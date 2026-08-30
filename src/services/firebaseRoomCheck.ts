import { db, ref, get } from "./firebase";

/**
 * Check if a room exists in Firebase by looking up the room's state subpath.
 * A room is considered to exist if either `rooms/{code}/state` or
 * `rooms/{code}/users` has any data.
 *
 * On any error, returns true (allow through) to avoid blocking users
 * with false negatives from network/permission issues.
 */
export const checkFirebaseRoomExists = async (code: string): Promise<boolean> => {
  if (!db) {
    return true; // Allow through if Firebase isn't initialized
  }

  try {
    const normalized = code.trim().toLowerCase();

    // Check both possible subpaths and accept if either has data
    const [stateSnap, usersSnap] = await Promise.all([
      get(ref(db, `rooms/${normalized}/state`)),
      get(ref(db, `rooms/${normalized}/users`)),
    ]);

    return stateSnap.exists() || usersSnap.exists();
  } catch (err) {
    console.warn("Room check skipped (Firebase error):", err);
    return true; // Allow through on any Firebase error
  }
};