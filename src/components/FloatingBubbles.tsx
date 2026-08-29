import { useState, useEffect, useRef, useCallback } from "react";

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  hue: number;
  opacity: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

let nextBubbleId = 0;
let nextParticleId = 0;

const PALETTE = [
  "#FF6B6B", // coral red
  "#FFD93D", // sunny yellow
  "#6BCB77", // fresh green
  "#4D96FF", // ocean blue
  "#9B59B6", // purple
  "#FF9F1C", // orange
  "#00C2A8", // teal
  "#FF5DA2", // pink
];

const FloatingBubbles = () => {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const animationRef = useRef<number>();
  const bubblesStateRef = useRef<Bubble[]>([]);
  const particlesStateRef = useRef<Particle[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);

  // Sync refs with state
  useEffect(() => {
    bubblesStateRef.current = bubbles;
  }, [bubbles]);

  useEffect(() => {
    particlesStateRef.current = particles;
  }, [particles]);

  // Spawn initial bubbles
  useEffect(() => {
    const initial: Bubble[] = Array.from({ length: 18 }, () => createBubble());
    setBubbles(initial);
  }, []);

  const createBubble = (): Bubble => {
    return {
      id: nextBubbleId++,
      x: Math.random() * window.innerWidth,
      y: window.innerHeight + Math.random() * 200,
      size: 20 + Math.random() * 90,
      speed: 0.3 + Math.random() * 0.9,
      drift: (Math.random() - 0.5) * 0.6,
      hue: Math.floor(Math.random() * PALETTE.length),
      opacity: 0.35 + Math.random() * 0.4,
    };
  };

  // Animation loop
  useEffect(() => {
    const animate = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Update bubbles
      const updatedBubbles = bubblesStateRef.current.map((b) => {
        let newY = b.y - b.speed;
        let newX = b.x + Math.sin(newY * 0.008) * b.drift + b.drift * 0.3;

        // Gentle mouse repulsion
        if (mouseRef.current) {
          const dx = newX - mouseRef.current.x;
          const dy = newY - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const force = (150 - dist) / 150;
            newX += (dx / dist) * force * 4;
            newY += (dy / dist) * force * 4;
          }
        }

        // Wrap horizontally
        if (newX < -b.size) newX = w + b.size;
        if (newX > w + b.size) newX = -b.size;

        return { ...b, x: newX, y: newY };
      }).filter((b) => b.y > -b.size);

      // Respawn bubbles that float off
      while (
        updatedBubbles.length < 18 &&
        Math.random() > 0.97
      ) {
        updatedBubbles.push(createBubble());
      }
      if (updatedBubbles.length < 12) {
        updatedBubbles.push(createBubble());
      }

      // Update particles
      const updatedParticles = particlesStateRef.current
        .map((p) => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15, // gravity
          vx: p.vx * 0.98, // air resistance
          life: p.life - 1,
          size: Math.max(0, p.size - 0.3),
        }))
        .filter((p) => p.life > 0 && p.size > 0);

      bubblesStateRef.current = updatedBubbles;
      particlesStateRef.current = updatedParticles;

      setBubbles(updatedBubbles);
      setParticles(updatedParticles);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Track mouse for interaction
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseLeave = () => {
      mouseRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const burstBubble = useCallback((bubble: Bubble) => {
    // Remove the bubble
    setBubbles((prev) => prev.filter((b) => b.id !== bubble.id));

    // Generate burst particles
    const color = PALETTE[bubble.hue];
    const particleCount = Math.min(40, 12 + Math.floor(bubble.size / 3));
    const newParticles: Particle[] = Array.from({ length: particleCount }, () => {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 2 + Math.random() * 6;
      return {
        id: nextParticleId++,
        x: bubble.x,
        y: bubble.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 2,
        size: 4 + Math.random() * 8,
        color,
        life: 40 + Math.random() * 20,
      };
    });

    setParticles((prev) => [...prev, ...newParticles]);

    // Respawn a new bubble elsewhere
    setTimeout(() => {
      const replacement = createBubble();
      replacement.x = Math.random() * window.innerWidth;
      setBubbles((prev) => [...prev, replacement]);
    }, 800 + Math.random() * 1500);
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Bubbles */}
      {bubbles.map((b) => {
        const color = PALETTE[b.hue];
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => burstBubble(b)}
            aria-label="Burst bubble"
            className="absolute rounded-full pointer-events-auto cursor-pointer transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-black/30"
            style={{
              left: `${b.x}px`,
              top: `${b.y}px`,
              width: `${b.size}px`,
              height: `${b.size}px`,
              opacity: b.opacity,
              background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), ${color}55 40%, ${color}88 100%)`,
              border: `2px solid ${color}`,
              boxShadow: `0 0 20px ${color}66, inset -4px -4px 8px rgba(0,0,0,0.1), inset 4px 4px 8px rgba(255,255,255,0.5)`,
              transform: "translate(-50%, -50%)",
              padding: 0,
            }}
          />
        );
      })}

      {/* Burst particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            background: `radial-gradient(circle, ${p.color}, ${p.color}aa)`,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            opacity: p.life / 60,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
};

export default FloatingBubbles;