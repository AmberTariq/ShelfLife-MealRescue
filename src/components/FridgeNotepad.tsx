import React, { useRef, useState } from 'react';
import { KitchenMood, ProcessedImage } from '../types/kitchen';
import {
  CameraIcon,
  CloseIcon,
  NoteIcon,
  PlusIcon,
  ShuffleIcon,
} from './Icons';

interface FridgeNotepadProps {
  rawText: string;
  onChangeText: (value: string) => void;
  mood: KitchenMood;
  onChangeMood: (mood: KitchenMood) => void;
  image: ProcessedImage | null;
  onSelectImageFile: (file: File) => void;
  onRemoveImage: () => void;
  photoItems: string[];
  onRemovePhotoItem: (index: number) => void;
  onAddPhotoItem: (label: string) => void;
  onLoadSample: () => void;
  onSurpriseMe: () => void;
  scenarioStatus: string;
  onSubmitTriage: () => void;
  isLoading: boolean;
  imageError: string | null;
}

const MOODS: KitchenMood[] = [
  '15-Min Quick',
  'Cozy & Filling',
  'Zero-Stress Pantry',
];

export const FridgeNotepad: React.FC<FridgeNotepadProps> = ({
  rawText,
  onChangeText,
  mood,
  onChangeMood,
  image,
  onSelectImageFile,
  onRemoveImage,
  photoItems,
  onRemovePhotoItem,
  onAddPhotoItem,
  onLoadSample,
  onSurpriseMe,
  scenarioStatus,
  onSubmitTriage,
  isLoading,
  imageError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [newPhotoLabel, setNewPhotoLabel] = useState('');
  const [pokedChipKey, setPokedChipKey] = useState<string | null>(null);

  const canSubmit = !isLoading && (rawText.trim().length > 0 || Boolean(image) || photoItems.length > 0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectImageFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onSelectImageFile(file);
    }
  };

  const handleAddLabel = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newPhotoLabel.trim();
    if (!cleaned) return;
    onAddPhotoItem(cleaned);
    setNewPhotoLabel('');
  };

  const triggerPoke = (key: string) => {
    setPokedChipKey(null);
    requestAnimationFrame(() => setPokedChipKey(key));
  };

  return (
    <section
      id="kitchen-desk"
      className="bg-[#FFFDF9] border border-[#E5DDD0] rounded-xl p-5 sm:p-7 shadow-[0_1px_2px_rgba(35,31,29,0.04)]"
      aria-label="Fridge Notepad and Photo Triage"
    >
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#E5DDD0]">
        <div className="flex items-center gap-2.5">
          <NoteIcon className="w-4 h-4 text-[#C84B31] shrink-0" />
          <h2 className="font-display text-xl sm:text-2xl font-medium text-[#231F1D] tracking-tight">
            Fridge Notepad
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onLoadSample}
            className="px-3.5 py-2 text-xs sm:text-sm font-medium text-[#231F1D] bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
          >
            Load Sample Fridge
          </button>
          <button
            type="button"
            onClick={onSurpriseMe}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#231F1D] bg-[#FFFDF9] hover:bg-[#FAF6F0] border border-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
          >
            <ShuffleIcon className="w-3.5 h-3.5 text-[#C84B31]" />
            <span>Surprise Me</span>
          </button>
        </div>
      </div>

      {/* Scenario status line */}
      {scenarioStatus && (
        <p className="mt-3 text-xs sm:text-sm text-[#665D56] font-body">
          {scenarioStatus}
        </p>
      )}

      {/* Main Split Input Area */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        {/* Text Notepad */}
        <div className="md:col-span-7 flex flex-col">
          <label
            htmlFor="fridge-notes-input"
            className="text-xs font-medium uppercase tracking-wider text-[#665D56] mb-2"
          >
            What is sitting on your shelves right now
          </label>
          <textarea
            id="fridge-notes-input"
            value={rawText}
            onChange={(e) => onChangeText(e.target.value)}
            rows={7}
            placeholder="Jot down whatever you see: half a bag of spinach, 3 eggs, leftover rice, a lemon, open salsa jar..."
            className="w-full flex-1 min-h-[180px] p-4 rounded-lg bg-[#FAF6F0] border border-[#E5DDD0] text-[#231F1D] placeholder:text-[#8E8277] text-sm sm:text-base leading-relaxed resize-y focus:bg-[#FFFDF9] focus:border-[#C84B31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31] transition-colors"
          />
          <p className="mt-2 text-xs text-[#665D56]">
            Leave the box blank if you prefer to upload a fridge shelf photo on the right.
          </p>
        </div>

        {/* Photo Upload & Preview Panel */}
        <div className="md:col-span-5 flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wider text-[#665D56] mb-2">
            Or snap your fridge shelf
          </span>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Upload a fridge or pantry photo"
          />

          {!image ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex-1 min-h-[180px] rounded-lg border border-dashed flex flex-col items-center justify-center p-5 text-center transition-colors ${
                isDragging
                  ? 'border-[#C84B31] bg-[#F5E6E0]/50'
                  : 'border-[#D5C9B8] bg-[#FAF6F0]/70 hover:bg-[#FAF6F0]'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-[#FFFDF9] border border-[#E5DDD0] flex items-center justify-center text-[#C84B31] mb-3">
                <CameraIcon className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-[#231F1D]">
                Drop a shelf photo here
              </p>
              <p className="text-xs text-[#665D56] mt-1 max-w-[26ch]">
                Automatically resized in your browser for quick reading.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 px-4 py-2 text-xs font-medium text-[#231F1D] bg-[#FFFDF9] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
              >
                Choose Fridge Photo
              </button>
            </div>
          ) : (
            <div className="flex-1 min-h-[180px] rounded-lg border border-[#E5DDD0] bg-[#FAF6F0] p-3 flex flex-col justify-between gap-3">
              <div className="relative rounded-md overflow-hidden border border-[#E5DDD0] bg-[#231F1D]/5 aspect-[16/10]">
                <img
                  src={image.previewUrl}
                  alt="Selected fridge shelf preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#231F1D] truncate">
                    {image.fileName}
                  </p>
                  <p className="font-mono-code text-[11px] text-[#665D56]">
                    {image.width} x {image.height} px · JPEG 0.82
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#231F1D] bg-[#FFFDF9] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-md transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={onRemoveImage}
                    className="px-2.5 py-1.5 text-xs font-medium text-[#C84B31] bg-[#FFFDF9] hover:bg-[#F5E6E0] border border-[#E5DDD0] rounded-md transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {imageError && (
            <p className="mt-2 text-xs text-[#C84B31]" role="alert">
              {imageError}
            </p>
          )}
        </div>
      </div>

      {/* Detected from Photo Editable Chip Strip */}
      {(image || photoItems.length > 0) && (
        <div className="mt-5 pt-4 border-t border-[#E5DDD0]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#231F1D]">
                Detected from Photo
              </h3>
              <p className="text-xs text-[#665D56] mt-0.5">
                Tap a tag to inspect, click x to remove a misread item, or label a backward jar.
              </p>
            </div>
            <form onSubmit={handleAddLabel} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={newPhotoLabel}
                onChange={(e) => setNewPhotoLabel(e.target.value)}
                placeholder="Add hidden jar or item..."
                aria-label="Add a label for an item in the photo"
                className="flex-1 min-w-0 sm:w-48 px-3 py-1.5 text-xs rounded-md bg-[#FAF6F0] border border-[#E5DDD0] text-[#231F1D] placeholder:text-[#8E8277] focus:bg-[#FFFDF9] focus:border-[#C84B31] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#231F1D] bg-[#FAF6F0] hover:bg-[#F2EAE0] border border-[#E5DDD0] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>

          {photoItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {photoItems.map((item, idx) => {
                const chipKey = `photo-${idx}-${item}`;
                return (
                  <div
                    key={chipKey}
                    className={`inline-flex items-center rounded-md border border-[#E5DDD0] bg-[#FAF6F0] text-xs font-medium text-[#231F1D] ${
                      pokedChipKey === chipKey ? 'animate-squash-poke' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => triggerPoke(chipKey)}
                      className="px-2.5 py-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
                    >
                      {item}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePhotoItem(idx)}
                      aria-label={`Remove ${item}`}
                      className="pr-2 pl-1 py-1.5 text-[#665D56] hover:text-[#C84B31] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31]"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#665D56] italic">
              Photo ready. Click &quot;Triage My Fridge&quot; below to detect visible ingredients automatically, or add labels above.
            </p>
          )}
        </div>
      )}

      {/* Kitchen Mood / Effort + Submit CTA */}
      <div className="mt-6 pt-5 border-t border-[#E5DDD0] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[#665D56] whitespace-nowrap">
            Kitchen Mood / Effort
          </span>
          <div
            role="group"
            aria-label="Kitchen Mood or Effort"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#FAF6F0] border border-[#E5DDD0]"
          >
            {MOODS.map((option) => {
              const active = mood === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChangeMood(option)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C84B31] ${
                    active
                      ? 'bg-[#FFFDF9] text-[#231F1D] border border-[#E5DDD0] shadow-[0_1px_1px_rgba(35,31,29,0.06)]'
                      : 'text-[#665D56] hover:text-[#231F1D] border border-transparent'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmitTriage}
          disabled={!canSubmit}
          className="px-6 py-3 rounded-lg bg-[#C84B31] hover:bg-[#B23F27] disabled:bg-[#D5C9B8] disabled:cursor-not-allowed text-[#FFFDF9] text-sm font-semibold tracking-tight transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#231F1D]"
        >
          {isLoading ? 'Sorting Your Shelf...' : 'Triage My Fridge'}
        </button>
      </div>
    </section>
  );
};
