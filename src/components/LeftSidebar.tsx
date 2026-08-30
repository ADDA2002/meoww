import { useState } from "react";
import { Radio, X } from "lucide-react";

interface LeftSidebarProps {
  children?: React.ReactNode;
}

const LeftSidebar = ({ children }: LeftSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Toggle Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-50 bg-black text-white px-2 py-3 rounded-r-xl shadow-lg hover:bg-neutral-800 transition-colors"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      >
        {isOpen ? (
          <X className="w-4 h-4" />
        ) : (
          <span className="text-xs font-bold tracking-widest uppercase">Menu</span>
        )}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-white border-r border-black shadow-[4px_0_16px_rgba(0,0,0,0.15)] z-40 transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-black"></div>
            <span className="font-bold tracking-wider text-sm uppercase">Menu</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Content */}
        <div className="p-4">
          {children || (
            <div className="text-sm text-gray-500 font-mono text-center py-8">
              Add your content here...
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default LeftSidebar;