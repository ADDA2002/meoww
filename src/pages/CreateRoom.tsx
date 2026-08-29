import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const CreateRoom = () => {
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);

  const handleCreateRoom = () => {
    if (roomName.trim()) {
      // Generate a random room code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomCode(code);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Create a Room</h1>
          <p className="text-blue-200">Enter your room name to get started</p>
        </div>

        {!roomCode ? (
          <div className="space-y-6 bg-blue-800/30 backdrop-blur-sm rounded-xl p-6 border border-blue-700/50">
            <div className="space-y-2">
              <Label htmlFor="room-name" className="text-blue-100">Room Name</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name..."
                className="bg-blue-900/50 border-blue-600 text-white placeholder-blue-400"
              />
            </div>
            <Button
              onClick={handleCreateRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              disabled={!roomName.trim()}
            >
              Create Room
            </Button>
          </div>
        ) : (
          <div className="space-y-6 bg-blue-800/30 backdrop-blur-sm rounded-xl p-6 border border-blue-700/50">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold">Room Created!</h2>
              <div className="space-y-2">
                <p className="text-blue-200">Your room name:</p>
                <p className="text-xl font-mono bg-blue-900/50 p-2 rounded border border-blue-600/50">
                  {roomName}
                </p>
                <p className="text-blue-200">Room code:</p>
                <p className="text-2xl font-bold font-mono bg-gradient-to-r from-blue-600 to-blue-400 p-3 rounded-lg border border-blue-500/50">
                  {roomCode}
                </p>
              </div>
              <p className="text-sm text-blue-300">
                Share this code with your partner to join the room
              </p>
            </div>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(roomCode);
                alert("Room code copied to clipboard!");
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Copy Room Code
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateRoom;