import React, { useState } from "react";
import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Track } from "@/types/music";
import { toast } from "sonner";

interface AddTrackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onAdd: (track: Track) => void;
}

const AddTrackDialog: React.FC<AddTrackDialogProps> = ({
  open,
  onOpenChange,
  userName,
  onAdd,
}) => {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");

  const reset = () => {
    setTitle("");
    setArtist("");
    setUrl("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) {
      toast.error("Please provide a title and audio URL.");
      return;
    }

    onAdd({
      id: `track-${Date.now()}`,
      title: title.trim(),
      artist: artist.trim() || "Independent Artist",
      url: url.trim(),
      addedBy: userName,
    });

    reset();
    onOpenChange(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onAdd({
      id: `local-${Date.now()}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: `${userName} (Local MP3)`,
      url: URL.createObjectURL(file),
      addedBy: userName,
      isLocalFile: true,
    });

    onOpenChange(false);
    toast.success(`Loaded local audio: ${file.name}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight uppercase">
            Add Song to Queue
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Method 1: Local MP3 file upload */}
          <div className="p-4 border border-dashed border-black bg-gray-50 text-center space-y-2">
            <Upload className="w-6 h-6 mx-auto text-black" />
            <p className="text-xs font-semibold uppercase">
              Option 1: Upload your local MP3 file
            </p>
            <p className="text-[11px] text-gray-500">
              Pick any MP3 from your computer or downloads folder
            </p>
            <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-4 py-2 hover:bg-neutral-800 transition-colors">
              Select MP3 File
              <input
                type="file"
                accept="audio/mp3,audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-xs font-mono uppercase">
              Or via URL
            </span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          {/* Method 2: Online or GitHub URL */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">
                Track Title
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. My Favorite Song"
                className="border-gray-300 text-black font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">
                Artist
              </Label>
              <Input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="e.g. Artist Name"
                className="border-gray-300 text-black font-medium"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-mono uppercase text-gray-700">
                Audio Stream / GitHub MP3 URL
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
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