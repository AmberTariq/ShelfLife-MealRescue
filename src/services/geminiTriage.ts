import { GoogleGenAI, Type } from '@google/genai';
import {
  KitchenMood,
  ProcessedImage,
  RescueMeal,
  TierProTips,
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
  /** True when a photo was analyzed and Gemini found no food items in it. */
  noFoodInPhoto?: boolean;
}

export class GeminiTriageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiTriageError';
  }
}

const GEMINI_MODEL = 'gemini-3.8-flash';
/** Secondary Flash models tried, in order, only when the primary model stays unavailable (503). */
const GEMINI_FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];
/** Backoff delays before each retry of the primary model on a transient 503 / UNAVAILABLE error. */
const RETRY_DELAYS_MS = [600, 1500];

function errorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** True only for transient "model overloaded / unavailable" failures that are worth retrying. */
function isTransientUnavailable(err: unknown): boolean {
  if (errorStatus(err) === 503) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b503\b|UNAVAILABLE|overloaded/i.test(message);
}

/** True when a model name is unknown or unsupported for this key, so the next fallback can be tried. */
function isModelNotFound(err: unknown): boolean {
  if (errorStatus(err) === 404) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /\b404\b|NOT_FOUND/i.test(message);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Calls Gemini with the primary model, retrying transient 503 / UNAVAILABLE errors with
 * exponential backoff, then falling back to secondary Flash models. Non-transient errors
 * (400, 401, 403, 429, network, etc.) are thrown immediately so the UI can show them.
 */
async function generateWithResilience<T>(call: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await call(GEMINI_MODEL);
    } catch (err) {
      if (!isTransientUnavailable(err)) {
        throw new GeminiTriageError(describeGeminiError(err, GEMINI_MODEL));
      }
      lastError = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  for (const model of GEMINI_FALLBACK_MODELS) {
    try {
      return await call(model);
    } catch (err) {
      if (isTransientUnavailable(err) || isModelNotFound(err)) {
        lastError = err;
        continue;
      }
      throw new GeminiTriageError(describeGeminiError(err, model));
    }
  }

  const detail = lastError instanceof Error ? ` (${lastError.message})` : '';
  throw new GeminiTriageError(
    `Gemini is temporarily unavailable. ${GEMINI_MODEL} and the backup models are all overloaded right now, please try again in a minute.${detail}`
  );
}

/** Strips any `data:<mime>;base64,` prefix so only raw base64 is sent to Gemini. */
function toRawBase64(data: string): string {
  const commaIndex = data.indexOf(',');
  return data.startsWith('data:') && commaIndex !== -1 ? data.slice(commaIndex + 1) : data;
}

function describeGeminiError(err: unknown, model: string = GEMINI_MODEL): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/api key not valid|API_KEY_INVALID|permission|401|403/i.test(message)) {
    return 'Gemini rejected the API key. Check that VITE_GEMINI_API_KEY is a valid Gemini API key.';
  }
  if (/404|NOT_FOUND|not found|is not supported/i.test(message)) {
    return `Gemini model "${model}" is not available for this API key. Check the model name in src/services/geminiTriage.ts.`;
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(message)) {
    return 'Gemini rate limit or quota reached. Please wait a moment and try again.';
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'Could not reach Gemini. Check your internet connection and try again.';
  }
  return `Gemini could not analyze your kitchen: ${message}`;
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

function buildOfflineTierProTips(ingredients: TriageIngredient[]): TierProTips {
  const tonightItems = ingredients.filter((i) => i.tier === 'use_tonight');
  const nextItems = ingredients.filter((i) => i.tier === 'next_days');
  const pantryItems = ingredients.filter((i) => i.tier === 'pantry_buffer');

  const tonightJoined = tonightItems.map((i) => i.name.toLowerCase()).join(' ');
  const nextJoined = nextItems.map((i) => i.name.toLowerCase()).join(' ');
  const pantryJoined = pantryItems.map((i) => i.name.toLowerCase()).join(' ');

  let useTonightTip =
    'If plans change tonight, blanch soft produce for 60 seconds or freeze cooked portions flat in a sealed bag.';
  if (/spinach|kale|greens|lettuce|arugula|cilantro|basil|parsley|dill/.test(tonightJoined)) {
    useTonightTip =
      'Tuck a dry paper towel inside your greens bag to absorb extra moisture, or blend soft herbs with olive oil into a quick freezer pesto.';
  } else if (/tomato|avocado|berries/.test(tonightJoined)) {
    useTonightTip =
      'Keep ripe tomatoes out of the coldest back shelf, and brush cut avocado with lemon or lime before pressing wrap directly against the flesh.';
  } else if (/bread|sourdough/.test(tonightJoined)) {
    useTonightTip =
      'Slice or cube stale bread right away and freeze in a sealed bag so it toasts straight into crisp croutons or warm melts later.';
  } else if (/rice|rotisserie|chicken|leftover|cooked/.test(tonightJoined)) {
    useTonightTip =
      'Spread cooked leftovers or rice in a thin layer to cool quickly, then store in an airtight shallow container on the top shelf.';
  }

  let nextDaysTip =
    'Move delicate items away from the fridge door onto a middle shelf where temperatures stay steady.';
  if (/scallion|green onion/.test(nextJoined)) {
    nextDaysTip =
      'Stand scallions upright in a small jar with an inch of cold water, and re-wrap cut cheese in parchment rather than tight plastic wrap.';
  } else if (/cheese|cheddar|mozzarella|goat cheese|feta|yogurt/.test(nextJoined)) {
    nextDaysTip =
      'Wrap cut blocks of cheese loosely in parchment inside a zip bag so moisture escapes without drying the edges out.';
  } else if (/egg|tofu/.test(nextJoined)) {
    nextDaysTip =
      'Keep eggs in their carton on a middle shelf, and submerge opened tofu in fresh cold water changed every day to extend freshness.';
  } else if (/zucchini|pepper|broccoli|cucumber|carrot|lemon|lime/.test(nextJoined)) {
    nextDaysTip =
      'Store dry, unwashed vegetables in a breathable crisper drawer and wait to rinse them until right before prepping.';
  }

  let pantryBufferTip =
    'Keep dry staples sealed tight away from stove heat and steam to protect flavor and texture.';
  if (/garlic|onion|potato|ginger/.test(pantryJoined)) {
    pantryBufferTip =
      'Store onions and garlic in an airy basket away from potatoes, since potatoes release moisture that makes alliums sprout faster.';
  } else if (/jar|salsa|olive|curry|oil/.test(pantryJoined)) {
    pantryBufferTip =
      'Wipe open jar rims clean with a damp towel before tightening lids, and tuck opened curry paste or salsa toward the back of the fridge.';
  } else if (/rice|beans|chickpea|tortilla/.test(pantryJoined)) {
    pantryBufferTip =
      'Keep open grains in airtight jars away from sunlight, and refrigerate or freeze extra tortillas with parchment between layers.';
  }

  return {
    use_tonight: useTonightTip,
    next_days: nextDaysTip,
    pantry_buffer: pantryBufferTip,
  };
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

  // Never invent photo contents: only use labels the user confirmed or Gemini detected.
  const photoItems = input.editedPhotoItems ?? [];

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

  const meals = merged.length > 0 ? buildOfflineMeals(merged, input.mood) : [];
  const tierProTips = buildOfflineTierProTips(merged);

  return {
    result: {
      detectedFromPhoto: photoItems,
      ingredients: merged,
      tierProTips,
      meals,
    },
    source: 'offline',
  };
}

export async function runKitchenTriage(input: TriageRunInput): Promise<TriageRunOutput> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiTriageError(
      'Gemini is not configured: VITE_GEMINI_API_KEY is missing. Add it to your environment and rebuild the app.'
    );
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new GeminiTriageError('You appear to be offline, so Gemini cannot analyze your kitchen right now.');
  }

  let response;
  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (input.image) {
      parts.push({
        inlineData: {
          data: toRawBase64(input.image.base64),
          mimeType: 'image/jpeg',
        },
      });
    }

    const photoNotes =
      input.editedPhotoItems && input.editedPhotoItems.length > 0
        ? `User-confirmed photo items: ${input.editedPhotoItems.join(', ')}.`
        : '';

    const imageInstructions = input.image
      ? [
          'An image is attached. Look at it carefully and list in detectedFromPhoto ONLY food items you can actually see in this specific image.',
          'Do not guess, do not add typical fridge staples, and do not invent items that are not clearly visible.',
          'If the image does not show food, groceries, a fridge, or a pantry (for example a person, pet, landscape, screenshot, or object), return an empty detectedFromPhoto array and do not create any ingredients from the photo.',
          'Mark ingredients that came from the photo with fromPhoto true.',
        ].join(' ')
      : 'No image was attached. detectedFromPhoto must be an empty array.';

    const textPrompt = input.rawText.trim()
      ? `Kitchen notes from user:\n${input.rawText.trim()}`
      : input.image
        ? 'The user did not type notes. Use only the ingredients visible in the photo.'
        : 'No ingredients were provided.';

    parts.push({
      text: [
        `Kitchen Mood / Effort preference: ${input.mood}.`,
        imageInstructions,
        photoNotes,
        textPrompt,
        'Return a warm, practical spoilage triage, one contextually relevant shelf-life Pro-Tip for each urgency tier based on the specific items in that tier, and exactly 3 low-effort rescue meals prioritizing items that expire tonight. Only use ingredients from the visible photo items and the user notes. If there are no ingredients at all, return empty ingredients and meals arrays.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    // Same client-side key and multimodal parts are reused for retries and fallback models.
    response = await generateWithResilience((model) => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction:
          'You are a warm, encouraging, practical home kitchen companion helping someone turn fridge leftovers and pantry staples into dinner tonight. When an image is provided, you are an accurate visual inspector: report only food items genuinely visible in the image, never fabricate groceries, and return empty lists when the image contains no food. Never scold the user for forgotten groceries. Strictly avoid all emojis and strictly avoid em dashes in every field; use commas, colons, or periods instead. Classify every ingredient into one of three urgency tiers: use_tonight, next_days, or pantry_buffer. For each tier, provide a practical shelf-life extension Pro-Tip tailored specifically to the ingredients in that category. Return exactly 3 low-effort rescue meals shaped by the requested Kitchen Mood / Effort.',
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
            tierProTips: {
              type: Type.OBJECT,
              description:
                'Contextually relevant advice on extending the shelf life of ingredients in each urgency tier.',
              properties: {
                use_tonight: {
                  type: Type.STRING,
                  description:
                    'Practical preservation Pro-Tip for the specific Use Tonight ingredients if they cannot all be cooked immediately.',
                },
                next_days: {
                  type: Type.STRING,
                  description:
                    'Practical storage Pro-Tip to keep the specific Next 2-3 Days ingredients fresh longer.',
                },
                pantry_buffer: {
                  type: Type.STRING,
                  description:
                    'Practical preservation Pro-Tip for the specific Pantry Buffer items.',
                },
              },
              required: ['use_tonight', 'next_days', 'pantry_buffer'],
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
          required: ['detectedFromPhoto', 'ingredients', 'tierProTips', 'meals'],
        },
      },
    }));
  } catch (err) {
    if (err instanceof GeminiTriageError) throw err;
    throw new GeminiTriageError(describeGeminiError(err));
  }

  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw new GeminiTriageError('Gemini returned an empty response. Please try again.');
  }

  try {
    const parsed = JSON.parse(rawJson) as {
      detectedFromPhoto?: string[];
      ingredients?: Array<{
        name: string;
        tier: UrgencyTier;
        freshnessWindow: string;
        tip: string;
        fromPhoto?: boolean;
      }>;
      tierProTips?: Partial<TierProTips>;
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

    const fallbackProTips = buildOfflineTierProTips(ingredients);
    const tierProTips: TierProTips = {
      use_tonight: parsed.tierProTips?.use_tonight
        ? sanitize(parsed.tierProTips.use_tonight)
        : fallbackProTips.use_tonight,
      next_days: parsed.tierProTips?.next_days
        ? sanitize(parsed.tierProTips.next_days)
        : fallbackProTips.next_days,
      pantry_buffer: parsed.tierProTips?.pantry_buffer
        ? sanitize(parsed.tierProTips.pantry_buffer)
        : fallbackProTips.pantry_buffer,
    };

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

    const detectedFromPhoto = input.image ? (parsed.detectedFromPhoto ?? []).map(sanitize).filter(Boolean) : [];

    return {
      result: {
        detectedFromPhoto,
        ingredients,
        tierProTips,
        meals,
      },
      source: 'gemini',
      noFoodInPhoto: Boolean(input.image) && detectedFromPhoto.length === 0,
    };
  } catch {
    throw new GeminiTriageError('Gemini returned a response that could not be read. Please try again.');
  }
}
