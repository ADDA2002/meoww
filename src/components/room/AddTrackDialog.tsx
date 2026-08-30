import React, { useState } from "react";
import { Plus, Upload } from "lucide-react";
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

interface AddTrackDialogProps {
  userName: string;
  onAddByUrl: (track: Track) => void;
  onAddLocalFile: (track: Track) => void;
}

const AddTrackDialog: React.FC<AddTrackDialogProps> = ({ userName, onAddByUrl, onAddLocalFile }) => {
  const [open, setOpen] = useState(false);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [songUrl, setSongUrl] = useState("");

  const handleAddSong = (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || !songUrl.trim()) return;

    onAddByUrl({
      id: `track-${Date.now()}`,
      title: songTitle.trim(),
      artist: songArtist.trim() || "Independent Artist",
      url: songUrl.trim(),
      addedBy: userName,
    });

    setSongTitle("");
    setSongArtist("");
    setSongUrl("");
    setOpen(false);
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    onAddLocalFile({
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local MP3)`,
      url: fileUrl,
      addedBy: userName,
      isLocalFile: true,
    });

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1">
          <Plus className="w-3.5 h-3.5 mr-1" />
          ADD TRACK
        </Button>
      </DialogTrigger>
      <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight uppercase">Add Song to Queue</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Local MP3 upload */}
          <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
            <Upload className="w-6 h-6 mx-auto text-black" />
            <p className="text-xs font-semibold uppercase">Option 1: Upload your local MP3 file</p>
            <p className="text-[11px] text-gray-500">Pick any MP3 from your computer or downloads folder</p>
            <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800 transition-colors">
              Select MP3 File
              <input
                type="file"
                accept="audio/mp3,audio/*"
                onChange={handleLocalFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">Or via URL</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          {/* URL form */}
          <form onSubmit={handleAddSong} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">Track Title</Label>
              <Input
                value={songTitle}
                onChange={(e) => setSongTitle(e.target.value)}
                placeholder="e.g. My Favorite Song"
                className="border-gray-300 text-black font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">Artist</Label>
              <Input
                value={songArtist}
                onChange={(e) => setSongArtist(e.target.value)}
                placeholder="e.g. Artist Name"
                className="border-gray-300 text-black font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">Audio Stream / GitHub MP3 URL</Label>
              <Input
                value={songUrl}
                onChange={(e) => setSongUrl(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../song.mp3"
                className="border-gray-300 text-black font-mono text-xs"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold py-2 mt-2"
            >
              Add to Queue
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTrackDialog;