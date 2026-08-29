import { useState, useEffect, useCallback } from "react";

const musicSymbols = ["♪", "♫", "♩", "♬"];

interface Note {
  id: number;
  symbol: string;
  left: number;
  delay: number;
}

export const FloatingNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteId, setNoteId] = useState(0);

  const spawnNote = useCallback(() => {
    const newNote: Note = {
      id: noteId,
      symbol: musicSymbols[Math.floor(Math.random() * musicSymbols.length)],
      // Position around the bottom-right area where Join Room is
      left: 55 + Math.random() * 15, // 55-70% from left
      delay: Math.random() * 0.5,
    };
    setNoteId((prev) => prev + 1);
    setNotes((prev) => [...prev, newNote]);

    // Remove note after animation completes
    setTimeout(() => {
      setNotes((prev) => prev.filter((n) => n.id !== newNote.id));
    }, 3000);
  }, [noteId]);

  useEffect(() => {
    // Spawn initial note
    const timeout = setTimeout(spawnNote, 500);

    // Continue spawning notes periodically
    const interval = setInterval(spawnNote, 2000);

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
          className="absolute text-2xl font-bold text-black/20 floating-note"
          style={{
            bottom: "120px",
            left: `${note.left}%`,
            animationDelay: `${note.delay}s`,
          }}
        >
          {note.symbol}
        </div>
      ))}
    </div>
  );
};