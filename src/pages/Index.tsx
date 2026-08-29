import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Radio } from "lucide-react";

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
    <div className="min-h-screen bg-white text-black flex flex-col justify-between relative overflow-hidden">
      {/* Background GIF - Behind everything */}
      <div className="absolute inset-0 z-0">
        <img
          src="/o6m.gif"
          alt="Background"
          className="w-full h-full object-cover opacity-100"
        />
        {/* Subtle white tint overlay for readability */}
        <div className="absolute inset-0 bg-white/40"></div>
      </div>

      {/* Header Bar */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between relative z-20 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-black"></div>
          <span className="font-bold tracking-wider text-sm uppercase">Jam Session</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
          <Radio className="w-3.5 h-3.5 animate-pulse text-black" />
          <span>REALTIME P2P AUDIO</span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-20">
        <div className="w-full max-w-xl">
          {/* Hero text */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight mb-2">
              Jam Together
            </h1>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              Synchronized, zero-budget music listening room for couples and friends.
            </p>
          </div>

          {/* Tab Strip + Curtain Drawers */}
          <div 
            className="border border-black overflow-hidden bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-300"
          >
            <div className="flex border-b border-black">
              {/* Create Room Tab */}
              <button
                type="button"
                onClick={() => handleTabClick("create")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors border-r border-black font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "create" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
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
                  activeTab === "join" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
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
                    <Label htmlFor="create-name" className="text-xs font-mono uppercase text-gray-700">
                      Your Nickname
                    </Label>
                    <Input
                      id="create-name"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium"
                      autoFocus={activeTab === "create"}
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

              {/* Join Room Drawer */}
              <div 
                className={`transition-all duration-500 ease-in-out ${
                  activeTab === "join" ? "max-h-[350px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"
                }`}
              >
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
                      className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium"
                      autoFocus={activeTab === "join"}
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
                      className="bg-gray-50 border-gray-300 text-black uppercase font-mono tracking-widest placeholder-gray-400 focus:border-black font-semibold"
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
            </div>
          </div>

          {/* Quick info feature card */}
          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs text-gray-600 font-mono">
            <div className="p-3 border border-gray-200 bg-white/80 backdrop-blur-sm">
              <span className="font-bold text-black block mb-1">01. SYNC</span>
              Exact track time alignment
            </div>
            <div className="p-3 border border-gray-200 bg-white/80 backdrop-blur-sm">
              <span className="font-bold text-black block mb-1">02. CO-OP</span>
              Both can add songs & reorder
            </div>
            <div className="p-3 border border-gray-200 bg-white/80 backdrop-blur-sm">
              <span className="font-bold text-black block mb-1">03. FREE</span>
              No ads, 0 data stored
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20 bg-white/80 backdrop-blur-sm">
        Jam Together &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Index;