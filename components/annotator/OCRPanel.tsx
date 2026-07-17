import React from 'react';

interface OCRPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function OCRPanel({ value, onChange }: OCRPanelProps) {
  return (
    <div className="w-72 bg-white border-l border-gray-300 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-100">
        <h2 className="text-xs font-bold text-black uppercase tracking-wider">OCR Annotation</h2>
        <p className="text-xs text-gray-500 mt-0.5">Transcribe the text in the image</p>
      </div>

      {/* Textarea */}
      <div className="p-4 flex-1">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter transcribed text here..."
          className="w-full h-48 border border-gray-300 focus:border-blue-300 focus:ring rounded px-3 py-2 text-black text-sm outline-none resize-none transition-colors bg-white"
        />
        <p className="text-xs text-gray-400 mt-1">{value.length} characters</p>
      </div>
    </div>
  );
}
