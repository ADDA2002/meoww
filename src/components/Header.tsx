import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Header = () => {
  const navigate = useNavigate();

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
        <button
          onClick={() => navigate("/")}
          className="hidden sm:block bg-gray-100 px-4 py-1 rounded text-sm text-gray-600 hover:bg-gray-200 transition-colors"
          aria-label="Go home"
        >
          Home
        </button>
      </div>
    </header>
  );
};

export default Header;