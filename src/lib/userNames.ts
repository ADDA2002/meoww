import { RoomUser } from "@/types/music";

/**
 * Generate a unique name by appending a number suffix if there's a conflict.
 * E.g., "Alex" -> "Alex", "Alex" -> "Alex 2", "Alex 2" -> "Alex 3"
 */
export function generateUniqueName(
  baseName: string,
  existingUsers: RoomUser[]
): string {
  const normalizedBase = baseName.trim().toLowerCase();
  const existingNames = existingUsers.map((u) =>
    u.name.trim().toLowerCase()
  );

  if (!existingNames.includes(normalizedBase)) {
    return baseName;
  }

  for (let i = 1; i <= 999; i++) {
    const candidate = baseName + " " + i;
    if (!existingNames.includes(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return baseName + " " + Date.now();
}