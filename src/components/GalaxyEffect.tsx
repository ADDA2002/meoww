import { useEffect, useRef } from "react";

interface GalaxyEffectProps {
  className?: string;
  density?: "low" | "medium" | "high";
}

const GalaxyEffect = ({ className = "", density = "medium" }: GalaxyEffectProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const setSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();
    window.addEventListener("resize", setSize);

    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const starCount =
      density === "high" ? 1800 : density === "low" ? 500 : 1100;
    const armCount = 4;
    const armSpread = 0.45;

    type Star = {
      x: number;
      y: number;
      z: number;
      baseAngle: number;
      armOffset: number;
      radius: number;
      size: number;
      brightness: number;
      color: { r: number; g: number; b: number };
      twinkleSpeed: number;
      twinkleOffset: number;
    };

    const stars: Star[] = [];

    // Distribute stars into spiral arms + central bulge + outer halo
    for (let i = 0; i < starCount; i++) {
      // Central bulge (denser, more glowy)
      const bulge = Math.random();
      let radius: number;
      let angle: number;
      let sizeBase: number;
      let brightness: number;

      if (bulge < 0.25) {
        // Bright central bulge
        radius = Math.pow(Math.random(), 2) * (rect.width * 0.08);
        angle = Math.random() * Math.PI * 2;
        sizeBase = 1.2 + Math.random() * 1.8;
        brightness = 0.7 + Math.random() * 0.3;
      } else if (bulge < 0.85) {
        // Spiral arm
        const armIndex = Math.floor(Math.random() * armCount);
        const t = Math.random();
        radius = t * (Math.max(rect.width, rect.height) * 0.55);
        angle =
          armIndex * ((Math.PI * 2) / armCount) +
          t * 6.5 +
          (Math.random() - 0.5) * armSpread * (radius * 0.15);
        sizeBase = 0.4 + Math.random() * 1.2 * (1 - t * 0.6);
        brightness = 0.3 + Math.random() * 0.6;
      } else {
        // Outer halo
        radius =
          Math.max(rect.width, rect.height) * 0.3 +
          Math.random() * Math.max(rect.width, rect.height) * 0.25;
        angle = Math.random() * Math.PI * 2;
        sizeBase = 0.3 + Math.random() * 0.8;
        brightness = 0.15 + Math.random() * 0.4;
      }

      // Star color - mostly white, with some blue, yellow and red tints
      const colorRoll = Math.random();
      let color: { r: number; g: number; b: number };
      if (colorRoll < 0.55) {
        color = { r: 255, g: 255, b: 255 }; // white
      } else if (colorRoll < 0.78) {
        color = { r: 180, g: 210, b: 255 }; // blue
      } else if (colorRoll < 0.92) {
        color = { r: 255, g: 230, b: 180 }; // warm yellow
      } else {
        color = { r: 255, g: 170, b: 150 }; // red giant
      }

      stars.push({
        x: 0,
        y: 0,
        z: Math.random() * 0.6 + 0.4,
        baseAngle: angle,
        armOffset: 0,
        radius,
        size: sizeBase,
        brightness,
        color,
        twinkleSpeed: 0.5 + Math.random() * 2.5,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    let rotation = 0;
    let frame = 0;
    let rafId = 0;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Deep space background gradient
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rect.width * 0.7);
      bg.addColorStop(0, "rgba(40, 20, 80, 0.6)");
      bg.addColorStop(0.3, "rgba(20, 10, 50, 0.4)");
      bg.addColorStop(0.7, "rgba(5, 5, 20, 0.2)");
      bg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Soft nebula clouds (purple/blue/pink)
      const nebulaGroups = [
        { x: cx - rect.width * 0.18, y: cy - rect.height * 0.1, r: rect.width * 0.25, color: "rgba(140, 80, 200, 0.07)" },
        { x: cx + rect.width * 0.2, y: cy + rect.height * 0.12, r: rect.width * 0.28, color: "rgba(80, 120, 220, 0.06)" },
        { x: cx - rect.width * 0.1, y: cy + rect.height * 0.2, r: rect.width * 0.2, color: "rgba(220, 100, 180, 0.05)" },
        { x: cx + rect.width * 0.05, y: cy - rect.height * 0.22, r: rect.width * 0.22, color: "rgba(100, 180, 220, 0.05)" },
      ];

      nebulaGroups.forEach((n) => {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        g.addColorStop(0, n.color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, rect.width, rect.height);
      });

      // Bright galactic core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, rect.width * 0.18);
      core.addColorStop(0, "rgba(255, 240, 220, 0.55)");
      core.addColorStop(0.2, "rgba(255, 200, 160, 0.25)");
      core.addColorStop(0.5, "rgba(180, 120, 200, 0.1)");
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, rect.width * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Draw stars with subtle rotation
      rotation += 0.0004;
      const t = frame * 0.016;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        // Subtle differential rotation (inner spins faster)
        const rotAmount = rotation * (1 / (1 + s.radius * 0.04));
        const a = s.baseAngle + rotAmount;
        const x = cx + Math.cos(a) * s.radius;
        const y = cy + Math.sin(a) * s.radius * 0.55; // vertical squash to look more galactic
        s.x = x;
        s.y = y;

        // Twinkle
        const tw = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
        const alpha = s.brightness * (0.55 + 0.45 * tw);

        // Star glow (radial gradient for brightness)
        const glowR = s.size * 4;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
        grad.addColorStop(0, `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${alpha})`);
        grad.addColorStop(0.4, `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${alpha * 0.3})`);
        grad.addColorStop(1, `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Bright core pixel
        ctx.fillStyle = `rgba(${s.color.r}, ${s.color.g}, ${s.color.b}, ${Math.min(1, alpha + 0.2)})`;
        ctx.beginPath();
        ctx.arc(x, y, s.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", setSize);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full h-full ${className}`}
      style={{ background: "#000" }}
    />
  );
};

export default GalaxyEffect;