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