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
      // Simulate joining room
      setTimeout(() => {
        // In a real app, this would navigate to the room page
        alert(`Joined room ${roomCode} as ${userName}`);
        setIsJoining(false);
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-900 to-blue-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Join a Room</h1>
          <p className="text-blue-200">Enter your name and the room code</p>
        </div>

        <div className="space-y-6 bg-blue-800/30 backdrop-blur-sm rounded-xl p-6 border border-blue-700/50">
          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-blue-100">Your Name</Label>
            <Input
              id="user-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name..."
              className="bg-blue-900/50 border-blue-600 text-white placeholder-blue-400"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-room-code" className="text-blue-100">Room Code</Label>
            <Input
              id="join-room-code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Enter room code..."
              className="text-uppercase bg-blue-900/50 border-blue-600 text-white placeholder-blue-400"
            />
          </div>

          <Button
            onClick={handleJoinRoom}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
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