import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Index = () => {
  const [slidePosition, setSlidePosition] = useState<"left" | "right">("left");
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const handleSlide = (direction: "left" | "right") => {
    setSlidePosition(direction);
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Main Container */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-black mb-2">Jam Together</h1>
            <p className="text-gray-600">Listen in perfect sync with your partner</p>
          </div>

          {/* Split Rectangle with Sliding Glass */}
          <div className="relative h-80 border border-gray-300 overflow-hidden">
            {/* Left Side - Create Room */}
            <div 
              className="absolute left-0 top-0 w-1/2 h-full flex flex-col items-center justify-center cursor-pointer z-10"
              onClick={() => handleSlide("left")}
            >
              <span className="text-xl font-semibold text-black">Create Room</span>
              <span className="text-gray-500 text-sm mt-1">Set up a new session</span>
            </div>

            {/* Right Side - Join Room */}
            <div 
              className="absolute right-0 top-0 w-1/2 h-full flex flex-col items-center justify-center cursor-pointer z-10"
              onClick={() => handleSlide("right")}
            >
              <span className="text-xl font-semibold text-black">Join Room</span>
              <span className="text-gray-500 text-sm mt-1">Enter a room code</span>
            </div>

            {/* Sliding Glass Rectangle */}
            <div 
              className="absolute top-0 w-1/2 h-full glass-effect transition-transform duration-500 ease-in-out z-20 flex items-center justify-center"
              style={{ 
                transform: slidePosition === "left" ? "translateX(0)" : "translateX(100%)",
                left: slidePosition === "left" ? "0" : "auto",
                right: slidePosition === "right" ? "0" : "auto",
              }}
            >
              {slidePosition === "left" ? (
                <div className="w-full p-6 space-y-4">
                  <h3 className="text-xl font-semibold text-center text-black mb-4">Create a Room</h3>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Your Name</Label>
                    <Input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Enter your name..."
                      className="bg-white/80 border-gray-400 text-black placeholder-gray-500"
                    />
                  </div>
                  <Button
                    className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                    disabled={!createName.trim()}
                  >
                    Create Room
                  </Button>
                </div>
              ) : (
                <div className="w-full p-6 space-y-4">
                  <h3 className="text-xl font-semibold text-center text-black mb-4">Join a Room</h3>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Your Name</Label>
                    <Input
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="Enter your name..."
                      className="bg-white/80 border-gray-400 text-black placeholder-gray-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-gray-700">Room Code</Label>
                    <Input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder="Enter room code..."
                      className="bg-white/80 border-gray-400 text-black placeholder-gray-500"
                    />
                  </div>
                  <Button
                    className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                    disabled={!joinName.trim() || !joinCode.trim()}
                  >
                    Join Room
                  </Button>
                </div>
              )}
            </div>

            {/* Center Divider */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300 z-30"></div>

            {/* Navigation Arrows */}
            <button 
              className={`absolute top-1/2 -translate-y-1/2 z-40 p-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors ${slidePosition === "left" ? "right-2" : "left-2"}`}
              onClick={() => handleSlide(slidePosition === "left" ? "right" : "left")}
            >
              {slidePosition === "left" ? (
                <ChevronRight className="h-5 w-5 text-black" />
              ) : (
                <ChevronLeft className="h-5 w-5 text-black" />
              )}
            </button>
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