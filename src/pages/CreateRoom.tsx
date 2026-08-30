import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Header from "@/components/Header";

const CreateRoom = () => {
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState<string | null>(null);

  const handleCreateRoom = () => {
    if (roomName.trim()) {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      setRoomCode(code);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black py-12 px-4 sm:px-6 lg:px-8">
      <Header />
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-black">Create a Room</h1>
          <p className="text-gray-600">Enter your room name to get started</p>
        </div>

        {!roomCode ? (
          <div className="space-y-6 bg-white border border-gray-300 p-6">
            <div className="space-y-2">
              <Label htmlFor="room-name" className="text-gray-700">Room Name</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter room name..."
                className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
              />
            </div>
            <Button
              onClick={handleCreateRoom}
              className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
              disabled={!roomName.trim()}
            >
              Create Room
            </Button>
          </div>
        ) : (
          <div className="space-y-6 bg-white border border-gray-300 p-6">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold text-black">Room Created!</h2>
              <div className="space-y-2">
                <p className="text-gray-600">Your room name:</p>
                <p className="text-xl font-mono bg-gray-100 p-2 border border-gray-300 text-black">
                  {roomName}
                </p>
                <p className="text-gray-600">Room code:</p>
                <p className="text-2xl font-bold font-mono bg-black text-white p-3 border border-gray-400">
                  {roomCode}
                </p>
              </div>
              <p className="text-sm text-gray-500">
                Share this code with your partner to join the room
              </p>
            </div>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(roomCode);
                alert("Room code copied to clipboard!");
              }}
              className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
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