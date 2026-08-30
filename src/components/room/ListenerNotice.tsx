import React from "react";
import { AlertCircle } from "lucide-react";

interface ListenerNoticeProps {
  visible: boolean;
}

const ListenerNotice: React.FC<ListenerNoticeProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
      <span>Host controls playback. All can add and organize songs in the queue below.</span>
    </div>
  );
};

export default ListenerNotice;