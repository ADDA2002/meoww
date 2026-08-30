export const formatDisplayName = (name: string): string => {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const firstChar = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1).toLowerCase();
  return firstChar + rest;
};

export const formatTime = (secs: number): string => {
  if (isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};