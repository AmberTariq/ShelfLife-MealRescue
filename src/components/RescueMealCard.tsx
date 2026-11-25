import React, { useEffect, useRef, useState } from 'react';
import { RescueMeal, UrgencyTier } from '../types/kitchen';
import { CheckIcon, ClockIcon, FlipIcon, SwapIcon } from './Icons';

interface RescueMealCardProps {
  meal: RescueMeal;
  index: number;
  isCooked: boolean;
  revealKey: number;
  onFocusMeal: (tier: UrgencyTier, clientX: number, clientY: number) => void;
  onMarkCooked: (
    meal: RescueMeal,
    ingredientAnchors: Array<{ label: string; rect: DOMRect }>
  ) => void;
}

const TIER_LABEL: Record<UrgencyTier, { text: string; color: string }> = {
  use_tonight: { text: 'Prioritizes Use Tonight', color: '#C84B31' },
  next_days: { text: 'Uses Next 2-3 Days', color: '#C68B2C' },
  pantry_buffer: { text: 'Pantry Staple Rescue', color: '#3D6B52' },
};

// Exact sine ease-in-out: -(cos(pi * t) - 1) / 2
function sineEaseInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export const RescueMealCard: React.FC<RescueMealCardProps> = ({
  meal,
  index,
  isCooked,
  revealKey,
  onFocusMeal,
  onMarkCooked,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [flipDeg, setFlipDeg] = useState(0);
  const flipDegRef = useRef(0);
  const animRef = useRef<number>(0);

  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0, liftY: 0 });
  const [pokedIngredient, setPokedIngredient] = useState<string | null>(null);

  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cookButtonRef = useRef<HTMLButtonElement | null>(null);

  // Reset flip when a fresh triage batch arrives
  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    setIsFlipped(false);
    setFlipDeg(0);
    flipDegRef.current = 0;
  }, [revealKey, meal.id]);

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleToggleFlip = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocusMeal(meal.focusTier, e.clientX, e.clientY);

    const nextFlipped = !isFlipped;
    setIsFlipped(nextFlipped);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const targetDeg = nextFlipped ? 180 : 0;
    if (prefersReduced) {
      flipDegRef.current = targetDeg;
      setFlipDeg(targetDeg);
      return;
    }

    if (animRef.current) cancelAnimationFrame(animRef.current);

    const startDeg = flipDegRef.current;
    const delta = targetDeg - startDeg;
    const duration = 720;
    let startTime = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const current = startDeg + delta * sineEaseInOut(t);
      flipDegRef.current = current;
      setFlipDeg(current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        flipDegRef.current = targetDeg;
        setFlipDeg(targetDeg);
      }
    };

    animRef.current = requestAnimationFrame(tick);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;

    setTilt({
      rotateX: Number((-py * 8).toFixed(2)),
      rotateY: Number((px * 8).toFixed(2)),
      liftY: -6,
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rotateX: 0, rotateY: 0, liftY: 0 });
  };

  const handleChipPoke = (e: React.MouseEvent, ingredient: string) => {
    e.stopPropagation();
    setPokedIngredient(null);
    requestAnimationFrame(() => setPokedIngredient(ingredient));
  };

  const handleCookClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onFocusMeal('pantry_buffer', e.clientX, e.clientY);

    const fallbackRect =
      cookButtonRef.current?.getBoundingClientRect() ??
      e.currentTarget.getBoundingClientRect();

    const anchors = meal.rescuedIngredients.map((label, idx) => {
      const chipEl = chipRefs.current[idx];
      return {
        label,
        rect: chipEl ? chipEl.getBoundingClientRect() : fallbackRect,
      };
    });

    onMarkCooked(meal, anchors);
  };

  const tierInfo = TIER_LABEL[meal.focusTier];

  return (
    <div
      style={{ animationDelay: `${index * 80}ms` }}
      className="card-stagger-enter card-perspective"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={(e) => onFocusMeal(meal.focusTier, e.clientX, e.clientY)}
    >
      {/* Outer tilt wrapper separated from inner 180deg flip stage */}
      <div
        style={{
          transform: `translate3d(0, ${tilt.liftY}px, 0) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          transition: 'transform 200ms cubic-bezier(.22, .8, .24, 1)',
          transformStyle: 'preserve-3d',
        }}
      >
        <div
          className="card-flip-stage"
          style={{
            transform: `rotateY(${flipDeg}deg)`,
          }}
        >
          {/* FRONT SUMMARY FACE */}
          <article
            aria-hidden={isFlipped}
            className="card-face bg-[#FFFDF9] border border-[#E5DDD0] rounded-xl p-5 sm:p-6 flex flex-col justify-between shadow-[0_2px_6px_rgba(35,31,29,0.04)]"
          >
            <div>
              {/* Clean unboxed metadata row */}
              <div className="flex items-center justify-between gap-2 text-xs pb-3 border-b border-[#E5DDD0]">
                <span className="font-medium" style={{ color: tierInfo.color }}>
                  {tierInfo.text}
                </span>
                <span className="inline-flex items-center gap-1 font-mono-code text-[#665D56] whitespace-nowrap">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {meal.prepTime}
                </span>
              </div>

              <h3 className="mt-4 font-display text-xl font-medium text-[#231F1D] leading-snug tracking-tight">
                {meal.title}
              </h3>

              <p className="mt-2 text-sm text-[#665D56] leading-relaxed">
                {meal.summary}
              </p>

              {/* Rescued Ingredients Chips */}
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#665D56] mb-2">
                  Rescued Ingredients
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {meal.rescuedIngredients.map((item, idx) => (
                    <button
                      key={`${meal.id}-ing-${idx}`}
                      ref={(el) => {
                        chipRefs.current[idx] = el;
                      }}
                      type="button"
                      onClick={(e) => handleChipPoke(e, item)}
                      className={`px-2.5 py-1 rounded-md bg-[#FAF6F0] border border-[#E5DDD0] text-xs font-medium text-[#231F1D] hover:border-[#C84B31] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31] ${
                        pokedIngredient === item ? 'animate-squash-poke' : ''
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* Smart Pantry Swap */}
              <div className="mt-4 p-3 rounded-lg bg-[#FAF6F0] border border-[#E5DDD0]">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#3D6B52]">
                  <SwapIcon className="w-3.5 h-3.5" />
                  <span>Smart Pantry Swap</span>
                </div>
                <p className="mt-1 text-xs text-[#231F1D] leading-relaxed">
                  {meal.smartPantrySwap}
                </p>
              </div>
            </div>

            {/* Card Footer Actions */}
            <div className="mt-5 pt-4 border-t border-[#E5DDD0] flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleToggleFlip}
                tabIndex={isFlipped ? -1 : 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F1D] bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
              >
                <FlipIcon className="w-3.5 h-3.5 text-[#665D56]" />
                <span>Flip for Steps</span>
              </button>

              <button
                ref={cookButtonRef}
                type="button"
                onClick={handleCookClick}
                disabled={isCooked}
                tabIndex={isFlipped ? -1 : 0}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231F1D] ${
                  isCooked
                    ? 'bg-[#E6EFEA] text-[#3D6B52] border border-[#C0D6C9] cursor-default'
                    : 'bg-[#3D6B52] hover:bg-[#315843] text-[#FFFDF9] cursor-pointer'
                }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>{isCooked ? 'Cooked' : 'Mark Cooked'}</span>
              </button>
            </div>
          </article>

          {/* BACK INDEX-CARD FACE */}
          <article
            aria-hidden={!isFlipped}
            className="card-face card-face-back index-card-ruled border border-[#E5DDD0] rounded-xl p-5 sm:p-6 flex flex-col justify-between shadow-[0_2px_6px_rgba(35,31,29,0.04)]"
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs pb-3 border-b border-[#C84B31]/30">
                <span className="font-mono-code uppercase tracking-wider text-[#C84B31]">
                  Index Card · Steps
                </span>
                <span className="font-mono-code text-[#665D56] whitespace-nowrap">
                  {meal.prepTime}
                </span>
              </div>

              <h3 className="mt-3.5 font-display text-lg font-medium text-[#231F1D] leading-snug">
                {meal.title}
              </h3>

              <ol className="mt-3 space-y-2.5 text-xs sm:text-sm text-[#231F1D] leading-relaxed">
                {meal.steps.map((step, stepIdx) => (
                  <li key={`${meal.id}-step-${stepIdx}`} className="flex items-start gap-2.5">
                    <span className="font-mono-code text-xs font-semibold text-[#C84B31] pt-0.5 shrink-0">
                      {stepIdx + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 pt-3 border-t border-[#E5DDD0] space-y-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#665D56]">
                    Ingredients Saved:{' '}
                  </span>
                  <span className="text-xs text-[#231F1D]">
                    {meal.rescuedIngredients.join(', ')}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3D6B52]">
                    Storage Tip:{' '}
                  </span>
                  <span className="text-xs text-[#665D56]">{meal.storageTip}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-[#E5DDD0] flex items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleToggleFlip}
                tabIndex={isFlipped ? 0 : -1}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#231F1D] bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
              >
                <FlipIcon className="w-3.5 h-3.5 text-[#665D56]" />
                <span>Front Card</span>
              </button>

              <button
                type="button"
                onClick={handleCookClick}
                disabled={isCooked}
                tabIndex={isFlipped ? 0 : -1}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231F1D] ${
                  isCooked
                    ? 'bg-[#E6EFEA] text-[#3D6B52] border border-[#C0D6C9] cursor-default'
                    : 'bg-[#3D6B52] hover:bg-[#315843] text-[#FFFDF9] cursor-pointer'
                }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
                <span>{isCooked ? 'Cooked' : 'Mark Cooked'}</span>
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
};
