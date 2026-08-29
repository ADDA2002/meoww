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
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-950 text-white">
      {/* Split Panel */}
      <div className="relative max-w-2xl mx-auto mt-10 px-4">
        <div className="flex h-20 rounded-2xl overflow-hidden bg-blue-800/40 border border-blue-700/50 shadow-lg">
          {/* Create Room Panel */}
          <button
            onClick={() => setActivePanel(activePanel === "create" ? null : "create")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-500 hover:bg-blue-700/30 ${
              activePanel === "create" ? "bg-blue-700/50" : ""
            }`}
          >
            <span className="text-lg font-semibold">Create Room</span>
            <ChevronLeft
              className={`h-5 w-5 text-blue-300 transition-transform duration-500 ${
                activePanel === "create" ? "translate-x-2 opacity-100" : "translate-x-0 opacity-0"
              }`}
            />
            <ChevronRight
              className={`h-5 w-5 text-blue-300 transition-transform duration-500 ${
                activePanel === "create" ? "translate-x-0 opacity-0" : "translate-x-2 opacity-100"
              }`}
            />
          </button>

          {/* Divider */}
          <div className="w-px bg-blue-700/50" />

          {/* Join Room Panel */}
          <button
            onClick={() => setActivePanel(activePanel === "join" ? null : "join")}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-500 hover:bg-blue-700/30 ${
              activePanel === "join" ? "bg-blue-700/50" : ""
            }`}
          >
            <span className="text-lg font-semibold">Join Room</span>
            <ChevronRight
              className={`h-5 w-5 text-blue-300 transition-transform duration-500 ${
                activePanel === "join" ? "translate-x-2 opacity-100" : "translate-x-0 opacity-0"
              }`}
            />
            <ChevronLeft
              className={`h-5 w-5 text-blue-300 transition-transform duration-500 ${
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
            className="bg-blue-800/30 backdrop-blur-sm rounded-b-2xl border border-blue-700/50 border-t-0 p-6"
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
                <h3 className="text-xl font-semibold text-center mb-4">Create a Room</h3>
                <div className="space-y-2">
                  <Label className="text-blue-200">Your Name</Label>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Enter your name..."
                    className="bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
                  disabled={!createName.trim()}
                >
                  Create Room
                </Button>
              </div>
            )}

            {activePanel === "join" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right duration-500">
                <h3 className="text-xl font-semibold text-center mb-4">Join a Room</h3>
                <div className="space-y-2">
                  <Label className="text-blue-200">Your Name</Label>
                  <Input
                    value={joinName}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="Enter your name..."
                    className="bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-blue-200">Room Code</Label>
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter room code..."
                    className="text-uppercase bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors"
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
          <AccordionItem value="create-drawer" className="border border-blue-700/50 rounded-xl bg-blue-800/20">
            <AccordionTrigger className="text-blue-100 hover:text-blue-300 px-6 py-4 text-lg font-medium">
              <span className="flex items-center gap-3">
                <span className="text-2xl">🎵</span>
                Create a Room
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-blue-200">Your Name</Label>
                  <Input
                    placeholder="Enter your name..."
                    className="bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
                  Create Room
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="join-drawer" className="border border-blue-700/50 rounded-xl bg-blue-800/20">
            <AccordionTrigger className="text-blue-100 hover:text-blue-300 px-6 py-4 text-lg font-medium">
              <span className="flex items-center gap-3">
                <span className="text-2xl">🎧</span>
                Join a Room
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-blue-200">Your Name</Label>
                  <Input
                    placeholder="Enter your name..."
                    className="bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-blue-200">Room Code</Label>
                  <Input
                    placeholder="Enter room code..."
                    className="text-uppercase bg-blue-900/60 border-blue-600 text-white placeholder-blue-400"
                  />
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition-colors">
                  Join Room
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Footer */}
      <div className="text-center mt-16 pb-8">
        <p className="text-blue-500 text-sm">
          Jam Together — Listen in perfect sync
        </p>
      </div>
    </div>
  );
};

export default Index;