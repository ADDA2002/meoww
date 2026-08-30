import React from "react";
import RoomDrawer from "@/components/RoomDrawer";

interface RoomHeaderProps {
  roomCode: string;
  userName: string;
  onLeave: () => void;
}

const RoomHeader: React.FC<RoomHeaderProps> = ({ roomCode, userName, onLeave }) => {
  return (
    <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-white">
      <div className="flex items-center gap-2">
        <img
          src="/logo.gif"
          alt="Meoww Logo"
          className="w-8 h-8 object-contain"
        />
        <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
      </div>
      <div className="flex items-center gap-2">
        <RoomDrawer
          roomCode={roomCode}
          userName={userName}
          onLeave={onLeave}
        />
      </div>
    </header>
  );
};

export default RoomHeader;