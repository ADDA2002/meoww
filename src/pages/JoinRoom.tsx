import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const JoinRoom = () => {
  const [userName, setUserName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinRoom = () => {
    if (userName.trim() && roomCode.trim()) {
      setIsJoining(true);
      setTimeout(() => {
        alert(`Joined room ${roomCode} as ${userName}`);
        setIsJoining(false);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-black">Join a Room</h1>
          <p className="text-gray-600">Enter your name and the room code</p>
        </div>

        <div className="space-y-6 bg-white border border-gray-300 p-6">
          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-gray-700">Your Name</Label>
            <Input
              id="user-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name..."
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-room-code" className="text-gray-700">Room Code</Label>
            <Input
              id="join-room-code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Enter room code..."
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
            />
          </div>

          <Button
            onClick={handleJoinRoom}
            className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
            disabled={isJoining || !(userName.trim() && roomCode.trim())}
          >
            {isJoining ? "Joining..." : "Join Room"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;