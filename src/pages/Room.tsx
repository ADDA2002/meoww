import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Track } from "@/types/music";
import { DEFAULT_TRACKS } from "@/lib/defaultTracks";
import { formatDisplayName } from "@/lib/nameFormat";
import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";

import RoomDrawer from "@/components/RoomDrawer";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const initialName = formatDisplayName(searchParams.get("name") || "Guest");
  const initialIsHost = searchParams.get("host") === "true";

  const userName = initialName;
  const isHost = initialIsHost;

  const [queue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex] = useState<number>(0);

  const currentTrack = queue[currentIndex] || null;

  const handleLeaveRoom = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <RoomDrawer
            roomCode={roomCode}
            userName={userName}
            queue={queue}
            currentIndex={currentIndex}
            isHost={isHost}
            onLeave={handleLeaveRoom}
          />
        </div>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-full aspect-square bg-gray-100 border-2 border-black flex items-center justify-center mb-6 overflow-hidden opacity-40">
            {currentTrack?.cover ? (
              <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
            ) : (
              <Music className="w-24 h-24 text-gray-400" />
            )}
          </div>

          <div className="text-center mb-4">
            <h2 className="text-xl font-bold tracking-tight truncate opacity-40">
              {currentTrack?.title || "No Track"}
            </h2>
            <p className="text-sm text-gray-600 mt-1 truncate opacity-40">
              {currentTrack?.artist || "Waiting..."}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm font-mono font-semibold text-gray-500 uppercase">
            <span className="w-2 h-2 bg-gray-400"></span>
            <span>Listening passively</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Room;