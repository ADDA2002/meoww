import { useState, useEffect, useRef, useCallback } from "react";

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
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
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
    y: window.innerHeight + Math.random() * 300,
    size: 30 + Math.random() * 70,
    speed: 0.4 + Math.random() * 0.8,
    wobble: Math.random() * Math.PI * 2,
    opacity: 0.15 + Math.random() * 0.25,
  });

  // Animation loop
  useEffect(() => {
    const animate = () => {
      timeRef.current += 0.016;
      const w = window.innerWidth;

      // Update bubbles
      const updatedBubbles = bubblesRef.current.map((b) => {
        const newY = b.y - b.speed;
        const wobbleOffset = Math.sin(timeRef.current * 0.8 + b.wobble) * 1.5;
        let newX = b.x + wobbleOffset;

        // Mouse push
        if (mouseRef.current) {
          const dx = newX - mouseRef.current.x;
          const dy = newY - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && dist > 0) {
            const force = (120 - dist) / 120;
            newX += (dx / dist) * force * 3;
          }
        }

        // Wrap
        if (newX < -b.size) newX = w + b.size;
        if (newX > w + b.size) newX = -b.size;

        return { ...b, x: newX, y: newY };
      }).filter((b) => b.y > -b.size * 2);

      // Respawn
      while (updatedBubbles.length < 10 && Math.random() > 0.95) {
        updatedBubbles.push(createBubble());
      }
      if (updatedBubbles.length < 6) {
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

  // Mouse tracking
  useEffect(() => {
    const handleMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    const handleLeave = () => { mouseRef.current = null; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  const burstBubble = useCallback((bubble: Bubble) => {
    setBubbles((prev) => prev.filter((b) => b.id !== bubble.id));
    setBursts((prev) => [
      ...prev,
      { id: nextBurstId++, x: bubble.x, y: bubble.y, size: bubble.size, life: 15, maxLife: 15 },
    ]);
    setTimeout(() => {
      const replacement = createBubble();
      replacement.x = Math.random() * window.innerWidth;
      setBubbles((prev) => [...prev, replacement]);
    }, 1000 + Math.random() * 2000);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Bubbles */}
      {bubbles.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => burstBubble(b)}
          aria-label="Burst bubble"
          className="absolute rounded-full pointer-events-auto cursor-pointer transition-transform hover:scale-110 active:scale-95 focus:outline-none"
          style={{
            left: `${b.x}px`,
            top: `${b.y}px`,
            width: `${b.size}px`,
            height: `${b.size}px`,
            opacity: b.opacity,
            background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(200,220,255,0.3) 50%, rgba(150,180,220,0.2))",
            border: "1px solid rgba(200,220,255,0.5)",
            boxShadow: "inset -4px -4px 10px rgba(100,150,200,0.2), inset 4px 4px 10px rgba(255,255,255,0.8), 0 0 15px rgba(200,220,255,0.3)",
            transform: "translate(-50%, -50%)",
            padding: 0,
          }}
        />
      ))}

      {/* Burst ripples */}
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="absolute rounded-full pointer-events-none border border-white/40"
          style={{
            left: `${burst.x}px`,
            top: `${burst.y}px`,
            width: `${burst.size * (1 + (1 - burst.life / burst.maxLife) * 0.8)}px`,
            height: `${burst.size * (1 + (1 - burst.life / burst.maxLife) * 0.8)}px`,
            opacity: (burst.life / burst.maxLife) * 0.6,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
};

export default FloatingBubbles;