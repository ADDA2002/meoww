import { useState, useEffect, useCallback } from "react";

const musicSymbols = ["♪", "♫", "♩", "♬"];
const noteSizes = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];

interface Note {
  id: number;
  symbol: string;
  size: string;
  left: number;
  delay: number;
  duration: number;
}

export const FloatingNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteId, setNoteId] = useState(0);

  const spawnNote = useCallback(() => {
    const newNote: Note = {
      id: noteId,
      symbol: musicSymbols[Math.floor(Math.random() * musicSymbols.length)],
      size: noteSizes[Math.floor(Math.random() * noteSizes.length)],
      // Position behind the Join Room tab (right side of the tab strip)
      left: 50 + Math.random() * 20, // 50-70% from left
      delay: Math.random() * 1,
      duration: 2 + Math.random() * 2, // 2-4 seconds duration
    };
    setNoteId((prev) => prev + 1);
    setNotes((prev) => [...prev, newNote]);

    // Remove note after animation completes
    setTimeout(() => {
      setNotes((prev) => prev.filter((n) => n.id !== newNote.id));
    }, newNote.duration * 1000 + 500);
  }, [noteId]);

  useEffect(() => {
    // Spawn initial note
    const timeout = setTimeout(spawnNote, 300);

    // Continue spawning notes periodically
    const interval = setInterval(spawnNote, 1500);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [spawnNote]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {notes.map((note) => (
        <div
          key={note.id}
          className={`absolute font-bold text-black/15 floating-note ${note.size}`}
          style={{
            bottom: "45%", // Start from behind the tabs area
            left: `${note.left}%`,
            animationDelay: `${note.delay}s`,
            animationDuration: `${note.duration}s`,
          }}
        >
          {note.symbol}
        </div>
      ))}
    </div>
  );
};