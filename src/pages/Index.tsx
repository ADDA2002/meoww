import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Radio, Music2, Headphones } from "lucide-react";
import AnimatedDrawer from "@/components/AnimatedDrawer";

const Index = () => {
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

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between relative overflow-hidden">
      {/* Header Bar */}
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between relative z-20">
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
          {/* Hero text with 3D entrance animation */}
          <div className="text-center mb-6 hero-entrance">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight mb-2">
              Jam Together
            </h1>
            <p className="text-gray-600 text-sm max-w-md mx-auto">
              Synchronized, zero-budget music listening room for couples and friends.
            </p>
          </div>

          {/* Tab Strip + Curtain Drawers */}
          <div className="border border-black overflow-hidden bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] card-rise">
            <div className="flex border-b border-black">
              {/* Create Room Tab */}
              <button
                type="button"
                onClick={() => handleTabClick("create")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors border-r border-black font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "create" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                <Music2 className="w-4 h-4" />
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
                <Headphones className="w-4 h-4" />
                <span>Join Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "join" ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Animated Drawer */}
            <AnimatedDrawer
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              createName={createName}
              setCreateName={setCreateName}
              joinName={joinName}
              setJoinName={setJoinName}
              joinCode={joinCode}
              setJoinCode={setJoinCode}
            />
          </div>

          {/* Quick info feature cards with card-rise entry animation */}
          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs text-gray-600 font-mono">
            <div className="p-3 border border-gray-200 bg-white card-rise">
              <span className="font-bold text-black block mb-1">01. SYNC</span>
              Exact track time alignment
            </div>
            <div className="p-3 border border-gray-200 bg-white card-rise" style={{ animationDelay: "0.1s" }}>
              <span className="font-bold text-black block mb-1">02. CO-OP</span>
              Both can add songs & reorder
            </div>
            <div className="p-3 border border-gray-200 bg-white card-rise" style={{ animationDelay: "0.2s" }}>
              <span className="font-bold text-black block mb-1">03. FREE</span>
              No ads, 0 data stored
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Jam Together &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Index;