import type { Track } from "@/types/music";

export const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const generateRoomCode = (length: number = 6): string => {
  return Array.from({ length }, () =>
    ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  ).join("");
};

export const formatDisplayName = (name: string): string => {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  const firstChar = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1).toLowerCase();
  return firstChar + rest;
};

export const DEFAULT_TRACKS: Track[] = [
  {
    id: "track-1",
    title: "Midnight Reflections",
    artist: "LoFi Dreamer",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
    cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=300&q=80",
    addedBy: "System",
  },
  {
    id: "track-2",
    title: "Coffee & Cozy Rain",
    artist: "Monochrome Beats",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=tea-time-lofi-chill-140226.mp3",
    cover: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=300&q=80",
    addedBy: "System",
  },
  {
    id: "track-3",
    title: "Tokyo Late Walk",
    artist: "Indigo Tape",
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=chill-abstract-intention-12099.mp3",
    cover: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=300&q=80",
    addedBy: "System",
  },
  {
    id: "track-4",
    title: "Soft Velvet Nocturne",
    artist: "Couples Jam",
    url: "https://cdn.pixabay.com/download/audio/2021/09/06/audio_7314ef824a.mp3?filename=lofi-chill-medium-version-159456.mp3",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=300&q=80",
    addedBy: "System",
  }
];