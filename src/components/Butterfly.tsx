import { useEffect, useState } from "react";

const Butterfly = () => {
  const [position, setPosition] = useState({ x: -10, y: 30 });
  const [flapFrame, setFlapFrame] = useState(0);

  // Butterfly flight path - gentle wave motion across the screen
  useEffect(() => {
    let startTime: number | null = null;
    const duration = 18000; // 18 seconds to cross the screen

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = (elapsed % duration) / duration;

      // Create a graceful, curving flight path
      const x = -10 + progress * 120;
      const waveY = Math.sin(progress * Math.PI * 3) * 15;
      const baseY = 20 + Math.sin(progress * Math.PI) * 25;
      const y = baseY + waveY;

      setPosition({ x, y });
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, []);

  // Wing flapping animation - faster for visible flapping
  useEffect(() => {
    const flapInterval = setInterval(() => {
      setFlapFrame((prev) => (prev + 1) % 4);
    }, 100); // 10 fps - visible flapping
    return () => clearInterval(flapInterval);
  }, []);

  // Calculate wing rotation based on flap frame - 4 distinct flap positions
  const getWingTransform = (side: "left" | "right") => {
    // Discrete flap angles for clear up/down motion
    const flapAngles = [-45, 0, 45, 0];
    const currentAngle = flapAngles[flapFrame];
    const baseAngle = side === "left" ? currentAngle : -currentAngle;
    return `rotate(${baseAngle})`;
  };

  // Slight body rotation based on vertical movement
  const bodyRotation = Math.sin((position.y / 100) * Math.PI) * 8;

  return (
    <div
      className="fixed pointer-events-none z-30"
      style={{
        left: `${position.x}vw`,
        top: `${position.y}vh`,
        filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.2))",
      }}
    >
      <div
        style={{
          transform: `rotate(${bodyRotation}deg)`,
          transformOrigin: "center center",
        }}
      >
        <svg
          width="80"
          height="60"
          viewBox="0 0 100 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Monochromatic wing gradient */}
            <linearGradient id="upperWingGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#000000" />
              <stop offset="50%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#404040" />
            </linearGradient>

            <linearGradient id="lowerWingGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#666666" />
            </linearGradient>

            <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="50%" stopColor="#0a0a0a" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
          </defs>

          {/* LEFT UPPER WING */}
          <g
            style={{
              transformOrigin: "50px 35px",
              transform: getWingTransform("left"),
              transition: "transform 0.1s ease-in-out",
            }}
          >
            <path
              d="M 50 35 
                 C 35 15, 20 5, 5 8
                 C 0 12, 2 25, 8 35
                 C 15 40, 30 42, 45 40
                 C 48 38, 50 36, 50 35 Z"
              fill="url(#upperWingGradient)"
              stroke="#000"
              strokeWidth="1"
            />
            {/* Wing veins - white for contrast */}
            <path
              d="M 50 35 Q 30 25, 10 15 M 50 35 Q 28 30, 8 28 M 50 35 Q 30 35, 12 35"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.4"
              fill="none"
            />
            {/* Decorative spots */}
            <circle cx="20" cy="18" r="2.5" fill="rgba(255,255,255,0.9)" />
            <circle cx="20" cy="18" r="1" fill="#000" />
            <circle cx="12" cy="25" r="1.5" fill="rgba(255,255,255,0.7)" />
          </g>

          {/* RIGHT UPPER WING */}
          <g
            style={{
              transformOrigin: "50px 35px",
              transform: getWingTransform("right"),
              transition: "transform 0.1s ease-in-out",
            }}
          >
            <path
              d="M 50 35 
                 C 65 15, 80 5, 95 8
                 C 100 12, 98 25, 92 35
                 C 85 40, 70 42, 55 40
                 C 52 38, 50 36, 50 35 Z"
              fill="url(#upperWingGradient)"
              stroke="#000"
              strokeWidth="1"
            />
            <path
              d="M 50 35 Q 70 25, 90 15 M 50 35 Q 72 30, 92 28 M 50 35 Q 70 35, 88 35"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="0.4"
              fill="none"
            />
            <circle cx="80" cy="18" r="2.5" fill="rgba(255,255,255,0.9)" />
            <circle cx="80" cy="18" r="1" fill="#000" />
            <circle cx="88" cy="25" r="1.5" fill="rgba(255,255,255,0.7)" />
          </g>

          {/* LEFT LOWER WING */}
          <g
            style={{
              transformOrigin: "50px 40px",
              transform: getWingTransform("left"),
              transition: "transform 0.1s ease-in-out",
            }}
          >
            <path
              d="M 50 40
                 C 40 50, 25 60, 15 65
                 C 8 68, 5 60, 8 50
                 C 12 42, 30 40, 45 40
                 C 48 40, 50 40, 50 40 Z"
              fill="url(#lowerWingGradient)"
              stroke="#000"
              strokeWidth="1"
            />
            <path
              d="M 50 40 Q 35 50, 18 60 M 50 40 Q 32 52, 14 55"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.4"
              fill="none"
            />
            <circle cx="22" cy="55" r="1.8" fill="rgba(255,255,255,0.8)" />
            <circle cx="22" cy="55" r="0.7" fill="#000" />
          </g>

          {/* RIGHT LOWER WING */}
          <g
            style={{
              transformOrigin: "50px 40px",
              transform: getWingTransform("right"),
              transition: "transform 0.1s ease-in-out",
            }}
          >
            <path
              d="M 50 40
                 C 60 50, 75 60, 85 65
                 C 92 68, 95 60, 92 50
                 C 88 42, 70 40, 55 40
                 C 52 40, 50 40, 50 40 Z"
              fill="url(#lowerWingGradient)"
              stroke="#000"
              strokeWidth="1"
            />
            <path
              d="M 50 40 Q 65 50, 82 60 M 50 40 Q 68 52, 86 55"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.4"
              fill="none"
            />
            <circle cx="78" cy="55" r="1.8" fill="rgba(255,255,255,0.8)" />
            <circle cx="78" cy="55" r="0.7" fill="#000" />
          </g>

          {/* BODY (thorax + abdomen) */}
          <ellipse cx="50" cy="35" rx="2.5" ry="7" fill="url(#bodyGradient)" />
          <ellipse cx="50" cy="30" rx="2" ry="3" fill="#0a0a0a" />
          {/* Abdomen segments */}
          <line x1="50" y1="36" x2="50" y2="38" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
          <line x1="50" y1="39" x2="50" y2="41" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />

          {/* Head */}
          <circle cx="50" cy="26" r="2.2" fill="#0a0a0a" />

          {/* Antennae */}
          <path
            d="M 49 25 Q 47 20, 45 16"
            stroke="#000"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 51 25 Q 53 20, 55 16"
            stroke="#000"
            strokeWidth="0.6"
            fill="none"
            strokeLinecap="round"
          />
          {/* Antenna tips */}
          <circle cx="45" cy="16" r="0.8" fill="#000" />
          <circle cx="55" cy="16" r="0.8" fill="#000" />

          {/* Legs */}
          <line x1="48" y1="36" x2="46" y2="40" stroke="#0a0a0a" strokeWidth="0.4" />
          <line x1="52" y1="36" x2="54" y2="40" stroke="#0a0a0a" strokeWidth="0.4" />
          <line x1="48" y1="38" x2="45" y2="42" stroke="#0a0a0a" strokeWidth="0.4" />
          <line x1="52" y1="38" x2="55" y2="42" stroke="#0a0a0a" strokeWidth="0.4" />
        </svg>
      </div>
    </div>
  );
};

export default Butterfly;