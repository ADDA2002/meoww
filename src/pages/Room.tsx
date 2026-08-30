import React, { useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Shuffle, 
  Volume2, 
  VolumeX,
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  Music, 
  Upload, 
  Users,
  Wifi,
  WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Track } from "@/types/music";
import { DEFAULT_TRACKS } from "@/constants/defaultTracks";
import { formatDisplayName } from "@/utils/nameFormat";
import RoomDrawer from "@/components/RoomDrawer";

const Room = () => {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomCode = (code || "").toUpperCase();
  const userName = formatDisplayName(searchParams.get("name") || "Guest");
  const isHost = searchParams.get("host") === "true";

  // Simple UI state only - no logic
  const [queue] = useState<Track[]>(DEFAULT_TRACKS);
  const [currentIndex] = useState(0);
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  const currentTrack = queue[currentIndex] || null;

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
  };

  const handleLeaveRoom = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 text-green-600">
            <Wifi className="w-3.5 h-3.5" />
            <span>CONNECTED</span>
          </div>
          <RoomDrawer roomCode={roomCode} userName={userName} onLeave={handleLeaveRoom} />
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Player */}
        <div className="lg:col-span-7 space-y-6">
          <div className="border border-black bg-white p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {/* Status */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-black animate-pulse"></span>
                <span className="font-semibold text-gray-700 uppercase">
                  {isHost ? 'YOU ARE HOST' : 'SYNCED WITH HOST'}
                </span>
              </div>
              <span className="text-gray-500">FIREBASE REALTIME</span>
            </div>

            {/* Track Info */}
            <div className="flex gap-4 items-center mb-6">
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-100 border border-black flex-shrink-0 flex items-center justify-center overflow-hidden">
                {currentTrack?.cover ? (
                  <img src={currentTrack.cover} alt="Cover" className="w-full h-full object-cover grayscale" />
                ) : (
                  <Music className="w-8 h-8 text-gray-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-black truncate">
                  {currentTrack?.title || "No Track"}
                </h2>
                <p className="text-sm font-medium text-gray-600 truncate mt-0.5">
                  {currentTrack?.artist || "Add songs to queue"}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs font-mono text-gray-500">
                  <span>ADDED BY:</span>
                  <span className="font-bold text-black uppercase">{currentTrack?.addedBy || "Host"}</span>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-1.5 mb-6">
              <input
                type="range"
                min={0}
                max={100}
                defaultValue={0}
                className="w-full accent-black cursor-pointer bg-gray-200 h-1.5 appearance-none border border-black"
              />
              <div className="flex justify-between text-xs font-mono text-gray-500">
                <span>0:00</span>
                <span>0:00</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button className="p-2 border border-black bg-white text-black hover:bg-gray-100 transition-colors">
                <Shuffle className="w-4 h-4" />
              </button>
              <button className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors">
                <SkipBack className="w-5 h-5" />
              </button>
              <button className="w-14 h-14 border border-black bg-black hover:bg-neutral-800 text-white flex items-center justify-center transition-colors">
                <Play className="w-6 h-6 ml-0.5" />
              </button>
              <button className="p-3 border border-black bg-white hover:bg-gray-100 text-black transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
              <button className="p-2 border border-black bg-white text-black hover:bg-gray-100 transition-colors">
                <Volume2 className="w-4 h-4" />
              </button>
            </div>

            {!isHost && (
              <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
                <span>Host controls playback. All can add and organize songs below.</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-5 space-y-6">
          {/* Users */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-black" />
                <span className="font-bold text-xs uppercase tracking-wider">Participants (1)</span>
              </div>
              <span className="text-xs font-mono text-gray-500">FIREBASE</span>
            </div>
            <div className="space-y-2 max-h-36 overflow-y-auto">
              <div className="flex items-center justify-between p-2 border border-gray-200 bg-gray-50 text-xs font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 bg-black"></div>
                  <span className="font-semibold text-black truncate">{userName} (You)</span>
                </div>
                <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase">HOST</span>
              </div>
            </div>
          </div>

          {/* Queue */}
          <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <span className="font-bold text-xs uppercase tracking-wider">Queue ({queue.length})</span>
              <Dialog open={addSongOpen} onOpenChange={setAddSongOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1">
                    <Plus className="w-3.5 h-3.5 mr-1" />ADD
                  </Button>
                </DialogTrigger>
                <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold tracking-tight uppercase">Add Song</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6 pt-2">
                    <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
                      <Upload className="w-6 h-6 mx-auto text-black" />
                      <p className="text-xs font-semibold uppercase">Upload MP3</p>
                      <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800">
                        Select MP3
                        <input type="file" accept="audio/mp3,audio/*" className="hidden" />
                      </label>
                    </div>
                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-gray-300"></div>
                      <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or URL</span>
                      <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    <form onSubmit={handleAddSong} className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Title</Label>
                        <Input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song name" className="border-gray-300" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
                        <Input value={songArtist} onChange={(e) => setSongArtist(e.target.value)} placeholder="Artist name" className="border-gray-300" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-mono uppercase text-gray-700">Audio URL</Label>
                        <Input value={songUrl} onChange={(e) => setSongUrl(e.target.value)} placeholder="https://..." className="border-gray-300 font-mono text-xs" />
                      </div>
                      <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2">Add to Queue</Button>
                    </form>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {queue.map((track, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <div key={track.id}
                    className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${isCurrent ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-200 hover:border-gray-400'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                      <p className={`text-[11px] truncate ${isCurrent ? 'text-gray-300' : 'text-gray-500'}`}>{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button disabled={idx === 0}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button disabled={idx === queue.length - 1}
                        className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? 'border-white hover:bg-neutral-800' : 'border-gray-300 hover:bg-gray-100'}`}>
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button
                        className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${isCurrent ? 'border-white' : 'border-gray-300'}`}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono">
        Meoww - Firebase Powered Audio Sync
      </footer>
    </div>
  );
};

export default Room;