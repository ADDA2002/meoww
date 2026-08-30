import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Radio } from "lucide-react";
import Peer from "peerjs";
import { formatDisplayName, generateRoomCode, ROOM_CODE_CHARS } from "@/lib/constants";

const Index = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"create" | "join" | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);

  const handleTabClick = (tab: "create" | "join") => {
    setActiveTab(activeTab === tab ? null : tab);
    setJoinError(null);
  };

  const isValidCodeFormat = (code: string) => /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());

  // Check if room exists on PeerJS network
  const checkRoomExists = (code: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const hostPeerId = `meoww-room-${code.trim().toLowerCase()}`;
      const checkPeer = new Peer({ debug: 0 });

      const timeout = setTimeout(() => {
        try { checkPeer.destroy(); } catch (e) { /* noop */ }
        resolve(false);
      }, 6000);

      checkPeer.on("open", () => {
        const conn = checkPeer.connect(hostPeerId, { reliable: true });
        conn.on("open", () => { clearTimeout(timeout); try { conn.close(); } catch (e) { /* noop */ } try { checkPeer.destroy(); } catch (e) { /* noop */ } resolve(true); });
        conn.on("error", () => { clearTimeout(timeout); try { checkPeer.destroy(); } catch (e) { /* noop */ } resolve(false); });
        setTimeout(() => { clearTimeout(timeout); try { checkPeer.destroy(); } catch (e) { /* noop */ } resolve(false); }, 5000);
      });

      checkPeer.on("error", (err: any) => {
        clearTimeout(timeout);
        if (err.type === "peer-unavailable") { try { checkPeer.destroy(); } catch (e) { /* noop */ } resolve(false); }
      });
    });
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    const formattedName = formatDisplayName(createName);
    const generatedCode = generateRoomCode(6);
    navigate(`/room/${generatedCode}?name=${encodeURIComponent(formattedName)}&host=true`);
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
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

    setIsCheckingRoom(true);
    try {
      const roomExists = await checkRoomExists(cleanCode);
      if (!roomExists) {
        setJoinError(`Room "${cleanCode}" doesn't exist. Check the code and try again.`);
        setIsCheckingRoom(false);
        return;
      }
      navigate(`/room/${cleanCode}?name=${encodeURIComponent(formatDisplayName(joinName))}&host=false`);
    } catch {
      setJoinError("Couldn't verify the room. Check your connection and try again.");
      setIsCheckingRoom(false);
    }
  };

  // Animated cycling placeholder
  const CyclingPlaceholder = () => {
    const [displayCode, setDisplayCode] = useState(() => generateRoomCode(6));

    useEffect(() => {
      const interval = setInterval(() => setDisplayCode(generateRoomCode(6)), 4000);
      return () => clearInterval(interval);
    }, []);

    return <span className="text-gray-400 font-mono text-sm" style={{ letterSpacing: "0.4em" }}>{displayCode}</span>;
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between relative overflow-hidden">
      {/* Header */}
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

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-20">
        <div className="w-full max-w-xl">
          <div className="border border-black overflow-hidden bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex border-b border-black">
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

            {/* Create Tab */}
            <div className={`transition-all duration-500 ease-in-out ${activeTab === "create" ? "max-h-[300px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"}`}>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="create-name" className="text-xs font-mono uppercase text-gray-700">Your Nickname</Label>
                  <Input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Diva" className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium" autoFocus={activeTab === "create"} />
                </div>
                <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors" disabled={!createName.trim()}>
                  Start Session as Host
                </Button>
              </form>
            </div>

            {/* Join Tab */}
            <div className={`transition-all duration-500 ease-in-out ${activeTab === "join" ? "max-h-[450px] opacity-100 p-6" : "max-h-0 opacity-0 p-0 overflow-hidden"}`}>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="join-name" className="text-xs font-mono uppercase text-gray-700">Your Nickname</Label>
                  <Input id="join-name" value={joinName} onChange={(e) => { setJoinName(e.target.value); setJoinError(null); }} placeholder="e.g. Adi" className="bg-gray-50 border-gray-300 text-black placeholder-gray-400 focus:border-black font-medium" autoFocus={activeTab === "join"} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="join-code" className="text-xs font-mono uppercase text-gray-700">6-Letter Room Code</Label>
                  <div className="relative">
                    <Input id="join-code" value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }} placeholder="" maxLength={6} className="bg-gray-50 border-gray-300 text-black uppercase font-mono text-sm placeholder-gray-400 focus:border-black pl-3" style={{ letterSpacing: "0.4em" }} />
                    {!joinCode && <div className="absolute inset-0 flex items-center pl-3 pointer-events-none"><CyclingPlaceholder /></div>}
                  </div>
                </div>
                {joinError && <div className="border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-xs font-mono">{joinError}</div>}
                <Button type="submit" className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-2.5 text-sm uppercase tracking-wider transition-colors" disabled={isCheckingRoom || !joinName.trim() || !joinCode.trim()}>
                  {isCheckingRoom ? "Checking room..." : "Join Session"}
                </Button>
              </form>
            </div>
          </div>

          {/* Feature Cards */}
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

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 px-6 text-center text-xs text-gray-400 font-mono relative z-20">
        Meoww &bull; Monochromatic Audio Streamer
      </footer>
    </div>
  );
};

export default Index;