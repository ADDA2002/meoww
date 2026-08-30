import { Music } from "lucide-react";
import { Track } from "@/types/music";

interface TrackInfoProps {
  track: Track | null;
}

export function TrackInfo({ track }: TrackInfoProps) {
  return (
    <div className="flex gap-4 items-center mb-6">
      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
        {track?.cover ? (
          <img src={track.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
        ) : (
          <Music className="w-8 h-8 text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-black truncate">
          {track?.title || "No Track"}
        </h2>
        <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
          {track?.artist || "Add songs to queue"}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
          <span>ADDED BY:</span>
          <span className="font-bold text-black uppercase">{track?.addedBy || "Host"}</span>
        </div>
      </div>
    </div>
  );
}