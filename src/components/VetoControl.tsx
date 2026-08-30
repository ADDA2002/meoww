import { Lock, Unlock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VetoControlProps {
  isHost: boolean;
  vetoActive: boolean;
  onToggleVeto: () => void;
}

export function VetoControl({ isHost, vetoActive, onToggleVeto }: VetoControlProps) {
  // Member view: show "Add-only" banner when veto is active
  if (!isHost) {
    if (!vetoActive) return null;
    return (
      <div className="mt-4 p-2.5 bg-amber-50 border border-amber-400 text-amber-900 text-xs font-mono flex items-center gap-2">
        <Lock className="w-4 h-4 flex-shrink-0" />
        <span><span className="font-bold">ADD-ONLY MODE:</span> Host has restricted controls. You can add songs but cannot skip, pause, or reorder.</span>
      </div>
    );
  }

  // Host view: toggle control
  return (
    <div className="mt-4 border border-black bg-white p-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {vetoActive ? (
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
          ) : (
            <Unlock className="w-4 h-4 text-gray-600 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-black">
              Let others change what's playing
            </p>
            <p className="text-[11px] font-mono text-gray-600 mt-0.5">
              {vetoActive
                ? "Members are in add-only mode. They can only add songs."
                : "Members can skip, pause, and reorder the queue."}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleVeto}
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
  );
}