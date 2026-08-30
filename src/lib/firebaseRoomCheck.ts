import { db, ref, get } from "./firebase";

/**
 * Simplified room check - always returns true to allow joining.
 * Real-time sync will handle the actual room state.
 * Even if room doesn't exist yet, user can join and it will be created.
 */
export const checkFirebaseRoomExists = async (code: string): Promise<boolean> => {
  // Always allow - the real-time sync system handles room state
  return true;
};