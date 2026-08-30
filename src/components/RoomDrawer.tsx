import React, { useState } from "react";
import { Menu, Copy, Check, LogOut, X, Music, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Track } from "@/types/music";

interface RoomDrawerProps {
  roomCode: string;
  userName: string;
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  onLeave: () => void;
  onTrackClick?: (idx: number) => void;
  onReorder?: (idx: number, direction: "up" | "down") => void;
  onRemove?: (idx: number) => void;
  onAddSong?: (song: { title: string; artist: string; url: string }) => void;
  onLocalFileUpload?: (file: File) => void;
}

const RoomDrawer: React.FC<RoomDrawerProps> = ({
  roomCode,
  userName,
  queue,
  currentIndex,
  isHost,
  onLeave,
  onTrackClick,
  onReorder,
  onRemove,
  onAddSong,
  onLocalFileUpload,
}) => {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    setOpen(false);
    onLeave();
  };

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songUrl.trim()) return;
    
    onAddSong?.({ title: songTitle, artist: songArtist, url: songUrl });
    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLocalFileUpload?.(file);
      setAddSongOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-gray-100 text-xs font-mono font-semibold p-2"
          aria-label="Open room options"
        >
          <Menu className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent 
        className="border-l border-black bg-white text-black rounded-none p-0 [&>button]:hidden w-full sm:max-w-md"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-4 text-left flex-row items-center justify-between">
          <SheetTitle className="text-sm font-extrabold tracking-wider uppercase">Room Options</SheetTitle>
          <SheetClose className="p-1 hover:bg-gray-100 transition-colors rounded-sm">
            <X className="w-5 h-5" />
          </SheetClose>
        </SheetHeader>
        
        <div className="p-6 space-y-6 max-h-[calc(100vh-80px)] overflow-y-auto">
          {/* Room Code Section */}
          <div className="space-y-3">
            <div className="text-xs font-mono uppercase text-gray-500 tracking-wider">Room Code</div>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 bg-gray-100 border border-gray-300 h-11 flex items-center justify-center font-mono font-bold text-lg tracking-widest text-black">
                {roomCode}
              </div>
              <Button
                onClick={handleCopyCode}
                variant="outline"
                className="h-11 w-24 border-black hover:bg-gray-100 font-mono text-xs font-semibold flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" />
                    COPIED
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    COPY
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* User Info */}
          <div className="space-y-2">
            <div className="text-xs font-mono uppercase text-gray-500 tracking-wider">Connected As</div>
            <div className="bg-gray-100 border border-gray-300 h-11 flex items-center px-3 font-semibold">
              {userName}
            </div>
          </div>

          {/* Playlist Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono uppercase text-gray-500 tracking-wider">
                Playlist ({queue.length})
              </div>
              {isHost && onAddSong && (
                <Dialog open={addSongOpen} onOpenChange={setAddSongOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1 h-7">
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
                          <input type="file" accept="audio/mp3,audio/*" onChange={handleFileUpload} className="hidden" />
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
              )}
            </div>
            
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {queue.length === 0 ? (
                <div className="p-4 border border-dashed border-gray-300 text-center text-gray-400 text-xs font-mono">
                  <Music className="w-6 h-6 mx-auto mb-2" />
                  No songs in queue
                </div>
              ) : (
                queue.map((track, idx) => {
                  const isCurrent = idx === currentIndex;
                  return (
                    <div
                      key={track.id}
                      className={`p-2.5 border transition-colors ${
                        isCurrent ? "bg-black text-white border-black" : "bg-white text-black border-gray-200"
                      }`}
                    >
                      <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                      <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>{track.artist}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Exit Button */}
          <div className="pt-4 border-t border-gray-200">
            <Button
              onClick={handleLeave}
              className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-sm font-semibold py-3"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Leave Room
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default RoomDrawer;