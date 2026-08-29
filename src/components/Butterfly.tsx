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
      // Start off-screen left, swoop down, fly up, then off-screen right
      const x = -10 + progress * 120; // 110vw travel (with some overshoot)
      const waveY = Math.sin(progress * Math.PI * 3) * 15; // 3 wave oscillations
      const baseY = 20 + Math.sin(progress * Math.PI) * 25; // general vertical drift
      const y = baseY + waveY;

      setPosition({ x, y });
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, []);

  // Wing flapping animation
  useEffect(() => {
    const flapInterval = setInterval(() => {
      setFlapFrame((prev) => (prev + 1) % 8);
    }, 80); // 12.5 fps for smooth wing flap
    return () => clearInterval(flapInterval);
  }, []);

  // Calculate wing rotation based on flap frame
  const getWingTransform = (side: "left" | "right") => {
    const baseAngle = side === "left" ? 1 : 0; // left wing mirrored
    // Oscillate between -25 and 25 degrees for natural flapping
    const flapAngle = Math.sin((flapFrame / 8) * Math.PI * 2) * 30;
    const scale = 0.85 + Math.abs(Math.sin((flapFrame / 8) * Math.PI * 2)) * 0.15;
    return `scale(${side === "left" ? -scale : scale}, ${scale}) rotate(${baseAngle ? -flapAngle : flapAngle})`;
  };

  // Slight body rotation based on vertical movement
  const bodyRotation = Math.sin((position.y / 100) * Math.PI) * 8;

  return (
    <div
      className="fixed pointer-events-none z-30"
      style={{
        left: `${position.x}vw`,
        top: `${position.y}vh`,
        transition: "none",
        filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))",
      }}
    >
      <div
        style={{
          transform: `rotate(${bodyRotation}deg)`,
          transformOrigin: "center center",
        }}
      >
        <svg
          width="100"
          height="80"
          viewBox="0 0 100 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Wing gradients for realistic coloring */}
            <radialGradient id="upperWingGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1a1a2e" />
              <stop offset="40%" stopColor="#4a3f6b" />
              <stop offset="80%" stopColor="#7c3aed" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c026d3" stopOpacity="0.7" />
            </radialGradient>

            <radialGradient id="lowerWingGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e1b4b" />
              <stop offset="50%" stopColor="#6d28d9" />
              <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
            </radialGradient>

            <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="50%" stopColor="#0a0a0a" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>

            <linearGradient id="antennaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#000" />
              <stop offset="100%" stopColor="#333" />
            </linearGradient>
          </defs>

          {/* LEFT UPPER WING (forewing) */}
          <g style={{ transformOrigin: "50px 35px", transform: getWingTransform("left") }}>
            <path
              d="M 50 35 
                 C 35 15, 20 5, 5 8
                 C 0 12, 2 25, 8 35
                 C 15 40, 30 42, 45 40
                 C 48 38, 50 36, 50 35 Z"
              fill="url(#upperWingGradient)"
              stroke="#1a1a1a"
              strokeWidth="0.5"
            />
            {/* Wing veins */}
            <path
              d="M 50 35 Q 30 25, 10 15 M 50 35 Q 28 30, 8 28 M 50 35 Q 30 35, 12 35"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.3"
              fill="none"
            />
            {/* Wing spots/details */}
            <circle cx="20" cy="18" r="3" fill="rgba(236, 72, 153, 0.6)" />
            <circle cx="20" cy="18" r="1.2" fill="rgba(255,255,255,0.8)" />
            <circle cx="12" cy="25" r="2" fill="rgba(251, 191, 36, 0.5)" />
          </g>

          {/* RIGHT UPPER WING (forewing) */}
          <g style={{ transformOrigin: "50px 35px", transform: getWingTransform("right") }}>
            <path
              d="M 50 35 
                 C 65 15, 80 5, 95 8
                 C 100 12, 98 25, 92 35
                 C 85 40, 70 42, 55 40
                 C 52 38, 50 36, 50 35 Z"
              fill="url(#upperWingGradient)"
              stroke="#1a1a1a"
              strokeWidth="0.5"
            />
            <path
              d="M 50 35 Q 70 25, 90 15 M 50 35 Q 72 30, 92 28 M 50 35 Q 70 35, 88 35"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="0.3"
              fill="none"
            />
            <circle cx="80" cy="18" r="3" fill="rgba(236, 72, 153, 0.6)" />
            <circle cx="80" cy="18" r="1.2" fill="rgba(255,255,255,0.8)" />
            <circle cx="88" cy="25" r="2" fill="rgba(251, 191, 36, 0.5)" />
          </g>

          {/* LEFT LOWER WING (hindwing) */}
          <g style={{ transformOrigin: "50px 40px", transform: getWingTransform("left") }}>
            <path
              d="M 50 40
                 C 40 50, 25 60, 15 65
                 C 8 68, 5 60, 8 50
                 C 12 42, 30 40, 45 40
                 C 48 40, 50 40, 50 40 Z"
              fill="url(#lowerWingGradient)"
              stroke="#1a1a1a"
              strokeWidth="0.5"
            />
            <path
              d="M 50 40 Q 35 50, 18 60 M 50 40 Q 32 52, 14 55"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.3"
              fill="none"
            />
            <circle cx="22" cy="55" r="2" fill="rgba(251, 191, 36, 0.7)" />
            <circle cx="22" cy="55" r="0.8" fill="rgba(255,255,255,0.9)" />
          </g>

          {/* RIGHT LOWER WING (hindwing) */}
          <g style={{ transformOrigin: "50px 40px", transform: getWingTransform("right") }}>
            <path
              d="M 50 40
                 C 60 50, 75 60, 85 65
                 C 92 68, 95 60, 92 50
                 C 88 42, 70 40, 55 40
                 C 52 40, 50 40, 50 40 Z"
              fill="url(#lowerWingGradient)"
              stroke="#1a1a1a"
              strokeWidth="0.5"
            />
            <path
              d="M 50 40 Q 65 50, 82 60 M 50 40 Q 68 52, 86 55"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="0.3"
              fill="none"
            />
            <circle cx="78" cy="55" r="2" fill="rgba(251, 191, 36, 0.7)" />
            <circle cx="78" cy="55" r="0.8" fill="rgba(255,255,255,0.9)" />
          </g>

          {/* BODY (thorax + abdomen) */}
          <ellipse cx="50" cy="35" rx="2.5" ry="6" fill="url(#bodyGradient)" />
          <ellipse cx="50" cy="32" rx="2" ry="3" fill="#0a0a0a" />
          {/* Abdomen segments */}
          <line x1="50" y1="36" x2="50" y2="38" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />
          <line x1="50" y1="38" x2="50" y2="40" stroke="rgba(255,255,255,0.2)" strokeWidth="0.3" />

          {/* Head */}
          <circle cx="50" cy="28" r="2" fill="#0a0a0a" />

          {/* Antennae */}
          <path
            d="M 49 27 Q 47 22, 45 18"
            stroke="url(#antennaGradient)"
            strokeWidth="0.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 51 27 Q 53 22, 55 18"
            stroke="url(#antennaGradient)"
            strokeWidth="0.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Antenna tips */}
          <circle cx="45" cy="18" r="0.6" fill="#1a1a1a" />
          <circle cx="55" cy="18" r="0.6" fill="#1a1a1a" />

          {/* Legs (tiny, subtle) */}
          <line x1="48" y1="36" x2="46" y2="40" stroke="#0a0a0a" strokeWidth="0.3" />
          <line x1="52" y1="36" x2="54" y2="40" stroke="#0a0a0a" strokeWidth="0.3" />
          <line x1="48" y1="38" x2="45" y2="42" stroke="#0a0a0a" strokeWidth="0.3" />
          <line x1="52" y1="38" x2="55" y2="42" stroke="#0a0a0a" strokeWidth="0.3" />
        </svg>
      </div>
    </div>
  );
};

export default Butterfly;