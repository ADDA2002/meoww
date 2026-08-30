import { useLocation } from "react-router-dom";

interface HeaderProps {
  showRoomOptions?: boolean;
  onMenuClick?: () => void;
}

export const Header = ({ showRoomOptions = false, onMenuClick }: HeaderProps) => {
  const location = useLocation();
  const isRoomPage = location.pathname.startsWith("/room/");

  return (
    <header className="border-b border-gray-200 fixed top-0 left-0 right-0 z-50 bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/logo.gif"
            alt="Meoww Logo"
            className="w-8 h-8 object-contain"
          />
          <span className="font-extrabold tracking-wider text-lg uppercase">Meoww</span>
        </div>
        {(showRoomOptions || isRoomPage) && (
          <button
            onClick={onMenuClick}
            className="hover:bg-gray-100 p-1 rounded"
            aria-label="Open room options"
          >
            <span className="text-xs font-mono text-gray-500">SYNCED</span>
          </button>
        )}
      </div>
    </header>
  );
};