import React from "react";
import { Menu, Copy, Check, LogOut, X, ShieldAlert, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetTrigger,
} from "@/components/ui/sheet";

interface RoomDrawerProps {
  roomCode: string;
  userName: string;
  isHost: boolean;
  vetoActive: boolean;
  onToggleVeto: () => void;
  onLeave: () => void;
}

const RoomDrawer: React.FC<RoomDrawerProps> = ({ roomCode, userName, isHost, vetoActive, onToggleVeto, onLeave }) => {
  const [copied, setCopied] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    setOpen(false);
    onLeave();
  };

  const handleToggleVeto = () => {
    onToggleVeto();
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
        className="border-l border-black bg-white text-black rounded-none p-0 [&>button]:hidden"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-4 text-left flex-row items-center justify-between">
          <SheetTitle className="text-sm font-extrabold tracking-wider uppercase">Room Options</SheetTitle>
          <SheetClose className="p-1 hover:bg-gray-100 transition-colors rounded-sm">
            <X className="w-5 h-5" />
          </SheetClose>
        </SheetHeader>
        
        <div className="p-6 space-y-6">
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

          {/* Host Controls - Veto Toggle */}
          {isHost && (
            <div className="space-y-2 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                {vetoActive ? (
                  <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                ) : (
                  <Unlock className="w-4 h-4 text-gray-600 flex-shrink-0" />
                )}
                <span className="text-xs font-mono uppercase text-gray-500 tracking-wider">Member Controls</span>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 border border-black bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <div className="min-w-0">
                  <p className="text-sm font-bold uppercase tracking-wider text-black">
                    Let others change what's playing
                  </p>
                  <p className="text-[11px] font-mono text-gray-600 mt-0.5">
                    {vetoActive
                      ? "Members are in add-only mode. They can only add songs."
                      : "Members can skip, pause, and reorder the queue."}
                  </p>
                </div>
                <button
                  onClick={handleToggleVeto}
                  role="switch"
                  aria-checked={!vetoActive}
                  aria-label="Toggle member controls"
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center transition-colors border border-black ${
                    vetoActive ? "bg-gray-300" : "bg-black"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform bg-white border border-black transition-transform ${
                      vetoActive ? "translate-x-1" : "translate-x-6"
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

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