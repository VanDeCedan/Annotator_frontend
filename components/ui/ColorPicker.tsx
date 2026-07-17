import React from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label: string;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#f43f5e', '#1f2937',
];

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-black mb-2">{label}</label>
      <div className="flex flex-wrap gap-2 items-center">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
              color === c ? 'border-blue-500 scale-110 shadow' : 'border-gray-300'
            }`}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        {/* Custom color input */}
        <div className="relative">
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded-full cursor-pointer opacity-0 absolute inset-0 z-10"
            title="Custom color"
          />
          <div
            className="w-7 h-7 rounded-full border-2 border-dashed border-gray-400 flex items-center justify-center text-xs text-gray-500"
            style={{ backgroundColor: color }}
            title="Custom color"
          >
            +
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <div className="w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: color }} />
        <code className="text-xs text-gray-500">{color}</code>
      </div>
    </div>
  );
}
