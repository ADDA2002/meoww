import React, { useState, useCallback, useRef } from "react";
import { Menu, Copy, Check, LogOut, X, Music, Plus, Upload, GripVertical, Loader2, CheckCircle2, XCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Track } from "@/types/music";

const FIREBASE_DB_URL = "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app";

function prettyTitle(slug: string): string {
  return slug.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c: string) => c.toUpperCase());
}

interface UploadItem {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  message: string;
}

interface RoomDrawerProps {
  roomCode: string;
  userName: string;
  queue: Track[];
  currentIndex: number;
  isHost: boolean;
  onLeave: () => void;
  onTrackClick?: (idx: number) => void;
  onReorder?: (idx: number, direction: "up" | "down") => void;
  onReorderDnd?: (fromIdx: number, toIdx: number) => void;
  onRemove?: (idx: number) => void;
  onUploadDone?: () => void;
}

const UPLOAD_API = "/upload";

const RoomDrawer: React.FC<RoomDrawerProps> = ({
  roomCode,
  userName,
  queue,
  currentIndex,
  isHost,
  onLeave,
  onTrackClick,
  onReorder,
  onReorderDnd,
  onRemove,
  onUploadDone,
}) => {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTrack, setRenameTrack] = useState<Track | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    setOpen(false);
    onLeave();
  };

  const handleFilesSelected = useCallback(async (files: File[]) => {
    const mp3s = files.filter(f =>
      f.type === "audio/mpeg" ||
      f.type === "audio/mp3" ||
      /\.mp3$/i.test(f.name)
    );
    if (mp3s.length === 0) return;

    const newItems: UploadItem[] = mp3s.map(f => ({ file: f, status: "queued", message: "" }));
    setUploadItems(prev => [...prev, ...newItems]);

    for (let i = 0; i < mp3s.length; i++) {
      const item = newItems[i];
      setUploadItems(prev => prev.map((it, j) => {
        const match = newItems.indexOf(item);
        return j === prev.length - newItems.length + match
          ? { ...it, status: "uploading", message: "uploading..." }
          : it;
      }));

      try {
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await fetch(UPLOAD_API, { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");

        setUploadItems(prev => prev.map((it, j) =>
          it.file === item.file
            ? { ...it, status: "done", message: data.skipped ? "already added" : "✓ added" }
            : it
        ));
      } catch (err) {
        setUploadItems(prev => prev.map((it, j) =>
          it.file === item.file
            ? { ...it, status: "error", message: String(err) }
            : it
        ));
      }
    }

    onUploadDone?.();
  }, [onUploadDone]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    void handleFilesSelected(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleUploadDialogChange = (isOpen: boolean) => {
    setUploadOpen(isOpen);
    if (!isOpen) {
      // Keep results visible briefly, but reset on close
      setTimeout(() => setUploadItems([]), 500);
    }
  };

  const openRename = (track: Track) => {
    const current = track.url.split('/songs/')[1]?.split('?')[0] || "";
    setRenameTrack(track);
    setRenameName(decodeURIComponent(current));
    setRenameError(null);
    setRenameOpen(true);
  };

  const closeRename = () => {
    setRenameOpen(false);
    setRenameTrack(null);
    setRenameName("");
    setRenameError(null);
  };

  const handleRename = async () => {
    if (!renameTrack) return;
    const oldFileName = renameTrack.url.split('/songs/')[1]?.split('?')[0] || "";
    const newFileName = renameName.trim();
    if (!newFileName) {
      setRenameError("Enter a new name");
      return;
    }
    if (newFileName === oldFileName) {
      setRenameError("Name is the same");
      return;
    }
    setRenaming(true);
    setRenameError(null);
    try {
      const res = await fetch(
        `/rename?trackId=${encodeURIComponent(renameTrack.id)}&oldFileName=${encodeURIComponent(oldFileName)}&newFileName=${encodeURIComponent(newFileName)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rename failed");
      closeRename();
    } catch (err) {
      setRenameError(String(err instanceof Error ? err.message : err));
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = async (track: Track) => {
    if (!confirm(`Remove "${track.title}" from the playlist? This deletes the file too.`)) return;
    setDeletingId(track.id);
    try {
      const res = await fetch(`/delete?trackId=${encodeURIComponent(track.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
    } catch (err) {
      alert(String(err instanceof Error ? err.message : err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (!isHost || !onReorderDnd) return;
    if (result.destination.index === result.source.index) return;
    onReorderDnd(result.source.index, result.destination.index);
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
              {isHost && (
                <Dialog open={uploadOpen} onOpenChange={handleUploadDialogChange}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1 h-7">
                      <Plus className="w-3.5 h-3.5 mr-1" />ADD
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold tracking-tight uppercase">Upload Songs</DialogTitle>
                    </DialogHeader>
                    <div className="pt-2 space-y-3">
                      <div className="p-5 border border-dashed border-black bg-gray-50 text-center space-y-2">
                        <Upload className="w-6 h-6 mx-auto text-black" />
                        <p className="text-xs font-semibold uppercase">Select MP3 Files</p>
                        <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                          Added to the shared playlist for everyone
                        </p>
                        <label className="inline-block mt-2 cursor-pointer bg-black text-white text-xs font-mono px-5 py-2 hover:bg-neutral-800 font-bold">
                          SELECT FILES
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="audio/mpeg,audio/mp3,.mp3"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {uploadItems.length > 0 && (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {uploadItems.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white"
                            >
                              {item.status === "uploading" ? (
                                <Loader2 className="w-3.5 h-3.5 text-yellow-600 animate-spin flex-shrink-0" />
                              ) : item.status === "done" ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              ) : item.status === "error" ? (
                                <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                              ) : (
                                <Music className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              )}
                              <span className="flex-1 text-xs truncate">{item.file.name}</span>
                              <span className={`text-[10px] font-mono flex-shrink-0 ${
                                item.status === "done" ? "text-green-600" :
                                item.status === "error" ? "text-red-600" :
                                item.status === "uploading" ? "text-yellow-600" : "text-gray-400"
                              }`}>
                                {item.message || item.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider text-center pt-1">
                        Files are pushed to shared storage and added to the playlist
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {isHost && onReorderDnd ? (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="playlist">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-1.5 max-h-80 overflow-y-auto pr-1"
                    >
                      {queue.length === 0 ? (
                        <div className="p-4 border border-dashed border-gray-300 text-center text-gray-400 text-xs font-mono">
                          <Music className="w-6 h-6 mx-auto mb-2" />
                          No songs in queue
                        </div>
                      ) : (
                        queue.map((track, idx) => {
                          const isCurrent = idx === currentIndex;
                          return (
                            <Draggable key={track.id} draggableId={track.id} index={idx}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`p-2.5 border transition-colors flex items-center gap-2 ${
                                    isCurrent
                                      ? "bg-black text-white border-black"
                                      : "bg-white text-black border-gray-200"
                                  } ${snapshot.isDragging ? "shadow-lg" : ""}`}
                                >
                                  <span
                                    {...provided.dragHandleProps}
                                    className={`cursor-grab active:cursor-grabbing flex-shrink-0 ${
                                      isCurrent ? "text-gray-300" : "text-gray-400"
                                    }`}
                                  >
                                    <GripVertical className="w-4 h-4" />
                                  </span>
                                  <div
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => onTrackClick?.(idx)}
                                  >
                                    <p className="font-bold text-xs truncate">
                                      {idx + 1}. {track.title}
                                    </p>
                                    <p className={`text-[11px] truncate ${isCurrent ? "text-gray-300" : "text-gray-500"}`}>
                                      {track.artist}
                                    </p>
                                  </div>
                                  {isHost && (
                                    <>
                                      <button
                                        onClick={() => openRename(track)}
                                        className={`flex-shrink-0 p-1 transition-colors ${
                                          isCurrent ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-black"
                                        }`}
                                        aria-label="Rename track"
                                        title="Rename"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(track)}
                                        disabled={deletingId === track.id}
                                        className={`flex-shrink-0 p-1 transition-colors ${
                                          isCurrent ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-red-600"
                                        } disabled:opacity-50`}
                                        aria-label="Delete track"
                                        title="Delete"
                                      >
                                        {deletingId === track.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </>
                                  )}
                                  {onRemove && (
                                    <button
                                      onClick={() => onRemove(idx)}
                                      className={`flex-shrink-0 p-1 transition-colors ${
                                        isCurrent ? "text-gray-300 hover:text-white" : "text-gray-400 hover:text-black"
                                      }`}
                                      aria-label="Remove from queue"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </Draggable>
                          );
                        })
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
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
            )}

            {isHost && queue.length > 0 && onReorder && !onReorderDnd && (
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                Use the arrows to reorder tracks
              </p>
            )}
            {isHost && onReorderDnd && (
              <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">
                Drag the grip handle to reorder
              </p>
            )}
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

      <Dialog open={renameOpen} onOpenChange={(o) => !o && closeRename()}>
        <DialogContent className="border border-black bg-white text-black p-6 rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight uppercase">Rename Track</DialogTitle>
          </DialogHeader>
          <div className="pt-2 space-y-3">
            <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">
              Renames the file on GitHub and updates the playlist. .mp3 is added automatically.
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase text-gray-500 tracking-wider">New file name</label>
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !renaming) void handleRename();
                }}
                placeholder="new-song-name.mp3"
                className="border border-black rounded-none font-mono text-sm h-10"
                disabled={renaming}
                autoFocus
              />
            </div>
            {renameError && (
              <p className="text-[11px] font-mono text-red-600 uppercase">{renameError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                onClick={closeRename}
                variant="outline"
                disabled={renaming}
                className="flex-1 border-black rounded-none font-mono text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleRename()}
                disabled={renaming}
                className="flex-1 bg-black hover:bg-neutral-800 text-white rounded-none font-mono text-xs font-bold"
              >
                {renaming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    RENAMING...
                  </>
                ) : (
                  <>
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    RENAME
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
};

export default RoomDrawer;