import { Disc3 } from "lucide-react";

interface VinylRecordProps {
  size?: "sm" | "md" | "lg" | "xl";
  title?: string;
  artist?: string;
  className?: string;
}

const VinylRecord = ({ size = "md", title, artist, className = "" }: VinylRecordProps) => {
  const sizes = {
    sm: { wrapper: "w-24 h-24", disc: "w-24 h-24", label: "w-8 h-8", icon: "w-4 h-4" },
    md: { wrapper: "w-40 h-40", disc: "w-40 h-40", label: "w-12 h-12", icon: "w-6 h-6" },
    lg: { wrapper: "w-56 h-56", disc: "w-56 h-56", label: "w-16 h-16", icon: "w-8 h-8" },
    xl: { wrapper: "w-72 h-72", disc: "w-72 h-72", label: "w-20 h-20", icon: "w-10 h-10" },
  };

  const s = sizes[size];

  return (
    <div className={`${s.wrapper} relative ${className}`}>
      {/* Outer sleeve/album cover behind the vinyl */}
      <div className="absolute inset-0 bg-black shadow-[6px_6px_0px_0px_rgba(0,0,0,0.4)]"></div>

      {/* Vinyl disc - constantly rotating */}
      <div
        className={`${s.disc} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-gray-800 shadow-2xl vinyl-rotate`}
      >
        {/* Concentric grooves */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full border border-gray-700/40"
            style={{
              top: `${8 + i * 9}%`,
              left: `${8 + i * 9}%`,
              right: `${8 + i * 9}%`,
              bottom: `${8 + i * 9}%`,
            }}
          ></div>
        ))}

        {/* Light reflection arc */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-transparent"></div>

        {/* Center label (album art) */}
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${s.label} rounded-full bg-gradient-to-br from-red-700 via-red-900 to-black border border-gray-700 flex items-center justify-center text-white text-center overflow-hidden`}>
          {title || artist ? (
            <div className="px-1 leading-tight">
              {title && <p className="text-[8px] font-bold uppercase tracking-wider truncate">{title}</p>}
              {artist && <p className="text-[7px] font-mono opacity-80 truncate">{artist}</p>}
            </div>
          ) : (
            <Disc3 className={`${s.icon} text-white/80`} strokeWidth={1.5} />
          )}
        </div>

        {/* Center spindle hole */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-black border border-gray-600"></div>
      </div>
    </div>
  );
};

export default VinylRecord;