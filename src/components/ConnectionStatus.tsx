import { Wifi, WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 ${isConnected ? "text-green-600" : "text-red-500"}`}>
      {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
      <span>{isConnected ? "CONNECTED" : "OFFLINE"}</span>
    </div>
  );
}

interface OfflineBannerProps {
  onRetry: () => void;
}

export function OfflineBanner({ onRetry }: OfflineBannerProps) {
  return (
    <div className="bg-amber-50 border-b border-amber-300 px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm font-mono text-amber-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Connection lost. Trying to reconnect...</span>
      </div>
      <Button
        onClick={onRetry}
        size="sm"
        className="bg-black hover:bg-neutral-800 text-white font-mono text-xs font-bold px-3 py-1.5"
      >
        <RefreshCw className="w-3.5 h-3.5 mr-1.5" />RETRY
      </Button>
    </div>
  );
}