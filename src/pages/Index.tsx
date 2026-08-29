import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Radio } from "lucide-react";
import GalaxyEffect from "@/components/GalaxyEffect";

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"create" | "join" | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const handleTabClick = (tab: "create" | "join") => {
    if (activeTab === tab) {
      setActiveTab(null);
    } else {
      setActiveTab(tab);
    }
  };

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
    <div className="min-h-screen bg-black text-white flex flex-col justify-between relative overflow-hidden">
      {/* Galaxy background */}
      <div className="absolute inset-0 z-0">
        <GalaxyEffect density="medium" />
      </div>

      {/* Header Bar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between relative z-10 bg-black/30 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-white"></div>
          <span className="font-bold tracking-wider text-sm uppercase">Jam Session</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/60 font-mono">
          <Radio className="w-3.5 h-3.5 animate-pulse text-white" />
          <span>REALTIME P2P AUDIO</span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-xl">
          {/* Hero text */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
              Jam Together
            </h1>
            <p className="text-white/60 text-sm max-w-md mx-auto">
              Synchronized, zero-budget music listening room for couples and friends.
            </p>
          </div>

          {/* Tab Strip + Curtain Drawers */}
          <div 
            className="border border-white/30 overflow-hidden bg-black/60 backdrop-blur-md shadow-[0_0_40px_rgba(120,80,200,0.25)] transition-all duration-300"
          >
            <div className="flex border-b border-white/20">
              {/* Create Room Tab */}
              <button
                type="button"
                onClick={() => handleTabClick("create")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors border-r border-white/20 font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "create" ? "bg-white text-black" : "bg-transparent text-white hover:bg-white/10"
                }`}
              >
                <span>Create Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "create" ? "rotate-180" : ""}`} />
              </button>

              {/* Join Room Tab */}
              <button
                type="button"
                onClick={() => handleTabClick("join")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "join" ? "bg-white text-black" : "bg-transparent text-white hover:bg-white/10"
                }`}
              >
                <span>Join Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "join" ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Drawers Content */}
            <div className="relative overflow-hidden">
              {/* Create Room Drawer */}
              <div 
                className={`transition-all duration-500 ease-in-out ${
                  activeTab === "create" ? "max-h-[300px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"
                }`}
              >
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-name" className="text-xs font-mono uppercase text-white/70">
                      Your Nickname
                    </Label>
                    <Input
                      id="create-name"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="bg-white/5 border-white/20 text-white placeholder-white/30 focus:border-white/50 font-medium"
                      autoFocus={activeTab === "create"}
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-white hover:bg-white/90 text-black font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                    disabled={!createName.trim()}
                  >
                    Start Session as Host
                  </Button>
                </form>
              </div>

              {/* Join Room Drawer */}
              <div 
                className={`transition-all duration-500 ease-in-out ${
                  activeTab === "join" ? "max-h-[350px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"
                }`}
              >
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="join-name" className="text-xs font-mono uppercase text-white/70">
                      Your Nickname
                    </Label>
                    <Input
                      id="join-name"
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="e.g. Taylor"
                      className="bg-white/5 border-white/20 text-white placeholder-white/30 focus:border-white/50 font-medium"
                      autoFocus={activeTab === "join"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-code" className="text-xs font-mono uppercase text-white/70">
                      6-Letter Room Code
                    </Label>
                    <Input
                      id="join-code"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="e.g. X9KJ2B"
                      maxLength={8}
                      className="bg-white/5 border-white/20 text-white uppercase font-mono tracking-widest placeholder-white/30 focus:border-white/50 font-semibold"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-white hover:bg-white/90 text-black font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                    disabled={!joinName.trim() || !joinCode.trim()}
                  >
                    Join Session
                  </Button>
                </form>
              </div>
            </div>
          </div>

          {/* Quick info feature card */}
          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs text-white/60 font-mono">
            <div className="p-3 border border-white/10 bg-white/5 backdrop-blur-sm">
              <span className="font-bold text-white block mb-1">01. SYNC</span>
              Exact track time alignment
            </div>
            <div className="p-3 border border-white/10 bg-white/5 backdrop-blur-sm">
              <span className="font-bold text-white block mb-1">02. CO-OP</span>
              Both can add songs & reorder
            </div>
            <div className="p-3 border border-white/10 bg-white/5 backdrop-blur-sm">
              <span className="font-bold text-white block mb-1">03. FREE</span>
              No ads, 0 data stored
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/10 py-4 px-6 text-center text-xs text-white/40 font-mono relative z-10 bg-black/30 backdrop-blur-sm">
        Jam Together &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Index;