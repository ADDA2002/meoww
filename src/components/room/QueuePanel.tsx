import React from "react";
import { Track } from "@/types/music";
import AddTrackDialog from "./AddTrackDialog";
import QueueList from "./QueueList";

interface QueuePanelProps {
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  userName: string;
  onPlayTrack: (idx: number) => void;
  onReorder: (idx: number, direction: "up" | "down") => void;
  onRemove: (idx: number) => void;
  onAddByUrl: (track: Track) => void;
  onAddLocalFile: (track: Track) => void;
}

const QueuePanel: React.FC<QueuePanelProps> = ({
  queue,
  currentIndex,
  isHost,
  userName,
  onPlayTrack,
  onReorder,
  onRemove,
  onAddByUrl,
  onAddLocalFile,
}) => {
  return (
    <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
        <span className="font-bold text-xs uppercase tracking-wider">Shared Queue ({queue.length})</span>
        <AddTrackDialog
          userName={userName}
          onAddByUrl={onAddByUrl}
          onAddLocalFile={onAddLocalFile}
        />
      </div>

      <QueueList
        queue={queue}
        currentIndex={currentIndex}
        isHost={isHost}
        onPlayTrack={onPlayTrack}
        onReorder={onReorder}
        onRemove={onRemove}
      />
    </div>
  );
};

export default QueuePanel;