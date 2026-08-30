import { Radio, Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  showDrawerButton?: boolean;
}

const Header = ({ showDrawerButton = false }: HeaderProps = {}) => {
  const navigate = useNavigate();

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
      <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
        <Radio className="w-3.5 h-3.5 animate-pulse text-black" />
        <span>SYNCED</span>
      </div>
      {showDrawerButton && (
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hover:bg-gray-100 text-xs font-mono font-semibold p-2"
            aria-label="Open room options"
          >
            <Menu className="w-4 h-4" />
          </Button>
        </div>
      )}
    </header>
  );
};

export default Header;