import { ArrowUp, ArrowDown, Trash2, Plus, Upload, Lock } from "lucide-react";
import { useState } from "react";
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

interface QueueListProps {
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  controlsLocked?: boolean;
  onTrackClick: (idx: number) => void;
  onReorder: (idx: number, direction: "up" | "down") => void;
  onRemove: (idx: number) => void;
  onAddSong: (song: { title: string; artist: string; url: string }) => void;
  onLocalFileUpload: (file: File) => void;
}

export function QueueList({
  queue,
  currentIndex,
  isHost,
  controlsLocked = false,
  onTrackClick,
  onReorder,
  onRemove,
  onAddSong,
  onLocalFileUpload,
}: QueueListProps) {
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  // Non-host members are locked out of queue management when veto is active.
  // They can still add songs (that's the whole point of "add-only" mode).
  const memberLocked = !isHost && controlsLocked;

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songUrl.trim()) return;
    
    onAddSong({ title: songTitle, artist: songArtist, url: songUrl });
    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setAddSongOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLocalFileUpload(file);
      setAddSongOpen(false);
    }
  };

  return (
    <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-bold text-xs uppercase tracking-wider">Queue ({queue.length})</span>
          {memberLocked && (
            <span className="text-[10px] font-mono uppercase text-amber-700 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Add-only
            </span>
          )}
        </div>
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
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {queue.map((track, idx) => {
          const isCurrent = idx === currentIndex;
          return (
            <div
              key={track.id}
              className={`p-2.5 border transition-colors flex items-center justify-between gap-2 ${
                isCurrent ? "bg-black text-white border-black" : "bg-white text-black border-gray-200 hover:border-gray-400"
              }`}
            >
              <div 
                onClick={() => {
                  // Non-host members in veto mode cannot switch tracks
                  if (memberLocked) return;
                  onTrackClick(idx);
                }} 
                className={`min-w-0 flex-1 ${memberLocked ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <p className="font-bold text-xs truncate">{idx + 1}. {track.title}</p>
                <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>{track.artist}</p>
              </div>
              
              {/* Queue management controls: hidden for non-host members in veto mode */}
              {!memberLocked && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onReorder(idx, "up")}
                    disabled={idx === 0}
                    className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"}`}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onReorder(idx, "down")}
                    disabled={idx === queue.length - 1}
                    className={`p-1 border text-xs disabled:opacity-30 ${isCurrent ? "border-white hover:bg-neutral-800" : "border-gray-300 hover:bg-gray-100"}`}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onRemove(idx)}
                    className={`p-1 border text-xs text-red-500 hover:bg-red-50 ${isCurrent ? "border-white" : "border-gray-300"}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}