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
    console.warn("[RoomCheck] Firebase not initialized, allowing through");
    return true; // Allow through if Firebase isn't initialized
  }

  try {
    const normalized = code.trim().toLowerCase();
    console.log(`[RoomCheck] Looking for room at rooms/${normalized}/state AND rooms/${normalized}/users`);

    // Check both possible subpaths and accept if either has data
    const [stateSnap, usersSnap] = await Promise.all([
      get(ref(db, `rooms/${normalized}/state`)),
      get(ref(db, `rooms/${normalized}/users`)),
    ]);

    const stateExists = stateSnap.exists();
    const usersExists = usersSnap.exists();
    const stateData = stateSnap.val();
    const usersData = usersSnap.val();

    console.log(`[RoomCheck] state: ${stateExists}, users: ${usersExists}`);
    if (stateData) console.log(`[RoomCheck] state data:`, stateData);
    if (usersData) console.log(`[RoomCheck] users data:`, usersData);

    return stateExists || usersExists;
  } catch (err) {
    console.error("[RoomCheck] Error checking room:", err);
    return true; // Allow through on any Firebase error
  }
};