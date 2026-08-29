import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TabKey = "create" | "join";

interface AnimatedDrawerProps {
  activeTab: TabKey | null;
  setActiveTab: (tab: TabKey | null) => void;
  createName: string;
  setCreateName: (s: string) => void;
  joinName: string;
  setJoinName: (s: string) => void;
  joinCode: string;
  setJoinCode: (s: string) => void;
}

const AnimatedDrawer: React.FC<AnimatedDrawerProps> = ({
  activeTab,
  setActiveTab,
  createName,
  setCreateName,
  joinName,
  setJoinName,
  joinCode,
  setJoinCode,
}) => {
  const navigate = useNavigate();
  const [displayed, setDisplayed] = useState<TabKey | null>(activeTab);
  const [phase, setPhase] = useState<"idle" | "leaving" | "entering">("idle");
  const prevTab = useRef<TabKey | null>(activeTab);
  const innerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (activeTab === prevTab.current) return;

    if (innerTimerRef.current) {
      clearTimeout(innerTimerRef.current);
      innerTimerRef.current = null;
    }

    if (activeTab === null) {
      setPhase("leaving");
      const t = setTimeout(() => {
        setDisplayed(null);
        setPhase("idle");
        prevTab.current = null;
      }, 150);
      return () => clearTimeout(t);
    }

    if (displayed === null) {
      setDisplayed(activeTab);
      setPhase("entering");
      prevTab.current = activeTab;
      const t = setTimeout(() => setPhase("idle"), 300);
      return () => clearTimeout(t);
    }

    // switching between tabs
    setPhase("leaving");
    const t1 = setTimeout(() => {
      setDisplayed(activeTab);
      setPhase("entering");
      prevTab.current = activeTab;
      innerTimerRef.current = setTimeout(() => setPhase("idle"), 300);
    }, 150);
    return () => {
      clearTimeout(t1);
    };
  }, [activeTab]);

  // Clean up the inner timer on unmount
  useEffect(() => {
    return () => {
      if (innerTimerRef.current) {
        clearTimeout(innerTimerRef.current);
      }
    };
  }, []);

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/room/${generatedCode}?name=${encodeURIComponent(createName.trim())}&host=true`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || !joinCode.trim()) return;
    const cleanCode = joinCode.trim().toUpperCase();
    navigate(`/room/${cleanCode}?name=${encodeURIComponent(joinName.trim())}&host=false`);
  };

  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-out ${
        displayed ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      }`}
    >
      <div className="overflow-hidden relative">
        {/* Sliding panel */}
        <div
          key={displayed ?? "empty"}
          className={`relative will-change-transform ${
            phase === "leaving"
              ? "drawer-leave"
              : phase === "entering"
              ? "drawer-enter"
              : "drawer-idle"
          }`}
        >
          {/* Edge accents (top & bottom) */}
          <div className="absolute left-0 right-0 -top-px h-px bg-gradient-to-r from-transparent via-black to-transparent drawer-edge" />
          <div className="absolute left-0 right-0 -bottom-px h-px bg-gradient-to-r from-transparent via-black to-transparent drawer-edge" />

          {/* Subtle moving sheen */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="drawer-sheen absolute -inset-y-2 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-black/[0.04] to-transparent" />
          </div>

          {displayed === "create" && (
            <div className="p-6 drawer-content">
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name" className="text-xs font-mono uppercase text-gray-700">
                    Your Nickname
                  </Label>
                  <Input
                    id="create-name"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Alex"
                    className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium drawer-input"
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                  disabled={!createName.trim()}
                >
                  Start Session as Host
                </Button>
              </form>
            </div>
          )}

          {displayed === "join" && (
            <div className="p-6 drawer-content">
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="join-name" className="text-xs font-mono uppercase text-gray-700">
                    Your Nickname
                  </Label>
                  <Input
                    id="join-name"
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="e.g. Taylor"
                    className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium drawer-input"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="join-code" className="text-xs font-mono uppercase text-gray-700">
                    6-Letter Room Code
                  </Label>
                  <Input
                    id="join-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. X9KJ2B"
                    maxLength={8}
                    className="bg-gray-50 border-gray-300 text-black uppercase font-mono tracking-widest placeholder-gray-400 focus:border-black font-semibold drawer-input"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                  disabled={!joinName.trim() || !joinCode.trim()}
                >
                  Join Session
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnimatedDrawer;