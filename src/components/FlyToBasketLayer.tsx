import React, { useEffect, useState } from 'react';

export interface FlyingTagItem {
  id: string;
  label: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  delayMs: number;
}

interface FlyToBasketLayerProps {
  items: FlyingTagItem[];
  onItemLanded: (id: string) => void;
}

// Evaluates cubic-bezier(0.5, 0, 0.2, 1) cleanly for progress t in [0, 1]
function cubicBezierEase(t: number): number {
  const x1 = 0.5;
  const y1 = 0;
  const x2 = 0.2;
  const y2 = 1;

  const sampleX = (u: number) =>
    3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const sampleY = (u: number) =>
    3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;

  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 12; i += 1) {
    u = (lo + hi) * 0.5;
    const x = sampleX(u);
    if (x < t) {
      lo = u;
    } else {
      hi = u;
    }
  }
  return sampleY(u);
}

const FlyingTagClone: React.FC<{
  item: FlyingTagItem;
  onLanded: (id: string) => void;
}> = ({ item, onLanded }) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: `translate3d(${item.startX}px, ${item.startY}px, 0) scale(1)`,
    opacity: 0,
  });

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      const timer = window.setTimeout(() => onLanded(item.id), 30);
      return () => window.clearTimeout(timer);
    }

    const duration = 620;
    const dx = item.targetX - item.startX;
    const dy = item.targetY - item.startY;
    const arcLift = Math.min(115, Math.max(58, Math.abs(dx) * 0.16 + 48));

    let rafId = 0;
    let startTime = 0;

    const delayTimer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!startTime) startTime = now;
        const elapsed = now - startTime;
        const rawT = Math.min(1, elapsed / duration);
        const eased = cubicBezierEase(rawT);

        const currentX = item.startX + dx * eased;
        const parabola = 4 * rawT * (1 - rawT);
        const currentY = item.startY + dy * eased - arcLift * parabola;
        const scale = 1 - 0.38 * eased;
        const opacity = rawT > 0.86 ? Math.max(0, 1 - (rawT - 0.86) / 0.14) : 1;

        setStyle({
          transform: `translate3d(${currentX}px, ${currentY}px, 0) scale(${scale})`,
          opacity,
        });

        if (rawT < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          onLanded(item.id);
        }
      };

      rafId = requestAnimationFrame(step);
    }, item.delayMs);

    return () => {
      window.clearTimeout(delayTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [item, onLanded]);

  return (
    <div
      style={style}
      className="fixed top-0 left-0 z-50 pointer-events-none px-2.5 py-1 rounded-md bg-[#FFFDF9] border border-[#C84B31] text-xs font-medium text-[#231F1D] shadow-sm whitespace-nowrap"
      aria-hidden="true"
    >
      {item.label}
    </div>
  );
};

export const FlyToBasketLayer: React.FC<FlyToBasketLayerProps> = ({
  items,
  onItemLanded,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50" aria-hidden="true">
      {items.map((item) => (
        <FlyingTagClone key={item.id} item={item} onLanded={onItemLanded} />
      ))}
    </div>
  );
};
