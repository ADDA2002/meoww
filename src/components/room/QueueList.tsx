import React from "react";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Track } from "@/types/music";

interface QueueListProps {
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  onPlayTrack: (idx: number) => void;
  onReorder: (idx: number, direction: "up" | "down") => void;
  onRemove: (idx: number) => void;
}

const QueueList: React.FC<QueueListProps> = ({ queue, currentIndex, isHost, onPlayTrack, onReorder, onRemove }) => {
  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {queue.map((track, idx) => {
        const isCurrent = idx === currentIndex;
        return (
          <div
            key={track.id}
            className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${
              isCurrent
                ? "bg-black text-white border-black"
                : "bg-white text-black border-gray-200 hover:border-gray-400"
            }`}
          >
            <div
              onClick={() => {
                if (isHost) onPlayTrack(idx);
              }}
              className="min-w-0 flex-1 cursor-pointer"
            >
              <p className="font-bold text-xs truncate">
                {idx + 1}. {track.title}
              </p>
              <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>
                {track.artist}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onReorder(idx, "up")}
                disabled={idx === 0}
                className={`p-1 border text-xs disabled:opacity-30 ${
                  isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"
                }`}
                title="Move Up"
              >
                <ArrowUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onReorder(idx, "down")}
                disabled={idx === queue.length - 1}
                className={`p-1 border text-xs disabled:opacity-30 ${
                  isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"
                }`}
                title="Move Down"
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${
                  isCurrent ? "border-white" : "border-gray-300"
                }`}
                title="Remove"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QueueList;