import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const NODE_COUNT = 52;
const CONNECT_DIST = 145;
const MOUSE_REPEL_DIST = 115;
const CLONE_INTERVAL_MS = 2400;
const MAX_NODES = 80;

interface NeuronNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulse: number; // 0–1, clone pulse intensity
  isCloneSource: boolean;
}

export function Landing() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NeuronNode[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const animRef = useRef<number>(0);
  const navigate = useNavigate();

  const spawnNodes = useCallback((w: number, h: number) => {
    nodesRef.current = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.55,
      vy: (Math.random() - 0.5) * 0.55,
      r: 2 + Math.random() * 2.2,
      pulse: 0,
      isCloneSource: false,
    }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (nodesRef.current.length === 0) {
        spawnNodes(canvas.width, canvas.height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Periodic clone burst: a random node pulses and spawns a child
    const cloneTimer = setInterval(() => {
      const nodes = nodesRef.current;
      if (!nodes.length) return;

      const src = nodes[Math.floor(Math.random() * nodes.length)];
      src.pulse = 1;
      src.isCloneSource = true;

      const clone: NeuronNode = {
        x: src.x + (Math.random() - 0.5) * 24,
        y: src.y + (Math.random() - 0.5) * 24,
        vx: src.vx + (Math.random() - 0.5) * 0.9,
        vy: src.vy + (Math.random() - 0.5) * 0.9,
        r: src.r * (0.8 + Math.random() * 0.4),
        pulse: 0.75,
        isCloneSource: false,
      };

      if (nodes.length < MAX_NODES) {
        nodes.push(clone);
      } else {
        // Replace the first fully-quiet node to keep count bounded
        const stale = nodes.findIndex((n) => n.pulse === 0 && !n.isCloneSource);
        if (stale >= 0) nodes[stale] = clone;
      }
    }, CLONE_INTERVAL_MS);

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      const nodes = nodesRef.current;
      const { x: mx, y: my } = mouseRef.current;

      ctx.clearRect(0, 0, w, h);

      // --- Physics ---
      for (const n of nodes) {
        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MOUSE_REPEL_DIST && dist > 0) {
          const strength = ((MOUSE_REPEL_DIST - dist) / MOUSE_REPEL_DIST) * 0.48;
          n.vx += (dx / dist) * strength;
          n.vy += (dy / dist) * strength;
        }

        // Dampen and cap speed
        n.vx *= 0.99;
        n.vy *= 0.99;
        const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (spd > 1.6) {
          n.vx = (n.vx / spd) * 1.6;
          n.vy = (n.vy / spd) * 1.6;
        }

        n.x += n.vx;
        n.y += n.vy;

        // Bounce
        if (n.x < 0) { n.x = 0; n.vx = Math.abs(n.vx); }
        else if (n.x > w) { n.x = w; n.vx = -Math.abs(n.vx); }
        if (n.y < 0) { n.y = 0; n.vy = Math.abs(n.vy); }
        else if (n.y > h) { n.y = h; n.vy = -Math.abs(n.vy); }

        // Decay pulse
        if (n.pulse > 0) {
          n.pulse = Math.max(0, n.pulse - 0.011);
          if (n.pulse === 0) n.isCloneSource = false;
        }
      }

      // --- Draw edges ---
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const edgeDx = a.x - b.x;
          const edgeDy = a.y - b.y;
          const edgeDist = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);

          if (edgeDist < CONNECT_DIST) {
            const baseAlpha = (1 - edgeDist / CONNECT_DIST) * 0.32;
            const pulseBoost = (a.pulse + b.pulse) * 0.38;
            const alpha = Math.min(0.85, baseAlpha + pulseBoost);

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
            ctx.lineWidth = 0.7 + (a.pulse + b.pulse) * 0.85;
            ctx.stroke();
          }
        }
      }

      // --- Draw nodes ---
      for (const n of nodes) {
        const radius = n.r + n.pulse * 4.5;

        if (n.pulse > 0.05) {
          // Radial glow halo
          const glowR = radius * 5.5;
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
          grd.addColorStop(0, `rgba(129,140,248,${n.pulse * 0.38})`);
          grd.addColorStop(1, 'rgba(99,102,241,0)');
          ctx.beginPath();
          ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        const baseAlpha = 0.72 + n.pulse * 0.28;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = n.isCloneSource
          ? `rgba(165,180,252,${baseAlpha})`
          : `rgba(99,102,241,${baseAlpha})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(cloneTimer);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [spawnNodes]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        textAlign: 'center',
        padding: '0 24px',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 64, color: 'var(--accent)', lineHeight: 1, filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.6))' }}>
          ⬡
        </div>
        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 56px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: 'var(--text)',
          margin: 0,
        }}>
          Cloned
        </h1>
        <p style={{
          fontSize: 'clamp(14px, 2vw, 18px)',
          color: 'var(--text-muted)',
          maxWidth: 460,
          lineHeight: 1.65,
          margin: 0,
        }}>
          A local-first agent operating system.
          <br />
          Your AI infrastructure, under your control.
        </p>
        <button
          className="btn-primary"
          onClick={() => navigate('/overview')}
          style={{
            padding: '11px 36px',
            fontSize: 15,
            fontWeight: 600,
            marginTop: 12,
            pointerEvents: 'all',
            letterSpacing: '-0.01em',
            boxShadow: '0 0 32px rgba(99,102,241,0.4)',
          }}
        >
          Enter Command Center →
        </button>
      </div>
    </div>
  );
}
