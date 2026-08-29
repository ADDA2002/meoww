import React, { useState, useEffect, useRef, useCallback } from "react";

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  wobble: number;
  opacity: number;
}

interface Burst {
  id: number;
  x: number;
  y: number;
  size: number;
  life: number;
  maxLife: number;
}

let nextBubbleId = 0;
let nextBurstId = 0;

const FloatingBubbles = () => {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const animationRef = useRef<number>();
  const bubblesRef = useRef<Bubble[]>([]);
  const burstsRef = useRef<Burst[]>([]);
  const timeRef = useRef<number>(0);

  // Sync refs
  useEffect(() => { bubblesRef.current = bubbles; }, [bubbles]);
  useEffect(() => { burstsRef.current = bursts; }, [bursts]);

  // Initial bubbles
  useEffect(() => {
    const initial: Bubble[] = Array.from({ length: 12 }, () => createBubble());
    setBubbles(initial);
  }, []);

  const createBubble = (): Bubble => ({
    id: nextBubbleId++,
    x: Math.random() * window.innerWidth,
    y: window.innerHeight + Math.random() * 200,
    size: 30 + Math.random() * 90,
    speed: 0.15 + Math.random() * 0.25,  // Much slower
    wobble: Math.random() * Math.PI * 2,
    opacity: 0.25 + Math.random() * 0.25,  // More subtle
  });

  // Animation loop
  useEffect(() => {
    const animate = () => {
      timeRef.current += 0.016;
      const w = window.innerWidth;

      // Update bubbles
      const updatedBubbles = bubblesRef.current.map((b) => {
        const newY = b.y - b.speed;
        // Subtle side-to-side wobble
        const wobbleOffset = Math.sin(timeRef.current * 0.4 + b.wobble) * 0.5;
        const newX = b.x + wobbleOffset;

        // Wrap horizontally
        if (newX < -b.size) return { ...b, x: w + b.size, y: newY };
        if (newX > w + b.size) return { ...b, x: -b.size, y: newY };
        return { ...b, x: newX, y: newY };
      }).filter((b) => b.y > -b.size * 2);

      // Respawn bubbles that floated off
      if (updatedBubbles.length < 12) {
        updatedBubbles.push(createBubble());
      }

      // Update bursts
      const updatedBursts = burstsRef.current
        .map((b) => ({ ...b, life: b.life - 1 }))
        .filter((b) => b.life > 0);

      bubblesRef.current = updatedBubbles;
      burstsRef.current = updatedBursts;
      setBubbles(updatedBubbles);
      setBursts(updatedBursts);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const burstBubble = useCallback((bubble: Bubble) => {
    setBubbles((prev) => prev.filter((b) => b.id !== bubble.id));
    setBursts((prev) => [
      ...prev,
      { id: nextBurstId++, x: bubble.x, y: bubble.y, size: bubble.size, life: 30, maxLife: 30 },
    ]);
    setTimeout(() => {
      const replacement = createBubble();
      replacement.x = Math.random() * window.innerWidth;
      replacement.y = window.innerHeight + 50;
      setBubbles((prev) => [...prev, replacement]);
    }, 2000 + Math.random() * 3000);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Bubbles - soft, natural soap bubble look */}
      {bubbles.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => burstBubble(b)}
          aria-label="Burst bubble"
          className="absolute pointer-events-auto cursor-pointer transition-transform hover:scale-105 active:scale-95 focus:outline-none"
          style={{
            left: `${b.x}px`,
            top: `${b.y}px`,
            width: `${b.size}px`,
            height: `${b.size}px`,
            opacity: b.opacity,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.85) 0%, rgba(245,250,255,0.3) 40%, rgba(220,235,250,0.08) 80%, transparent 100%)",
            border: "1px solid rgba(200,225,250,0.4)",
            boxShadow:
              "inset -8px -10px 20px rgba(150,180,210,0.08), inset 6px 6px 12px rgba(255,255,255,0.6), 0 0 25px rgba(200,225,250,0.15)",
            backdropFilter: "blur(1px)",
            WebkitBackdropFilter: "blur(1px)",
            transform: "translate(-50%, -50%)",
            padding: 0,
          }}
        >
          {/* Subtle highlight reflection */}
          <span
            className="absolute"
            style={{
              left: "25%",
              top: "20%",
              width: "22%",
              height: "16%",
              borderRadius: "50%",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 100%)",
              filter: "blur(1px)",
            }}
          />
        </button>
      ))}

      {/* Burst ripples */}
      {bursts.map((burst) => {
        const progress = 1 - burst.life / burst.maxLife;
        return (
          <React.Fragment key={burst.id}>
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${burst.x}px`,
                top: `${burst.y}px`,
                width: `${burst.size * (1 + progress * 1.5)}px`,
                height: `${burst.size * (1 + progress * 1.5)}px`,
                borderRadius: "50%",
                border: `1.5px solid rgba(200,230,255,${(burst.life / burst.maxLife) * 0.5})`,
                opacity: (burst.life / burst.maxLife) * 0.6,
                transform: "translate(-50%, -50%)",
              }}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${burst.x}px`,
                top: `${burst.y}px`,
                width: `${burst.size * (1 + progress * 2.2)}px`,
                height: `${burst.size * (1 + progress * 2.2)}px`,
                borderRadius: "50%",
                border: `1px solid rgba(220,240,255,${(burst.life / burst.maxLife) * 0.3})`,
                opacity: (burst.life / burst.maxLife) * 0.4,
                transform: "translate(-50%, -50%)",
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default FloatingBubbles;