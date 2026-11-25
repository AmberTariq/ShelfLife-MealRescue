import React, { useState } from 'react';

export const HeroLogo: React.FC = () => {
  const [tilt, setTilt] = useState({
    rotateX: 0,
    rotateY: 0,
    active: false,
  });

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;

    setTilt({
      rotateX: Number((-py * 11).toFixed(2)), // up to +/- 5.5deg
      rotateY: Number((px * 11).toFixed(2)), // up to +/- 5.5deg
      active: true,
    });
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    setTilt((prev) => ({ ...prev, active: true }));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || prefersReducedMotion()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rotateX: Number((-py * 9).toFixed(2)),
      rotateY: Number((px * 9).toFixed(2)),
      active: true,
    });
  };

  const handlePointerLeaveOrUp = () => {
    setTilt({ rotateX: 0, rotateY: 0, active: false });
  };

  const transformValue = tilt.active
    ? `translateY(-8px) scale(1.02) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`
    : 'translateY(0px) scale(1) rotateX(0deg) rotateY(0deg)';

  return (
    <div
      style={{ perspective: '1200px' }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerLeaveOrUp}
      onPointerCancel={handlePointerLeaveOrUp}
      onPointerLeave={handlePointerLeaveOrUp}
      className="relative flex items-center justify-center select-none w-full"
    >
      <div
        style={{
          transform: transformValue,
          transformStyle: 'preserve-3d',
          transition:
            'transform 280ms cubic-bezier(0.25, 0.8, 0.25, 1), filter 280ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          filter: tilt.active
            ? 'drop-shadow(0 18px 24px rgba(35, 31, 29, 0.14))'
            : 'drop-shadow(0 6px 12px rgba(35, 31, 29, 0.06))',
        }}
        className="w-full max-w-[150px] sm:max-w-[180px] min-[900px]:max-w-[210px] will-change-transform"
      >
        <img
          src="/assets/shelflife-rescued-logo.png"
          alt="Shelf-Life Rescued kitchen emblem showing a hand holding a tomato, basil, lemon, and egg"
          referrerPolicy="no-referrer"
          draggable={false}
          className="w-full h-auto block pointer-events-none"
        />
      </div>
    </div>
  );
};
