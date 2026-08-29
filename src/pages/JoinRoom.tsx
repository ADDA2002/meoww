import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Peer from "peerjs";

const JoinRoom = () => {
  const [userName, setUserName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate that the room code has the correct format
  const isValidCodeFormat = (code: string) => {
    // Room codes are 6 uppercase alphanumeric characters
    return /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
  };

  // Check if the host's peer actually exists in the PeerJS network
  const checkRoomExists = (code: string): Promise<boolean> => {
    return new Promise((resolve) => {
      // The host's peer ID follows the pattern: meoww-room-{code lowercase}
      const hostPeerId = `meoww-room-${code.trim().toLowerCase()}`;

      // Use a temporary Peer to query the PeerJS server for this peer
      const checkPeer = new Peer({
        debug: 0,
      });

      // Set a hard timeout so users don't wait forever
      const timeout = setTimeout(() => {
        try { checkPeer.destroy(); } catch (e) { /* noop */ }
        resolve(false);
      }, 6000);

      checkPeer.on("open", () => {
        // Try connecting to the host — if it errors with peer-unavailable, room doesn't exist
        const conn = checkPeer.connect(hostPeerId, { reliable: true });

        const settle = (result: boolean) => {
          clearTimeout(timeout);
          try { conn.close(); } catch (e) { /* noop */ }
          try { checkPeer.destroy(); } catch (e) { /* noop */ }
          resolve(result);
        };

        conn.on("open", () => settle(true));
        conn.on("error", (err: any) => {
          if (err.type === "peer-unavailable" || err.type === "network") {
            settle(false);
          }
        });

        // Safety fallback in case neither event fires
        setTimeout(() => settle(false), 5000);
      });

      checkPeer.on("error", (err: any) => {
        clearTimeout(timeout);
        if (err.type === "peer-unavailable") {
          try { checkPeer.destroy(); } catch (e) { /* noop */ }
          resolve(false);
        }
        // For other errors (network/server down), let timeout handle it
      });
    });
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
      const roomExists = await checkRoomExists(cleanCode);
      if (!roomExists) {
        setError(`Room "${cleanCode}" doesn't exist. Check the code and try again.`);
        setIsJoining(false);
        return;
      }

      // Room exists, proceed to the room page
      window.location.href = `/room/${cleanCode}?name=${encodeURIComponent(userName.trim())}&host=false`;
    } catch (err) {
      setError("Couldn't verify the room. Check your connection and try again.");
      setIsJoining(false);
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
              onChange={(e) => {
                setUserName(e.target.value);
                setError(null);
              }}
              placeholder="Enter your name..."
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-room-code" className="text-gray-700">Room Code</Label>
            <Input
              id="join-room-code"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="Enter room code..."
              maxLength={6}
              className="bg-gray-100 border-gray-400 text-black placeholder-gray-500 uppercase font-mono tracking-widest"
            />
          </div>

          {error && (
            <div className="border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm font-mono">
              {error}
            </div>
          )}

          <Button
            onClick={handleJoinRoom}
            className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2 transition-colors"
            disabled={isJoining || !(userName.trim() && roomCode.trim())}
          >
            {isJoining ? "Checking room..." : "Join Room"}
          </Button>

          <div className="text-center">
            <a
              href="/"
              className="text-xs text-gray-500 hover:text-gray-800 font-mono underline"
            >
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom;