/**
 * Formats a name so that:
 * - The first letter is capitalized
 * - The rest of the letters are lowercase
 * - Excess whitespace is trimmed
 * - Empty strings return empty string
 *
 * Examples:
 *   "ALEX"  -> "Alex"
 *   "jOHN"  -> "John"
 *   "tAYLOR" -> "Taylor"
 *   "  MaTeO  " -> "Mateo"
 */
export function formatDisplayName(name: string): string {
  if (!name) return "";

  const trimmed = name.trim();
  if (!trimmed) return "";

  const firstChar = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1).toLowerCase();

  return firstChar + rest;
}