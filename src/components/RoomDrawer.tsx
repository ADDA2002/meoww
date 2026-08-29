import React from "react";
import { X, Menu, Copy, Check, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface RoomDrawerProps {
  roomCode: string;
  userName: string;
  onLeave: () => void;
}

const RoomDrawer: React.FC<RoomDrawerProps> = ({ roomCode, userName, onLeave }) => {
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-black hover:bg-gray-100 text-xs font-mono font-semibold"
          aria-label="Open room options"
        >
          <Menu className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="border-l border-black bg-white text-black rounded-none p-0">
        <SheetHeader className="border-b border-gray-200 p-4 flex flex-row items-center justify-between">
          <SheetTitle className="text-lg font-bold uppercase tracking-tight m-0">
            Room Options
          </SheetTitle>
          {/* Custom close button matching open button size and border */}
          <Button
            variant="outline"
            size="sm"
            className="border-black hover:bg-gray-100 text-xs font-mono font-semibold"
            aria-label="Close room options"
            onClick={() => setOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </SheetHeader>
        
        <div className="p-4 space-y-6">
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