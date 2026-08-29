import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";

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
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Jam Together</h1>
            <p className="text-gray-500">Listen in perfect sync with your partner</p>
          </div>

          {/* Tab Strip */}
          <div className="relative border border-gray-300 overflow-hidden">
            <div className="flex">
              {/* Create Room Tab */}
              <button
                onClick={() => handleTabClick("create")}
                className={`flex-1 py-4 flex items-center justify-center gap-2 transition-colors border-r border-gray-300 ${
                  activeTab === "create" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                <span className="font-medium">Create Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "create" ? "rotate-180" : ""}`} />
              </button>

              {/* Join Room Tab */}
              <button
                onClick={() => handleTabClick("join")}
                className={`flex-1 py-4 flex items-center justify-center gap-2 transition-colors ${
                  activeTab === "join" ? "bg-black text-white" : "bg-white text-black hover:bg-gray-100"
                }`}
              >
                <span className="font-medium">Join Room</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${activeTab === "join" ? "rotate-180" : ""}`} />
              </button>
            </div>

            {/* Drawers Container */}
            <div className="relative">
              {/* Create Room Drawer */}
              <div 
                className="absolute top-0 left-0 w-full overflow-hidden transition-all duration-500 ease-out"
                style={{ 
                  height: activeTab === "create" ? "220px" : "0px",
                  zIndex: activeTab === "create" ? 10 : 0,
                }}
              >
                <div className="bg-white border-t border-gray-300 h-[220px] p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-black">Create a Room</h3>
                    <div className="space-y-2">
                      <Label className="text-gray-700">Your Name</Label>
                      <Input
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Enter your name..."
                        className="bg-white border-gray-400 text-black placeholder-gray-500"
                      />
                    </div>
                    <Button
                      className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                      disabled={!createName.trim()}
                    >
                      Create Room
                    </Button>
                  </div>
                </div>
              </div>

              {/* Join Room Drawer */}
              <div 
                className="absolute top-0 left-0 w-full overflow-hidden transition-all duration-500 ease-out"
                style={{ 
                  height: activeTab === "join" ? "280px" : "0px",
                  zIndex: activeTab === "join" ? 10 : 0,
                }}
              >
                <div className="bg-white border-t border-gray-300 h-[280px] p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-black">Join a Room</h3>
                    <div className="space-y-2">
                      <Label className="text-gray-700">Your Name</Label>
                      <Input
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="Enter your name..."
                        className="bg-white border-gray-400 text-black placeholder-gray-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-700">Room Code</Label>
                      <Input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        placeholder="Enter room code..."
                        className="bg-white border-gray-400 text-black placeholder-gray-500"
                      />
                    </div>
                    <Button
                      className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                      disabled={!joinName.trim() || !joinCode.trim()}
                    >
                      Join Room
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6">
        <p className="text-gray-500 text-sm">Jam Together</p>
      </div>
    </div>
  );
};

export default Index;