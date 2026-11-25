export type UrgencyTier = 'use_tonight' | 'next_days' | 'pantry_buffer';

export type UrgencyFilter = 'all' | UrgencyTier;

export type KitchenMood = '15-Min Quick' | 'Cozy & Filling' | 'Zero-Stress Pantry';

export type WashTone = 'tonight' | 'days' | 'rescued';

export interface TriageIngredient {
  id: string;
  name: string;
  tier: UrgencyTier;
  freshnessWindow: string;
  tip: string;
  fromPhoto?: boolean;
}

export interface RescueMeal {
  id: string;
  title: string;
  prepTime: string;
  summary: string;
  rescuedIngredients: string[];
  smartPantrySwap: string;
  steps: string[];
  storageTip: string;
  focusTier: UrgencyTier;
}

export type TierProTips = Record<UrgencyTier, string>;

export interface TriageResult {
  detectedFromPhoto: string[];
  ingredients: TriageIngredient[];
  tierProTips: TierProTips;
  meals: RescueMeal[];
}

export interface ProcessedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
  width: number;
  height: number;
  fileName: string;
}

export interface KitchenScenario {
  id: string;
  label: string;
  statusLine: string;
  mood: KitchenMood;
  text: string;
}
