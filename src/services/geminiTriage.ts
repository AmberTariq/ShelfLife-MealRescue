import { GoogleGenAI, Type } from '@google/genai';
import {
  KitchenMood,
  ProcessedImage,
  RescueMeal,
  TriageIngredient,
  TriageResult,
  UrgencyTier,
} from '../types/kitchen';

export interface TriageRunInput {
  rawText: string;
  mood: KitchenMood;
  image?: ProcessedImage | null;
  editedPhotoItems?: string[];
}

export interface TriageRunOutput {
  result: TriageResult;
  source: 'gemini' | 'offline';
}

const USE_TONIGHT_KEYWORDS = [
  'spinach',
  'arugula',
  'lettuce',
  'greens',
  'kale',
  'cilantro',
  'basil',
  'parsley',
  'dill',
  'mint',
  'avocado',
  'berries',
  'strawberry',
  'raspberry',
  'fish',
  'salmon',
  'shrimp',
  'rotisserie',
  'leftover',
  'cooked',
  'ripe',
  'wilted',
  'soft',
  'mushroom',
  'tomato',
  'milk',
  'coconut milk',
  'bread',
  'sourdough',
  'stale',
];

const NEXT_DAYS_KEYWORDS = [
  'egg',
  'cheese',
  'cheddar',
  'mozzarella',
  'goat cheese',
  'feta',
  'yogurt',
  'scallion',
  'green onion',
  'zucchini',
  'pepper',
  'broccoli',
  'cauliflower',
  'tofu',
  'cucumber',
  'carrot',
  'lemon',
  'lime',
  'butter',
  'cream',
  'tortilla',
];

function cleanItemText(raw: string): string {
  return raw
    .replace(/^[-*\u2022\d.)\s]+/, '')
    .replace(/\u2014|\u2013/g, ',')
    .trim();
}

function classifyIngredient(name: string, fromPhoto = false, idx = 0): TriageIngredient {
  const lower = name.toLowerCase();

  let tier: UrgencyTier = 'pantry_buffer';
  let freshnessWindow = '1 to 3 weeks';
  let tip = 'Store cool and dry; great anchor for building out tonight or later this week.';

  if (USE_TONIGHT_KEYWORDS.some((kw) => lower.includes(kw))) {
    tier = 'use_tonight';
    if (lower.includes('leftover') || lower.includes('rotisserie') || lower.includes('cooked')) {
      freshnessWindow = 'Best within 24 hours';
      tip = 'Reheat once until steaming hot and fold into a fast skillet, bowl, or wrap.';
    } else if (lower.includes('avocado') || lower.includes('tomato') || lower.includes('berries')) {
      freshnessWindow = 'Eat today';
      tip = 'Keep out of the coldest fridge shelf; mash, slice, or roast gently tonight.';
    } else if (lower.includes('bread') || lower.includes('sourdough')) {
      freshnessWindow = 'Toast today';
      tip = 'Brush with oil or butter and crisp in a warm skillet for instant croutons or melts.';
    } else {
      freshnessWindow = '12 to 24 hours';
      tip = 'Wilting leaves and soft herbs revive fast when wilted into warm grains, eggs, or soup.';
    }
  } else if (NEXT_DAYS_KEYWORDS.some((kw) => lower.includes(kw))) {
    tier = 'next_days';
    if (lower.includes('egg')) {
      freshnessWindow = '5 to 7 days';
      tip = 'Keep in the original carton on a middle shelf rather than the warmer fridge door.';
    } else if (lower.includes('cheese') || lower.includes('yogurt')) {
      freshnessWindow = '3 to 5 days';
      tip = 'Re-wrap cut cheese in parchment or wax paper so it breathes without drying out.';
    } else if (lower.includes('lemon') || lower.includes('lime')) {
      freshnessWindow = '3 to 4 days';
      tip = 'Zest before juicing if you want extra bright flavor in simple pan sauces.';
    } else {
      freshnessWindow = '2 to 3 days';
      tip = 'Slice and roast or saute at the end of a weeknight pan so nothing lingers.';
    }
  } else {
    tier = 'pantry_buffer';
    if (lower.includes('frozen')) {
      freshnessWindow = '1 to 2 months';
      tip = 'Toss straight from the freezer into hot pans in the last two minutes of cooking.';
    } else if (lower.includes('rice') || lower.includes('beans') || lower.includes('chickpea')) {
      freshnessWindow = '2+ weeks sealed';
      tip = 'Rinse canned legumes well for clean flavor and crisp them in olive oil for texture.';
    } else if (lower.includes('garlic') || lower.includes('onion') || lower.includes('potato') || lower.includes('ginger')) {
      freshnessWindow = '1 to 2 weeks';
      tip = 'Store away from direct light in an airy basket, separate from cut fridge items.';
    }
  }

  return {
    id: `ing-${idx}-${lower.replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
    name,
    tier,
    freshnessWindow,
    tip,
    fromPhoto,
  };
}

function pickTop(items: TriageIngredient[], tier: UrgencyTier, limit: number): string[] {
  return items
    .filter((i) => i.tier === tier)
    .slice(0, limit)
    .map((i) => i.name.replace(/\s*\([^)]*\)/g, '').trim());
}

function buildOfflineMeals(
  ingredients: TriageIngredient[],
  mood: KitchenMood
): RescueMeal[] {
  const tonightNames = pickTop(ingredients, 'use_tonight', 4);
  const nextNames = pickTop(ingredients, 'next_days', 4);
  const pantryNames = pickTop(ingredients, 'pantry_buffer', 4);

  const primaryA = tonightNames[0] || nextNames[0] || pantryNames[0] || 'fresh greens';
  const primaryB = tonightNames[1] || nextNames[1] || pantryNames[1] || 'ripe tomatoes';
  const proteinOrBase =
    ingredients.find((i) =>
      /egg|chicken|tofu|chickpea|beans|cheese|rice|bread|potato/i.test(i.name)
    )?.name.replace(/\s*\([^)]*\)/g, '').trim() || 'eggs or pantry beans';
  const brightener =
    ingredients.find((i) =>
      /lemon|lime|salsa|yogurt|herbs|cilantro|basil|dill|scallion/i.test(i.name)
    )?.name.replace(/\s*\([^)]*\)/g, '').trim() || 'a squeeze of citrus or salsa';

  if (mood === '15-Min Quick') {
    return [
      {
        id: 'meal-1',
        title: `Warm Skillet Scramble with ${primaryA}`,
        prepTime: '12 min',
        summary: 'One pan, gentle heat, and everything tender folded together right before serving.',
        rescuedIngredients: [primaryA, primaryB, proteinOrBase].filter(Boolean).slice(0, 3),
        smartPantrySwap: 'No fresh herbs? Stir in a spoonful of pesto, chili crisp, or dried oregano.',
        steps: [
          `Warm a tablespoon of olive oil or butter in a medium skillet over medium heat.`,
          `Add ${primaryB} and cook for 3 minutes until soft and fragrant.`,
          `Fold in ${primaryA} and ${proteinOrBase}, cooking gently until just set and warmed through.`,
          `Finish off the heat with ${brightener}, flaky salt, and black pepper.`,
        ],
        storageTip: 'Best eaten warm right away; any extra filling keeps 2 days in a sealed container for wraps.',
        focusTier: 'use_tonight',
      },
      {
        id: 'meal-2',
        title: `Crisp Pan-Toasted Melt & ${primaryB}`,
        prepTime: '10 min',
        summary: 'Turns soft produce and odds-and-ends into a crisp, golden open-faced meal.',
        rescuedIngredients: [primaryB, proteinOrBase, brightener].filter(Boolean).slice(0, 3),
        smartPantrySwap: 'Out of sliced bread? Press the filling inside a warmed tortilla or over crisp rice.',
        steps: [
          `Heat a dry skillet over medium and toast your bread or tortillas with a thin brush of oil.`,
          `Layer on ${proteinOrBase} and ${primaryB}, covering the pan with a lid for 2 minutes to melt and steam.`,
          `Top with ${primaryA} and ${brightener} right before slicing.`,
        ],
        storageTip: 'Keep pre-sliced toppings separate from toasted bases if saving a portion for tomorrow lunch.',
        focusTier: 'use_tonight',
      },
      {
        id: 'meal-3',
        title: `Quick Pantry Toss with ${brightener}`,
        prepTime: '14 min',
        summary: 'A bright, no-fuss bowl built from pantry staples and whatever needs using first.',
        rescuedIngredients: [primaryA, pantryNames[0] || proteinOrBase, brightener]
          .filter(Boolean)
          .slice(0, 3),
        smartPantrySwap: 'Missing citrus? Use two teaspoons of apple cider vinegar or pickle brine for lift.',
        steps: [
          `Warm your grain, beans, or base in a small skillet with a splash of water or oil until steaming.`,
          `Toss ${primaryA} directly into the warm pan so it wilts gently without turning soggy.`,
          `Spoon into a bowl and finish with ${brightener} and a pinch of salt.`,
        ],
        storageTip: 'Store the warm base and fresh toppings in one container up to 3 days; reheat gently.',
        focusTier: 'next_days',
      },
    ];
  }

  if (mood === 'Cozy & Filling') {
    return [
      {
        id: 'meal-1',
        title: `One-Pot Hearty Skillet Bake with ${primaryA}`,
        prepTime: '22 min',
        summary: 'Comforting, warm, and forgiving with whatever vegetables or cooked grains are left.',
        rescuedIngredients: [primaryA, primaryB, proteinOrBase].filter(Boolean).slice(0, 3),
        smartPantrySwap: 'No broth on hand? Whisk a teaspoon of miso, soy sauce, or bouillon into warm water.',
        steps: [
          `Saute ${primaryB} and aromatics in a deep skillet for 4 minutes until softened.`,
          `Stir in ${proteinOrBase} with a splash of water or broth to create a light pan sauce.`,
          `Nestle in ${primaryA}, cover with a lid for 4 minutes until everything melds together.`,
          `Serve warm straight from the pan topped with ${brightener}.`,
        ],
        storageTip: 'Tastes even better on day two; keep refrigerated in a shallow container for up to 3 days.',
        focusTier: 'use_tonight',
      },
      {
        id: 'meal-2',
        title: `Savory Stuffed & Griddled Foldover`,
        prepTime: '18 min',
        summary: 'Melted, golden, and deeply satisfying using fridge corners and warm pantry carbs.',
        rescuedIngredients: [proteinOrBase, primaryA, brightener].filter(Boolean).slice(0, 3),
        smartPantrySwap: 'Swap tortillas or bread for mashed cooked potatoes crisped into quick pan cakes.',
        steps: [
          `Wilt ${primaryA} with ${primaryB} in a warm pan for 3 minutes, then season well.`,
          `Spoon the warm mixture onto bread, tortillas, or cooked grain alongside ${proteinOrBase}.`,
          `Toast both sides in a lightly oiled skillet until golden brown and crisp.`,
        ],
        storageTip: 'Wrap cooled leftovers in foil and re-crisp in a dry pan for 3 minutes.',
        focusTier: 'next_days',
      },
      {
        id: 'meal-3',
        title: `Warm Comfort Bowl with ${brightener}`,
        prepTime: '20 min',
        summary: 'Layered textures with crisp pan-seared edges and a bright finishing drizzle.',
        rescuedIngredients: [primaryB, pantryNames[0] || proteinOrBase, brightener]
          .filter(Boolean)
          .slice(0, 3),
        smartPantrySwap: 'No yogurt or crema? Mash a spoonful of avocado or drizzle extra olive oil with garlic.',
        steps: [
          `Roast or pan-sear ${primaryB} and pantry starches in oil until browned at the edges.`,
          `Add ${proteinOrBase} during the final 3 minutes to warm through.`,
          `Build bowls with ${primaryA} underneath and spoon ${brightener} over top.`,
        ],
        storageTip: 'Keep crunchy or cold toppings in a small jar on the side until ready to reheat.',
        focusTier: 'pantry_buffer',
      },
    ];
  }

  // Zero-Stress Pantry
  return [
    {
      id: 'meal-1',
      title: `No-Recipe Pan Supper with ${primaryA}`,
      prepTime: '12 min',
      summary: 'Minimal chopping and one single pan, designed for low-energy evenings.',
      rescuedIngredients: [primaryA, proteinOrBase, brightener].filter(Boolean).slice(0, 3),
      smartPantrySwap: 'Use pre-minced garlic, frozen peas, or jarred salsa whenever chopping feels like too much.',
      steps: [
        `Heat oil in your largest skillet and toss in ${primaryB} with a pinch of salt.`,
        `Add ${proteinOrBase} and ${primaryA} together, stirring occasionally for 4 minutes.`,
        `Turn off the heat and stir through ${brightener} right in the pan.`,
      ],
      storageTip: 'Pack any remaining portion straight from the cooled skillet into a lunch container.',
      focusTier: 'use_tonight',
    },
    {
      id: 'meal-2',
      title: `5-Minute Pantry Plate & ${primaryB}`,
      prepTime: '8 min',
      summary: 'Zero-stress assembly meal combining warm toast or rice with fresh fridge rescued bites.',
      rescuedIngredients: [primaryB, pantryNames[0] || proteinOrBase, brightener]
          .filter(Boolean)
          .slice(0, 3),
      smartPantrySwap: 'No fresh greens? Toss canned beans or olives with olive oil and dried herbs instead.',
      steps: [
        `Warm your bread, tortilla, or cooked grain while slicing ${primaryB}.`,
        `Arrange ${proteinOrBase} and ${primaryA} on a wide plate with olive oil and salt.`,
        `Finish with ${brightener} and serve right away.`,
      ],
      storageTip: 'Store uncut produce dry in paper towel lined containers to buy two extra days.',
      focusTier: 'next_days',
    },
    {
      id: 'meal-3',
      title: `Simmered Pantry Bowl with ${pantryNames[0] || 'Staples'}`,
      prepTime: '15 min',
      summary: 'Relies on forgiving cupboard staples so wilted items melt effortlessly into the dish.',
      rescuedIngredients: [pantryNames[0] || proteinOrBase, primaryA, primaryB]
        .filter(Boolean)
        .slice(0, 3),
      smartPantrySwap: 'Out of tomatoes or salsa? A spoonful of tomato paste and warm water builds instant sauce.',
      steps: [
        `Combine ${pantryNames[0] || proteinOrBase} with a splash of water or oil in a small pot.`,
        `Simmer gently for 6 minutes, then stir in ${primaryA} and ${primaryB} until wilted.`,
        `Season with salt, pepper, and ${brightener}.`,
      ],
      storageTip: 'Freezes cleanly in single portions for up to 1 month or keeps 4 days in the fridge.',
      focusTier: 'pantry_buffer',
    },
  ];
}

export function runOfflineTriageFallback(input: TriageRunInput): TriageRunOutput {
  const textItems = input.rawText
    .split(/[\n,;]+/)
    .map(cleanItemText)
    .filter((item) => item.length > 1);

  const photoItems =
    input.editedPhotoItems && input.editedPhotoItems.length > 0
      ? input.editedPhotoItems
      : input.image
        ? [
            'leafy greens (top shelf)',
            'open cheese pack',
            '2 eggs',
            'tomatoes',
            'lemon half',
            'jarred condiment',
          ]
        : [];

  const merged: TriageIngredient[] = [];
  const seen = new Set<string>();

  photoItems.forEach((name, idx) => {
    const cleaned = cleanItemText(name);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      merged.push(classifyIngredient(cleaned, true, idx));
    }
  });

  textItems.forEach((name, idx) => {
    const cleaned = cleanItemText(name);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      merged.push(classifyIngredient(cleaned, false, idx + 100));
    }
  });

  if (merged.length === 0) {
    ['baby spinach', 'ripe tomatoes', 'eggs', 'cheddar cheese', 'sourdough bread', 'olive oil'].forEach(
      (item, idx) => merged.push(classifyIngredient(item, false, idx))
    );
  }

  const meals = buildOfflineMeals(merged, input.mood);

  return {
    result: {
      detectedFromPhoto: input.image ? photoItems : [],
      ingredients: merged,
      meals,
    },
    source: 'offline',
  };
}

export async function runKitchenTriage(input: TriageRunInput): Promise<TriageRunOutput> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return runOfflineTriageFallback(input);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (input.image) {
      parts.push({
        inlineData: {
          mimeType: input.image.mimeType,
          data: input.image.base64,
        },
      });
    }

    const photoNotes =
      input.editedPhotoItems && input.editedPhotoItems.length > 0
        ? `User-confirmed photo items: ${input.editedPhotoItems.join(', ')}.`
        : '';

    const textPrompt = input.rawText.trim()
      ? `Kitchen notes from user:\n${input.rawText.trim()}`
      : input.image
        ? 'The user did not type notes. Rely primarily on the visible ingredients, produce, jars, and leftovers in the fridge photo.'
        : 'No ingredients were provided.';

    parts.push({
      text: [
        `Kitchen Mood / Effort preference: ${input.mood}.`,
        photoNotes,
        textPrompt,
        'Return a warm, practical spoilage triage and exactly 3 low-effort rescue meals prioritizing items that expire tonight.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        systemInstruction:
          'You are a warm, encouraging, practical home kitchen companion helping someone turn fridge leftovers and pantry staples into dinner tonight. Never scold the user for forgotten groceries. Strictly avoid all emojis and strictly avoid em dashes in every field; use commas, colons, or periods instead. Classify every ingredient into one of three urgency tiers: use_tonight, next_days, or pantry_buffer. Return exactly 3 low-effort rescue meals shaped by the requested Kitchen Mood / Effort.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedFromPhoto: {
              type: Type.ARRAY,
              description:
                'Short readable names of ingredients detected from the fridge photo if an image was supplied; empty array otherwise.',
              items: { type: Type.STRING },
            },
            ingredients: {
              type: Type.ARRAY,
              description: 'All triaged ingredients sorted by urgency.',
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  tier: {
                    type: Type.STRING,
                    enum: ['use_tonight', 'next_days', 'pantry_buffer'],
                  },
                  freshnessWindow: {
                    type: Type.STRING,
                    description: 'Concise window like "Eat today", "12 to 24 hours", or "2 to 3 days".',
                  },
                  tip: {
                    type: Type.STRING,
                    description: 'Short helpful kitchen tip without em dashes or emojis.',
                  },
                  fromPhoto: { type: Type.BOOLEAN },
                },
                required: ['name', 'tier', 'freshnessWindow', 'tip'],
              },
            },
            meals: {
              type: Type.ARRAY,
              description: 'Exactly 3 low-effort rescue meal cards prioritizing use_tonight ingredients.',
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  prepTime: { type: Type.STRING, description: 'e.g. "12 min"' },
                  summary: { type: Type.STRING },
                  rescuedIngredients: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  smartPantrySwap: { type: Type.STRING },
                  steps: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  storageTip: { type: Type.STRING },
                  focusTier: {
                    type: Type.STRING,
                    enum: ['use_tonight', 'next_days', 'pantry_buffer'],
                  },
                },
                required: [
                  'title',
                  'prepTime',
                  'summary',
                  'rescuedIngredients',
                  'smartPantrySwap',
                  'steps',
                  'storageTip',
                  'focusTier',
                ],
              },
            },
          },
          required: ['detectedFromPhoto', 'ingredients', 'meals'],
        },
      },
    });

    const rawJson = (response.text ?? '').trim();
    if (!rawJson) {
      return runOfflineTriageFallback(input);
    }

    const parsed = JSON.parse(rawJson) as {
      detectedFromPhoto?: string[];
      ingredients?: Array<{
        name: string;
        tier: UrgencyTier;
        freshnessWindow: string;
        tip: string;
        fromPhoto?: boolean;
      }>;
      meals?: Array<Omit<RescueMeal, 'id'>>;
    };

    const sanitize = (str: string) => str.replace(/\u2014|\u2013/g, ', ').trim();

    const ingredients: TriageIngredient[] = (parsed.ingredients ?? []).map((item, index) => ({
      id: `gem-ing-${index}-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}`,
      name: sanitize(item.name),
      tier:
        item.tier === 'use_tonight' || item.tier === 'next_days' || item.tier === 'pantry_buffer'
          ? item.tier
          : 'next_days',
      freshnessWindow: sanitize(item.freshnessWindow || '2 to 3 days'),
      tip: sanitize(item.tip || 'Keep visible near the front of the shelf.'),
      fromPhoto: Boolean(item.fromPhoto),
    }));

    const meals: RescueMeal[] = (parsed.meals ?? []).slice(0, 3).map((meal, index) => ({
      id: `gem-meal-${index + 1}`,
      title: sanitize(meal.title),
      prepTime: sanitize(meal.prepTime || '15 min'),
      summary: sanitize(meal.summary),
      rescuedIngredients: (meal.rescuedIngredients ?? []).map(sanitize),
      smartPantrySwap: sanitize(meal.smartPantrySwap),
      steps: (meal.steps ?? []).map(sanitize),
      storageTip: sanitize(meal.storageTip),
      focusTier:
        meal.focusTier === 'use_tonight' ||
        meal.focusTier === 'next_days' ||
        meal.focusTier === 'pantry_buffer'
          ? meal.focusTier
          : 'use_tonight',
    }));

    if (ingredients.length === 0 || meals.length === 0) {
      return runOfflineTriageFallback(input);
    }

    return {
      result: {
        detectedFromPhoto: (parsed.detectedFromPhoto ?? []).map(sanitize),
        ingredients,
        meals,
      },
      source: 'gemini',
    };
  } catch {
    return runOfflineTriageFallback(input);
  }
}
