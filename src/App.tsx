import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlyToBasketLayer, FlyingTagItem } from './components/FlyToBasketLayer';
import { FridgeNotepad } from './components/FridgeNotepad';
import { BasketIcon } from './components/Icons';
import { MaskedText } from './components/MaskedText';
import { RescueMealCard } from './components/RescueMealCard';
import { SpoilageBoard } from './components/SpoilageBoard';
import { DEFAULT_SAMPLE_SCENARIO, SURPRISE_SCENARIOS } from './data/scenarios';
import { runKitchenTriage, runOfflineTriageFallback } from './services/geminiTriage';
import {
  KitchenMood,
  ProcessedImage,
  RescueMeal,
  TriageResult,
  UrgencyFilter,
  UrgencyTier,
  WashTone,
} from './types/kitchen';
import { compressImageForTriage } from './utils/imageProcessor';

const STORAGE_KEY_RESCUED = 'shelflife_items_rescued_v1';

const WASH_HEX: Record<WashTone, string> = {
  tonight: '#F5E6E0',
  days: '#F6EFE0',
  rescued: '#E6EFEA',
};

function tierToWashTone(tier: UrgencyFilter): WashTone {
  if (tier === 'next_days') return 'days';
  if (tier === 'pantry_buffer') return 'rescued';
  return 'tonight';
}

// Evaluates --ease: cubic-bezier(0.22, 0.8, 0.24, 1)
function customEase(t: number): number {
  const x1 = 0.22;
  const y1 = 0.8;
  const x2 = 0.24;
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
    if (sampleX(u) < t) lo = u;
    else hi = u;
  }
  return sampleY(u);
}

export default function App() {
  const [rawText, setRawText] = useState<string>(DEFAULT_SAMPLE_SCENARIO.text);
  const [mood, setMood] = useState<KitchenMood>(DEFAULT_SAMPLE_SCENARIO.mood);
  const [scenarioStatus, setScenarioStatus] = useState<string>(
    DEFAULT_SAMPLE_SCENARIO.statusLine
  );
  const [surpriseIndex, setSurpriseIndex] = useState<number>(0);

  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [photoItems, setPhotoItems] = useState<string[]>([]);

  const [triage, setTriage] = useState<TriageResult>(() =>
    runOfflineTriageFallback({
      rawText: DEFAULT_SAMPLE_SCENARIO.text,
      mood: DEFAULT_SAMPLE_SCENARIO.mood,
    }).result
  );
  const [activeFilter, setActiveFilter] = useState<UrgencyFilter>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [revealKey, setRevealKey] = useState<number>(1);
  const [cookedMealIds, setCookedMealIds] = useState<Record<string, boolean>>({});

  // Persistent Items Rescued counter
  const [rescuedCount, setRescuedCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RESCUED);
      const parsed = saved ? parseInt(saved, 10) : 0;
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  });
  const [basketBounceKey, setBasketBounceKey] = useState<number>(0);
  const basketBadgeRef = useRef<HTMLDivElement | null>(null);

  // Flying parabolic tag clones
  const [flyingTags, setFlyingTags] = useState<FlyingTagItem[]>([]);

  // Feathered radial colour wash state
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const washAnimRef = useRef<number>(0);
  const [baseWashTone, setBaseWashTone] = useState<WashTone>('tonight');
  const [activeWash, setActiveWash] = useState<{
    tone: WashTone;
    cx: number;
    cy: number;
    r: number;
    feather: number;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RESCUED, String(rescuedCount));
    } catch {
      // Ignore storage quota restrictions
    }
  }, [rescuedCount]);

  useEffect(() => {
    return () => {
      if (washAnimRef.current) cancelAnimationFrame(washAnimRef.current);
    };
  }, []);

  const triggerRadialWash = useCallback(
    (tone: WashTone, clientX?: number, clientY?: number) => {
      const container = workspaceRef.current;
      if (!container) {
        setBaseWashTone(tone);
        return;
      }

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReduced) {
        setBaseWashTone(tone);
        setActiveWash(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      const cx =
        typeof clientX === 'number' && clientX > 0
          ? clientX - rect.left
          : rect.width * 0.5;
      const cy =
        typeof clientY === 'number' && clientY > 0
          ? clientY - rect.top
          : 120;

      const maxDx = Math.max(cx, rect.width - cx);
      const maxDy = Math.max(cy, rect.height - cy);
      const maxRadius = Math.hypot(maxDx, maxDy) + 180;
      const feather = 160;

      if (washAnimRef.current) cancelAnimationFrame(washAnimRef.current);

      const duration = 420;
      let startTime = 0;

      const step = (now: number) => {
        if (!startTime) startTime = now;
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = customEase(t);
        const r = Math.max(12, eased * maxRadius);

        setActiveWash({ tone, cx, cy, r, feather });

        if (t < 1) {
          washAnimRef.current = requestAnimationFrame(step);
        } else {
          setBaseWashTone(tone);
          setActiveWash(null);
        }
      };

      washAnimRef.current = requestAnimationFrame(step);
    },
    []
  );

  const executeTriage = useCallback(
    async (params: {
      text: string;
      nextMood: KitchenMood;
      nextImage: ProcessedImage | null;
      nextPhotoItems: string[];
    }) => {
      setIsLoading(true);
      try {
        const output = await runKitchenTriage({
          rawText: params.text,
          mood: params.nextMood,
          image: params.nextImage,
          editedPhotoItems: params.nextPhotoItems,
        });

        setTriage(output.result);
        if (params.nextImage && output.result.detectedFromPhoto.length > 0) {
          setPhotoItems(output.result.detectedFromPhoto);
        }
        setCookedMealIds({});
        setActiveFilter('all');
        setRevealKey((k) => k + 1);
        triggerRadialWash('tonight');
      } finally {
        setIsLoading(false);
      }
    },
    [triggerRadialWash]
  );

  const handleSelectImageFile = async (file: File) => {
    setImageError(null);
    try {
      const compressed = await compressImageForTriage(file);
      setImage(compressed);
      setPhotoItems([]);
      setScenarioStatus(
        'Fridge photo ready. Click "Triage My Fridge" to read your shelf, or add quick labels below.'
      );
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Unable to process that image file.'
      );
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setPhotoItems([]);
    setImageError(null);
  };

  const handleRemovePhotoItem = (index: number) => {
    const next = photoItems.filter((_, i) => i !== index);
    setPhotoItems(next);
    if (next.length > 0 || rawText.trim().length > 0) {
      const updated = runOfflineTriageFallback({
        rawText,
        mood,
        image,
        editedPhotoItems: next,
      });
      setTriage(updated.result);
    }
  };

  const handleAddPhotoItem = (label: string) => {
    const next = [...photoItems, label];
    setPhotoItems(next);
    const updated = runOfflineTriageFallback({
      rawText,
      mood,
      image,
      editedPhotoItems: next,
    });
    setTriage(updated.result);
  };

  const handleLoadSample = () => {
    setImage(null);
    setPhotoItems([]);
    setImageError(null);
    setRawText(DEFAULT_SAMPLE_SCENARIO.text);
    setMood(DEFAULT_SAMPLE_SCENARIO.mood);
    setScenarioStatus(DEFAULT_SAMPLE_SCENARIO.statusLine);
    void executeTriage({
      text: DEFAULT_SAMPLE_SCENARIO.text,
      nextMood: DEFAULT_SAMPLE_SCENARIO.mood,
      nextImage: null,
      nextPhotoItems: [],
    });
  };

  const handleSurpriseMe = () => {
    const scenario = SURPRISE_SCENARIOS[surpriseIndex % SURPRISE_SCENARIOS.length];
    setSurpriseIndex((idx) => idx + 1);
    setImage(null);
    setPhotoItems([]);
    setImageError(null);
    setRawText(scenario.text);
    setMood(scenario.mood);
    setScenarioStatus(scenario.statusLine);
    void executeTriage({
      text: scenario.text,
      nextMood: scenario.mood,
      nextImage: null,
      nextPhotoItems: [],
    });
  };

  const handleChangeMood = (nextMood: KitchenMood) => {
    setMood(nextMood);
    void executeTriage({
      text: rawText,
      nextMood,
      nextImage: image,
      nextPhotoItems: photoItems,
    });
  };

  const handleSubmitTriage = () => {
    void executeTriage({
      text: rawText,
      nextMood: mood,
      nextImage: image,
      nextPhotoItems: photoItems,
    });
  };

  const handleSelectFilter = (
    filter: UrgencyFilter,
    clientX: number,
    clientY: number
  ) => {
    setActiveFilter(filter);
    triggerRadialWash(tierToWashTone(filter), clientX, clientY);
  };

  const handleFocusMeal = (
    tier: UrgencyTier,
    clientX: number,
    clientY: number
  ) => {
    triggerRadialWash(tierToWashTone(tier), clientX, clientY);
  };

  const handleMarkCooked = (
    meal: RescueMeal,
    ingredientAnchors: Array<{ label: string; rect: DOMRect }>
  ) => {
    if (cookedMealIds[meal.id]) return;
    setCookedMealIds((prev) => ({ ...prev, [meal.id]: true }));

    const targetRect = basketBadgeRef.current?.getBoundingClientRect();
    if (!targetRect || ingredientAnchors.length === 0) {
      setRescuedCount((c) => c + Math.max(1, meal.rescuedIngredients.length));
      setBasketBounceKey((k) => k + 1);
      return;
    }

    const targetX = targetRect.left + targetRect.width * 0.45;
    const targetY = targetRect.top + targetRect.height * 0.35;

    const batchId = Date.now();
    const clones: FlyingTagItem[] = ingredientAnchors.map((anchor, idx) => ({
      id: `fly-${batchId}-${meal.id}-${idx}`,
      label: anchor.label,
      startX: anchor.rect.left,
      startY: anchor.rect.top,
      targetX,
      targetY,
      delayMs: idx * 110,
    }));

    setFlyingTags((prev) => [...prev, ...clones]);
  };

  const handleFlyingTagLanded = useCallback((id: string) => {
    setFlyingTags((prev) => prev.filter((item) => item.id !== id));
    setRescuedCount((c) => c + 1);
    setBasketBounceKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#231F1D] flex flex-col">
      {/* Parabolic Fly-to-Basket Fixed Layer */}
      <FlyToBasketLayer
        items={flyingTags}
        onItemLanded={handleFlyingTagLanded}
      />

      {/* Top Navigation Bar (Clean 3-Zone Contract) */}
      <header className="sticky top-0 z-30 bg-[#FAF6F0] border-b border-[#E5DDD0]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <a
            href="#top"
            className="font-display text-lg sm:text-xl font-semibold tracking-tight text-[#231F1D] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
          >
            ShelfLife &amp; MealRescue
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#665D56]"
          >
            <a
              href="#kitchen-desk"
              className="hover:text-[#231F1D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
            >
              Kitchen Desk
            </a>
            <a
              href="#triage-board"
              className="hover:text-[#231F1D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
            >
              Triage Board
            </a>
            <a
              href="#rescue-meals"
              className="hover:text-[#231F1D] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
            >
              Rescue Meals
            </a>
          </nav>

          {/* Items Rescued Counter Badge */}
          <div
            ref={basketBadgeRef}
            key={`basket-${basketBounceKey}`}
            aria-live="polite"
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#FFFDF9] border border-[#E5DDD0] text-xs font-medium text-[#231F1D] whitespace-nowrap shrink-0 ${
              basketBounceKey > 0 ? 'animate-basket-bounce' : ''
            }`}
          >
            <BasketIcon className="w-4 h-4 text-[#3D6B52]" />
            <span>Items Rescued</span>
            <span className="font-mono-code font-semibold text-[#3D6B52]">
              {rescuedCount}
            </span>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Editorial Hero Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 sm:pt-14 sm:pb-10">
          <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#C84B31] mb-3">
            A FRIENDLY KITCHEN DESK FOR WHAT IS IN YOUR FRIDGE RIGHT NOW
          </p>

          <MaskedText
            as="h1"
            lines={['TURN WHAT YOU HAVE', 'INTO DINNER TONIGHT']}
            className="font-display text-[clamp(2.25rem,5vw,4.15rem)] leading-[1.04] font-semibold tracking-tight text-[#231F1D] max-w-4xl"
          />

          <p className="mt-4 text-base sm:text-lg text-[#665D56] leading-relaxed max-w-2xl font-body">
            Drop in a quick list of ingredients or snap a photo of your shelf. See
            what needs cooking first, get simple ideas that fit real life, and
            save good food from going to waste.
          </p>
        </section>

        {/* Kitchen Input Desk */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
          <FridgeNotepad
            rawText={rawText}
            onChangeText={setRawText}
            mood={mood}
            onChangeMood={handleChangeMood}
            image={image}
            onSelectImageFile={handleSelectImageFile}
            onRemoveImage={handleRemoveImage}
            photoItems={photoItems}
            onRemovePhotoItem={handleRemovePhotoItem}
            onAddPhotoItem={handleAddPhotoItem}
            onLoadSample={handleLoadSample}
            onSurpriseMe={handleSurpriseMe}
            scenarioStatus={scenarioStatus}
            onSubmitTriage={handleSubmitTriage}
            isLoading={isLoading}
            imageError={imageError}
          />
        </div>

        {/* Active Triage Workspace with Feathered Radial Colour Wash */}
        <div
          ref={workspaceRef}
          className="relative border-t border-[#E5DDD0] transition-colors duration-300"
          style={{ backgroundColor: WASH_HEX[baseWashTone] }}
        >
          {/* .reveal Feathered Radial Colour Wash Layer */}
          <div className="reveal" aria-hidden="true">
            {activeWash && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: WASH_HEX[activeWash.tone],
                  maskImage: `radial-gradient(circle at ${activeWash.cx}px ${activeWash.cy}px, #000 ${Math.max(0, activeWash.r - activeWash.feather)}px, transparent ${activeWash.r}px)`,
                  WebkitMaskImage: `radial-gradient(circle at ${activeWash.cx}px ${activeWash.cy}px, #000 ${Math.max(0, activeWash.r - activeWash.feather)}px, transparent ${activeWash.r}px)`,
                }}
              />
            )}
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 space-y-14">
            {/* Spoilage Urgency Board */}
            <SpoilageBoard
              ingredients={triage.ingredients}
              activeFilter={activeFilter}
              onSelectFilter={handleSelectFilter}
              revealKey={revealKey}
            />

            {/* 3 Low-Effort Rescue Meal Cards */}
            <section id="rescue-meals" aria-label="Low-Effort Rescue Meals">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-[#665D56] mb-1.5">
                    Step 02 · Tonight&apos;s Rescue Cards
                  </p>
                  <MaskedText
                    as="h2"
                    revealKey={revealKey}
                    baseDelayMs={80}
                    lines={['Three Simple Ways to Cook It Up']}
                    className="font-display text-2xl sm:text-3xl font-medium text-[#231F1D] tracking-tight"
                  />
                </div>
                <p className="text-xs sm:text-sm text-[#665D56]">
                  Mood: <span className="font-medium text-[#231F1D]">{mood}</span> · Flip any card for full steps
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {triage.meals.map((meal, idx) => (
                  <RescueMealCard
                    key={`${revealKey}-${meal.id}`}
                    meal={meal}
                    index={idx}
                    isCooked={Boolean(cookedMealIds[meal.id])}
                    revealKey={revealKey}
                    onFocusMeal={handleFocusMeal}
                    onMarkCooked={handleMarkCooked}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="bg-[#FAF6F0] border-t border-[#E5DDD0] py-7">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#665D56]">
          <p className="font-display text-sm text-[#231F1D]">
            ShelfLife &amp; MealRescue
          </p>
          <p>
            Cook what is close at hand, skip the guilt, and rescue good ingredients one meal at a time.
          </p>
        </div>
      </footer>
    </div>
  );
}
