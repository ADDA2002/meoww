import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";

const Header = ({ showRoomOptions = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isRoomPage = location.pathname.startsWith("/room/");

  return (
    <header
      className="border-b border-gray-200 fixed top-0 left-0 right-0 z-50 bg-white shadow-sm"
    >
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
            onClick={() => {
              // This will be handled by the RoomDrawer in the Room page
              // We just need to make sure the RoomDrawer is open
              // The Room page handles this state internally
            }}
            className="hover:bg-gray-100 p-1 rounded"
            aria-label="Open room options"
          >
            <Menu className="w-4 h-4 text-gray-600 hover:text-black transition-colors" />
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;