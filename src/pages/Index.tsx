import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Radio } from "lucide-react";
import { formatDisplayName } from "@/utils/nameFormat";

const ROOM_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Generate a random 6-character room code
const generateRandomCode = () => {
  return Array.from({ length: 6 }, () =>
    ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  ).join("");
};

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"create" | "join" | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleTabClick = (tab: "create" | "join") => {
    if (activeTab === tab) {
      setActiveTab(null);
      setJoinError(null);
    } else {
      setActiveTab(tab);
      setJoinError(null);
    }
  };

  const isValidCodeFormat = (code: string) => {
    return /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    const formattedName = formatDisplayName(createName);
    const generatedCode = generateRandomCode();
    navigate(`/room/${generatedCode}?name=${encodeURIComponent(formattedName)}&host=true`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const cleanCode = joinCode.trim().toUpperCase();

    if (!joinName.trim() || !cleanCode) {
      setJoinError("Please enter your nickname and a room code.");
      return;
    }

    if (!isValidCodeFormat(cleanCode)) {
      setJoinError("Invalid room code format. Room codes are 6 letters/numbers.");
      return;
    }

    const formattedName = formatDisplayName(joinName);
    navigate(`/room/${cleanCode}?name=${encodeURIComponent(formattedName)}&host=false`);
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between relative overflow-hidden">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
        <div className="flex items-center gap-2">
          <img src="/logo.gif" alt="Meoww Logo" className="w-8 h-8 object-contain" />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
          <Radio className="w-3.5 h-3.5 animate-pulse text-black" />
          <span>SYNCED</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-20">
        <div className="w-full max-w-xl">
          <div className="border border-black overflow-hidden bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-300">
            <div className="flex border-b border-black">
              <button type="button" onClick={() => handleTabClick("create")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors border-r border-black font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "create" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}>
                <span>Create Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "create" ? "rotate-180" : ""}`} />
              </button>
              <button type="button" onClick={() => handleTabClick("join")}
                className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 transition-colors font-semibold text-sm uppercase tracking-wider ${
                  activeTab === "join" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}>
                <span>Join Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "join" ? "rotate-180" : ""}`} />
              </button>
            </div>

            <div className="relative overflow-hidden">
              <div className={`transition-all duration-500 ease-in-out ${
                activeTab === "create" ? "max-h-[300px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"
              }`}>
                <form onSubmit={handleCreateRoom} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="create-name" className="text-xs font-mono uppercase text-gray-700">Your Nickname</Label>
                    <Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Diva"
                      className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium"
                      autoFocus={activeTab === "create"} />
                  </div>
                  <Button type="submit"
                    className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                    disabled={!createName.trim()}>
                    Start Session as Host
                  </Button>
                </form>
              </div>

              <div className={`transition-all duration-500 ease-in-out ${
                activeTab === "join" ? "max-h-[450px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"
              }`}>
                <form onSubmit={handleJoinRoom} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="join-name" className="text-xs font-mono uppercase text-gray-700">Your Nickname</Label>
                    <Input id="join-name" value={joinName} onChange={(e) => { setJoinName(e.target.value); setJoinError(null); }}
                      placeholder="e.g. Adi"
                      className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium"
                      autoFocus={activeTab === "join"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="join-code" className="text-xs font-mono uppercase text-gray-700">6-Letter Room Code</Label>
                    <Input id="join-code" value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }}
                      placeholder="e.g. X9KJ2B" maxLength={6}
                      className="bg-gray-50 border-gray-300 text-black uppercase font-mono tracking-widest placeholder-gray-400 focus:border-black text-lg" />
                  </div>
                  {joinError && (
                    <div className="border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-xs font-mono">
                      {joinError}
                    </div>
                  )}
                  <Button type="submit"
                    className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors"
                    disabled={!joinName.trim() || !joinCode.trim()}>
                    Join Session
                  </Button>
                </form>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-2 text-center text-xs text-gray-600 font-mono">
            <div className="p-3 border border-gray-200 bg-gray-50">
              <span className="font-bold text-black block mb-1">01. SYNC</span>
              Exact track time alignment
            </div>
            <div className="p-3 border border-gray-200 bg-gray-50">
              <span className="font-bold text-black block mb-1">02. CO-OP</span>
              All can add songs & reorder
            </div>
            <div className="p-3 border border-gray-200 bg-gray-50">
              <span className="font-bold text-black block mb-1">03. FREE</span>
              No ads, 0 data stored
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Index;