import { useState } from "react";
import { Disc3, Radio } from "lucide-react";

interface MonoFrameProps {
  size?: "sm" | "md" | "lg";
  showControls?: boolean;
}

const MonoFrame = ({ size = "md", showControls = true }: MonoFrameProps) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const sizes = {
    sm: { frame: "w-32 h-20", disc: "w-12 h-12", screen: "h-10" },
    md: { frame: "w-48 h-28", disc: "w-16 h-16", screen: "h-14" },
    lg: { frame: "w-64 h-36", disc: "w-20 h-20", screen: "h-20" },
  };

  const currentSize = sizes[size];

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Monoframe device body */}
      <div
        className={`${currentSize.frame} bg-black border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.3)] relative overflow-hidden rounded-sm`}
      >
        {/* Top brand strip */}
        <div className="absolute top-0 left-0 right-0 h-4 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-2">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            <span className="text-[8px] font-mono font-bold text-white tracking-wider">MONOFRAME</span>
          </div>
          <Radio className="w-2.5 h-2.5 text-white/60" />
        </div>

        {/* Main display area */}
        <div className={`${currentSize.screen} mt-4 mx-2 bg-gradient-to-br from-gray-800 to-gray-900 relative border border-gray-700 rounded-sm overflow-hidden`}>
          {/* Grid lines on display */}
          <div className="absolute inset-0 opacity-10">
            <div className="grid grid-cols-6 grid-rows-3 h-full w-full">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="border border-white/20"></div>
              ))}
            </div>
          </div>

          {/* Center hole indicator */}
          <div className="absolute top-1 left-1 text-[7px] font-mono text-white/70 tracking-wider">SYNC</div>
          <div className="absolute top-1 right-1 text-[7px] font-mono text-white/70 tracking-wider">P2P</div>
          
          {/* Bottom frequency bars */}
          <div className="absolute bottom-1 left-1 right-1 flex items-end justify-center gap-0.5 h-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="w-0.5 bg-white/40"
                style={{
                  height: `${30 + Math.random() * 70}%`,
                  animation: `pulse 1.${i}s ease-in-out infinite alternate`,
                }}
              ></div>
            ))}
          </div>
        </div>

        {/* Bottom controls */}
        {showControls && (
          <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <div className="w-1 h-1 bg-white/40 rounded-full"></div>
              <div className="w-1 h-1 bg-white/40 rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
            <div className="text-[7px] font-mono text-white/50 tracking-wider">LIVE</div>
          </div>
        )}
      </div>

      {/* Rotating disc - positioned on the right side */}
      <div
        className="absolute -right-3 top-1/2 -translate-y-1/2 cursor-pointer"
        onClick={() => setIsPaused(!isPaused)}
        onMouseEnter={() => setIsPaused(true)}
      >
        <div
          className={`${currentSize.disc} relative transition-transform duration-700`}
          style={{
            animation: isPaused || isHovered ? "none" : "spin 4s linear infinite",
            transform: isPaused || isHovered ? "rotate(45deg)" : undefined,
          }}
        >
          {/* Outer disc */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-700 via-gray-800 to-black border border-gray-600 shadow-inner">
            {/* Concentric grooves */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full border border-gray-600/30"
                style={{
                  top: `${10 + i * 12}%`,
                  left: `${10 + i * 12}%`,
                  right: `${10 + i * 12}%`,
                  bottom: `${10 + i * 12}%`,
                }}
              ></div>
            ))}
            {/* Reflective shine */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-transparent"></div>
          </div>
          
          {/* Center label */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/3 h-1/3 rounded-full bg-gradient-to-br from-gray-900 to-black border border-gray-700 flex items-center justify-center">
            <Disc3 className="w-1/2 h-1/2 text-white/70" strokeWidth={1.5} />
          </div>

          {/* Center hole */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-black"></div>
        </div>
      </div>
    </div>
  );
};

export default MonoFrame;