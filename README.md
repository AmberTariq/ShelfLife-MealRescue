# ShelfLife & MealRescue

A client-side kitchen triage and meal-rescue web application built with React, Vite, TypeScript, and the Gemini SDK (`@google/genai`). Turn ingredients on hand or a photo of your fridge/pantry shelf into prioritized cooking ideas and help reduce food waste.

## Core Functions & Capabilities

### 1. Fridge & Pantry Photo Upload and Compression
* **Drag-and-Drop & File Picker Upload:** Drop a fridge or pantry photo or select a file from your device (`Choose Fridge Photo`), with option to replace or clear the loaded image.
* **Browser-Side Image Compression:** Automatically resizes and compresses uploaded images in the browser (e.g., to JPEG) before analysis so uploads stay lightweight and fast.
* **Multimodal Vision Detection (`inlineData`):** Sends the compressed base64 image directly to Gemini's vision model (`gemini-3.8-flash`) to detect visible food and pantry items without relying on a backend proxy.

### 2. Ingredient Notepad & Quick Scenarios
* **Freeform Shelf Notepad:** Type or edit what is currently sitting on your fridge shelves, counters, or pantry.
* **Load Sample Fridge:** Populates a realistic sample fridge sweep scenario to test or demo the triage flow immediately.
* **Surprise Me:** Generates a random ingredient/scenario mix for quick exploration.

### 3. Detected Ingredient Tag Management
* **Interactive Ingredient Chips:** View items detected from an uploaded photo as editable chips (`DETECTED FROM PHOTO`).
* **Add Custom or Hidden Items:** Add missing, backward-facing, or hidden jars/ingredients manually (`Add hidden jar or item...` + `+ Add`).
* **Remove Misread Items:** Delete incorrect detections with a single click (`x`) before running full meal triage.

### 4. Kitchen Mood, Effort & Triage Execution
* **Mood & Effort Filters:** Tailor meal suggestions by cooking time and style, including `15-Min Quick`, `Cozy & Filling`, and `Zero-Stress Pantry`.
* **Triage My Fridge Action:** Combines text ingredients, confirmed/edited photo detections, and selected mood/effort preferences to generate prioritized triage and meal recommendations.

### 5. Triage Board (Shelf Priority)
* **Urgency-Based Prioritization:** Organizes ingredients by freshness and cooking urgency (such as what needs cooking first vs. what keeps longer or sits in the pantry).
* **Shelf & Priority Filtering:** Filter or scan items across urgency tiers (`All Tiers`, `Use Tonight`, `Next 2-3 Days`, `Pantry Buffer`, or shelf views).
* **3D Tactile Card Motion:** Supports 3D card tilt and flip interactions for inspecting shelf items and rescue details.

### 6. Rescue Meals & Rescued Item Tracking
* **Meal Rescue Suggestions:** Surfaces practical meal ideas built around ingredients that need using soon and pantry staples on hand.
* **Items Rescued Counter:** Tracks items rescued/used and updates the live `Items Rescued` counter in the top navigation bar.

### 7. Client-Side API Reliability & Error Handling
* **Direct Browser Gemini Calls:** Initializes `@google/genai` directly in the browser using `import.meta.env.VITE_GEMINI_API_KEY` for static Netlify deployment without server/proxy dependencies.
* **Transient `503` Retry & Model Fallback:** Automatically retries temporary `503` / `UNAVAILABLE` responses with backoff and falls back to a secondary Flash model if needed.
* **Transparent Error & Loading States:** Displays active loading feedback during analysis and clear error banners when API calls fail or `VITE_GEMINI_API_KEY` is missing—without silently substituting fake placeholder food items.

## Tech Stack

* **Frontend:** React, Vite, TypeScript
* **AI SDK:** `@google/genai` (client-side `generateContent` with `gemini-3.8-flash` and fallback support)
* **Typography & Styling:** `Fraunces` and `Plus Jakarta Sans` on a warm butcher-block cream, espresso ink, and terracotta palette
* **Deployment:** Static site hosting (configured for Netlify)

## Local Setup

1. **Clone the repository and install dependencies:**

   ```bash
   git clone <your-repo-url>
   cd <your-project-folder>
   npm install
   ```

2. **Configure environment variables:**

   Create a `.env` (or `.env.local`) file in the project root and add your Gemini API key:

   ```bash
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start the development server:**

   ```bash
   npm run dev
   ```

4. **Build for production:**

   ```bash
   npm run build
   ```

## Deploying to Netlify

1. Push your repository to GitHub (or connect your Git provider in Netlify).
2. In Netlify, configure the build settings for a static Vite app:
   * **Build command:** `npm run build`
   * **Publish directory:** `dist`
3. In **Site configuration -> Environment variables**, add:
   * **Key:** `VITE_GEMINI_API_KEY`
   * **Value:** your Gemini API key
4. Trigger a deploy (or redeploy after adding/updating `VITE_GEMINI_API_KEY` so Vite bakes the variable into the static bundle).

> **Note on Client-Side API Keys:** Because `VITE_*` variables are embedded into the client bundle at build time for static hosting, restrict your API key appropriately in Google AI Studio / Google Cloud (such as HTTP referrer restrictions for your deployed domain) and monitor usage.
