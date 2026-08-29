import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Index = () => {
  const [activePanel, setActivePanel] = useState<"create" | "join" | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Split Panel */}
      <div className="relative max-w-2xl mx-auto mt-10 px-4">
        <div className="flex h-20 overflow-hidden bg-white border border-gray-300 shadow-lg">
          {/* Create Room Panel */}
          <button
            onClick={() => setActivePanel(activePanel === "create" ? null : "create")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-500 hover:bg-gray-100 ${
              activePanel === "create" ? "bg-gray-200" : ""
            }`}
          >
            <span className="text-lg font-semibold text-black">Create Room</span>
            <ChevronLeft
              className={`h-5 w-5 text-gray-600 transition-all duration-500 ${
                activePanel === "create" ? "translate-x-2 opacity-100" : "translate-x-0 opacity-0"
              }`}
            />
            <ChevronRight
              className={`h-5 w-5 text-gray-600 transition-all duration-500 ${
                activePanel === "create" ? "translate-x-0 opacity-0" : "translate-x-2 opacity-100"
              }`}
            />
          </button>

          {/* Divider */}
          <div className="w-px bg-gray-300" />

          {/* Join Room Panel */}
          <button
            onClick={() => setActivePanel(activePanel === "join" ? null : "join")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-500 hover:bg-gray-100 ${
              activePanel === "join" ? "bg-gray-200" : ""
            }`}
          >
            <span className="text-lg font-semibold text-black">Join Room</span>
            <ChevronRight
              className={`h-5 w-5 text-gray-600 transition-all duration-500 ${
                activePanel === "join" ? "translate-x-2 opacity-100" : "translate-x-0 opacity-0"
              }`}
            />
            <ChevronLeft
              className={`h-5 w-5 text-gray-600 transition-all duration-500 ${
                activePanel === "join" ? "translate-x-0 opacity-0" : "translate-x-2 opacity-100"
              }`}
            />
          </button>
        </div>

        {/* Sliding Content Under Panel */}
        <div
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{
            maxHeight: activePanel ? "300px" : "0px",
            opacity: activePanel ? 1 : 0,
          }}
        >
          <div
            className="bg-white/80 backdrop-blur-md border border-gray-300 border-t-0 p-6"
            style={{
              transform: activePanel === "create"
                ? "translateX(0)"
                : activePanel === "join"
                ? "translateX(0)"
                : "translateX(-20px)",
            }}
          >
            {activePanel === "create" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-left duration-500">
                <h3 className="text-xl font-semibold text-center mb-4 text-black">Create a Room</h3>
                <div className="space-y-2">
                  <Label className="text-gray-700">Your Name</Label>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Enter your name..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
                  />
                </div>
                <Button
                  className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
                  disabled={!createName.trim()}
                >
                  Create Room
                </Button>
              </div>
            )}

            {activePanel === "join" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
                <h3 className="text-xl font-semibold text-center mb-4 text-black">Join a Room</h3>
                <div className="space-y-2">
                  <Label className="text-gray-700">Your Name</Label>
                  <Input
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="Enter your name..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Room Code</Label>
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter room code..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
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
        </div>
      </div>

      {/* Dropdown Drawers Below */}
      <div className="max-w-2xl mx-auto mt-6 px-4 space-y-4">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="create-drawer" className="border border-gray-300 bg-white">
            <AccordionTrigger className="text-black hover:text-gray-600 px-6 py-4 text-lg font-medium">
              <span className="flex items-center gap-3">
                <span className="text-2xl">🎵</span>
                Create a Room
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">Your Name</Label>
                  <Input
                    placeholder="Enter your name..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
                  />
                </div>
                <Button className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors">
                  Create Room
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="join-drawer" className="border border-gray-300 bg-white">
            <AccordionTrigger className="text-black hover:text-gray-600 px-6 py-4 text-lg font-medium">
              <span className="flex items-center gap-3">
                <span className="text-2xl">🎧</span>
                Join a Room
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">Your Name</Label>
                  <Input
                    placeholder="Enter your name..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-700">Room Code</Label>
                  <Input
                    placeholder="Enter room code..."
                    className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
                  />
                </div>
                <Button className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors">
                  Join Room
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Footer */}
      <div className="text-center mt-16 pb-8">
        <p className="text-gray-500 text-sm">
          Jam Together — Listen in perfect sync
        </p>
      </div>
    </div>
  );
};

export default Index;