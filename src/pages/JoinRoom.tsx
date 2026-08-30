import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Header from "@/components/Header";
import { checkFirebaseRoomExists } from "@/services/firebaseRoomCheck";
import { formatDisplayName } from "@/utils/nameFormat";

const JoinRoom = () => {
  const [userName, setUserName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidCodeFormat = (code: string) => {
    return /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
  };

  const handleJoinRoom = async () => {
    setError(null);
    const cleanCode = roomCode.trim().toUpperCase();

    if (!userName.trim() || !cleanCode) {
      setError("Please enter your name and a room code.");
      return;
    }

    if (!isValidCodeFormat(cleanCode)) {
      setError("Invalid room code format. Room codes are 6 letters/numbers (e.g. X9KJ2B).");
      return;
    }

    setIsJoining(true);

    try {
      const roomExists = await checkFirebaseRoomExists(cleanCode);
      if (!roomExists) {
        setError(`Room "${cleanCode}" doesn't exist. Check the code and try again.`);
        setIsJoining(false);
        return;
      }
      const formattedName = formatDisplayName(userName);
      window.location.href = `/room/${cleanCode}?name=${encodeURIComponent(formattedName)}&host=false`;
    } catch (err) {
      setError("Couldn't verify the room. Check your connection and try again.");
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black py-12 px-4 sm:px-6 lg:px-8">
      <Header />
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4 text-black">Join a Room</h1>
          <p className="text-gray-600">Enter your name and the room code</p>
        </div>

        <div className="space-y-6 bg-white border border-gray-300 p-6">
          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-gray-700">Your Name</Label>
            <Input id="user-name" value={userName} onChange={(e) => { setUserName(e.target.value); setError(null); }}
              placeholder="Enter your name..."
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-room-code" className="text-gray-700">Room Code</Label>
            <Input id="join-room-code" value={roomCode} onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(null); }}
              placeholder="Enter room code..." maxLength={6}
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500 uppercase font-mono tracking-widest" />
          </div>

          {error && (
            <div className="border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm font-mono">
              {error}
            </div>
          )}

          <Button onClick={handleJoinRoom}
            className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
            disabled={isJoining || !(userName.trim() && roomCode.trim())}>
            {isJoining ? "Checking room..." : "Join Room"}
          </Button>

          <div className="text-center">
            <a href="/" className="text-xs text-gray-500 hover:text-gray-800 font-mono underline">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;