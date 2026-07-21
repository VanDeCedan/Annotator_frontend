import React, { useState } from 'react';

interface OCRPanelProps {
  value: string;
  onChange: (value: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export function OCRPanel({ value, onChange, onNext, onPrev }: OCRPanelProps) {
  const [fontSize, setFontSize] = useState(14);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (onPrev) onPrev();
      } else {
        if (onNext) onNext();
      }
    }
  };

  return (
    <div className="w-full bg-white flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-100">
        <h2 className="text-xs font-bold text-black uppercase tracking-wider">OCR Annotation</h2>
        <p className="text-xs text-gray-500 mt-0.5">Transcribe the text in the image</p>
      </div>

      {/* Font Controls */}
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <span className="text-xs text-gray-600 font-medium">Font Size: {fontSize}px</span>
        <div className="flex gap-1">
          <button 
            onClick={() => setFontSize(f => Math.max(10, f - 2))}
            className="w-6 h-6 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 font-bold"
            title="Decrease Font Size"
          >
            -
          </button>
          <button 
            onClick={() => setFontSize(f => Math.min(32, f + 2))}
            className="w-6 h-6 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 font-bold"
            title="Increase Font Size"
          >
            +
          </button>
        </div>
      </div>

      {/* Textarea */}
      <div className="p-4 flex-1 flex flex-col">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ fontSize: `${fontSize}px` }}
          placeholder="Enter transcribed text here (Press Tab to save & next)"
          className="w-full flex-1 border border-gray-300 focus:border-blue-300 focus:ring rounded px-3 py-2 text-black outline-none resize-none transition-colors bg-white"
        />
        <p className="text-xs text-gray-400 mt-2">{value.length} characters</p>
      </div>
    </div>
  );
}
