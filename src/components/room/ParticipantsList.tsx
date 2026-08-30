import React from "react";
import { Users } from "lucide-react";
import { RoomUser } from "@/types/music";

interface ParticipantsListProps {
  users: RoomUser[];
  myId: string;
  isHost: boolean;
  onTransferHost: (userId: string) => void;
}

const ParticipantsList: React.FC<ParticipantsListProps> = ({ users, myId, isHost, onTransferHost }) => {
  return (
    <div className="border border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-black" />
          <span className="font-bold text-xs uppercase tracking-wider">Participants ({users.length})</span>
        </div>
        <span className="text-xs font-mono text-gray-500">REALTIME</span>
      </div>

      <div className="space-y-2 max-h-36 overflow-y-auto">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-2 border border-gray-200 bg-gray-50 text-xs font-mono"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 bg-black"></div>
              <span className="font-semibold text-black truncate">
                {user.name} {user.id === myId ? "(You)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {user.isHost ? (
                <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase">
                  HOST
                </span>
              ) : isHost ? (
                <button
                  onClick={() => onTransferHost(user.id)}
                  className="bg-black text-white px-1.5 py-0.5 text-[10px] font-bold uppercase hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  MAKE HOST
                </button>
              ) : (
                <span className="text-gray-400 text-[10px]">Listener</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsList;