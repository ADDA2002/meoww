import { AlertCircle } from "lucide-react";

interface HostStatusBannerProps {
  isHost: boolean;
}

export function HostStatusBanner({ isHost }: HostStatusBannerProps) {
  if (isHost) return null;

  return (
    <div className="mt-4 p-2.5 bg-gray-50 border border-gray-200 text-xs text-gray-600 font-mono flex items-center gap-2">
      <AlertCircle className="w-4 h-4 text-black flex-shrink-0" />
      <span>Host controls playback. All can add and organize songs below.</span>
    </div>
  );
}