import React, { useState } from 'react';
import { TriageIngredient, UrgencyFilter, UrgencyTier } from '../types/kitchen';
import { MaskedText } from './MaskedText';

interface SpoilageBoardProps {
  ingredients: TriageIngredient[];
  activeFilter: UrgencyFilter;
  onSelectFilter: (filter: UrgencyFilter, clientX: number, clientY: number) => void;
  revealKey: number;
}

const TIER_META: Record<
  UrgencyTier,
  {
    title: string;
    subtitle: string;
    accentColor: string;
    chipBg: string;
    chipBorder: string;
  }
> = {
  use_tonight: {
    title: 'Use Tonight',
    subtitle: 'Wilting greens, soft herbs, ripe produce, and cooked leftovers',
    accentColor: '#C84B31',
    chipBg: '#F5E6E0',
    chipBorder: '#E2C3B8',
  },
  next_days: {
    title: 'Next 2-3 Days',
    subtitle: 'Hearty vegetables, dairy, eggs, and open aromatics',
    accentColor: '#C68B2C',
    chipBg: '#F6EFE0',
    chipBorder: '#E3D3B3',
  },
  pantry_buffer: {
    title: 'Pantry Buffer',
    subtitle: 'Forgiving grains, legumes, oils, and longer-lasting staples',
    accentColor: '#3D6B52',
    chipBg: '#E6EFEA',
    chipBorder: '#C0D6C9',
  },
};

const FILTERS: Array<{ id: UrgencyFilter; label: string }> = [
  { id: 'all', label: 'All Tiers' },
  { id: 'use_tonight', label: 'Use Tonight' },
  { id: 'next_days', label: 'Next 2-3 Days' },
  { id: 'pantry_buffer', label: 'Pantry Buffer' },
];

export const SpoilageBoard: React.FC<SpoilageBoardProps> = ({
  ingredients,
  activeFilter,
  onSelectFilter,
  revealKey,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pokedId, setPokedId] = useState<string | null>(null);

  const visibleTiers: UrgencyTier[] =
    activeFilter === 'all'
      ? ['use_tonight', 'next_days', 'pantry_buffer']
      : [activeFilter];

  const handleChipClick = (item: TriageIngredient) => {
    setSelectedId((prev) => (prev === item.id ? null : item.id));
    setPokedId(null);
    requestAnimationFrame(() => setPokedId(item.id));
  };

  return (
    <section id="triage-board" aria-label="Spoilage Urgency Board" className="relative z-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#665D56] mb-1.5">
            Step 01 · Shelf Priority
          </p>
          <MaskedText
            as="h2"
            revealKey={revealKey}
            lines={['What Needs Cooking First']}
            className="font-display text-2xl sm:text-3xl font-medium text-[#231F1D] tracking-tight"
          />
        </div>

        {/* Urgency Filter Buttons */}
        <div
          role="tablist"
          aria-label="Filter ingredients by urgency tier"
          className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#FFFDF9] border border-[#E5DDD0]"
        >
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={(e) => onSelectFilter(f.id, e.clientX, e.clientY)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31] ${
                  isActive
                    ? 'bg-[#231F1D] text-[#FFFDF9]'
                    : 'text-[#665D56] hover:text-[#231F1D]'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Urgency Columns */}
      <div
        className={`grid gap-5 ${
          visibleTiers.length === 1
            ? 'grid-cols-1'
            : 'grid-cols-1 md:grid-cols-3'
        }`}
      >
        {visibleTiers.map((tier, colIdx) => {
          const meta = TIER_META[tier];
          const items = ingredients.filter((i) => i.tier === tier);

          return (
            <div
              key={`${revealKey}-${tier}`}
              style={{ animationDelay: `${colIdx * 80}ms` }}
              className="card-stagger-enter bg-[#FFFDF9] border border-[#E5DDD0] rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-baseline justify-between gap-2 pb-3 border-b border-[#E5DDD0]">
                  <h3
                    className="font-display text-lg font-medium tracking-tight"
                    style={{ color: meta.accentColor }}
                  >
                    {meta.title}
                  </h3>
                  <span className="font-mono-code text-xs text-[#665D56]">
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <p className="text-xs text-[#665D56] mt-2.5 leading-relaxed">
                  {meta.subtitle}
                </p>

                {items.length === 0 ? (
                  <p className="mt-5 text-xs text-[#8E8277] italic">
                    Nothing queued in this tier right now.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {items.map((item) => {
                      const isExpanded = selectedId === item.id;
                      const isPoked = pokedId === item.id;

                      return (
                        <li
                          key={item.id}
                          className="pb-3 border-b border-[#E5DDD0]/60 last:border-b-0 last:pb-0"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handleChipClick(item)}
                              aria-expanded={isExpanded}
                              style={{
                                backgroundColor: meta.chipBg,
                                borderColor: meta.chipBorder,
                              }}
                              className={`px-2.5 py-1 rounded-md border text-xs font-medium text-[#231F1D] text-left transition-shadow hover:shadow-xs cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31] ${
                                isPoked ? 'animate-squash-poke' : ''
                              }`}
                            >
                              {item.name}
                            </button>
                            <span className="font-mono-code text-[11px] text-[#665D56] whitespace-nowrap pt-1">
                              {item.freshnessWindow}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs text-[#665D56] leading-relaxed">
                            {item.tip}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
