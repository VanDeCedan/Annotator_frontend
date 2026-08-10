import React, { useState } from 'react';

interface OCRPanelProps {
  value: string;
  onChange: (value: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
  prefixEnabled: boolean;
  setPrefixEnabled: (enabled: boolean) => void;
  prefixValue: string;
  setPrefixValue: (value: string) => void;
  ocrCharset?: string | null;
}

export function OCRPanel({ value, onChange, onNext, onPrev, prefixEnabled, setPrefixEnabled, prefixValue, setPrefixValue, ocrCharset }: OCRPanelProps) {
  const [fontSize, setFontSize] = useState(14);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');

  const invalidChars = ocrCharset 
    ? Array.from(new Set(Array.from(value).filter(char => !ocrCharset.includes(char))))
    : [];

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
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-black uppercase tracking-wider">OCR Annotation</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Transcribe the text in the image</p>
        </div>
        
        {/* Prefix Controls */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-600 font-bold cursor-pointer uppercase tracking-wider">
            <input
              type="checkbox"
              checked={prefixEnabled}
              onChange={(e) => setPrefixEnabled(e.target.checked)}
              className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Auto-Prefix
          </label>
          <input
            type="text"
            value={prefixValue}
            onChange={(e) => setPrefixValue(e.target.value)}
            disabled={!prefixEnabled}
            placeholder="Prefix text..."
            className={`border rounded px-2 py-1 text-xs outline-none transition-colors w-32 ${!prefixEnabled ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white border-blue-300 focus:ring-1 focus:ring-blue-400 text-black shadow-sm'}`}
          />
        </div>
      </div>

      {/* Font & Align Controls */}
      <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">Font Size: {fontSize}px</span>
            <div className="flex gap-1">
              <button 
                onClick={() => setFontSize(f => Math.max(10, f - 2))}
                className="w-6 h-6 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 font-bold shadow-sm transition-colors"
                title="Decrease Font Size"
              >
                -
              </button>
              <button 
                onClick={() => setFontSize(f => Math.min(48, f + 2))}
                className="w-6 h-6 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 font-bold shadow-sm transition-colors"
                title="Increase Font Size"
              >
                +
              </button>
            </div>
          </div>
          <div className="w-px h-4 bg-gray-300 mx-1"></div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-600 font-medium mr-1">Align:</span>
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => setTextAlign(align)}
                className={`px-2 py-1 text-[11px] font-bold uppercase tracking-wider rounded border transition-colors shadow-sm ${textAlign === align ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {align}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Charset Info Bar */}
      {ocrCharset && (
        <div className="px-4 py-1.5 bg-blue-50 border-b border-gray-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-blue-700">Allowed Charset:</span>
          <code className="bg-white px-1.5 py-0.5 rounded border text-black font-mono select-all">{ocrCharset}</code>
          {invalidChars.length > 0 && (
            <span className="font-bold text-red-600 ml-auto bg-red-50 border border-red-200 px-2 py-0.5 rounded animate-pulse">
              Invalid chars found: {invalidChars.join(' ')}
            </span>
          )}
        </div>
      )}

      {/* Textarea */}
      <div className="p-4 flex-1 flex flex-col bg-gray-50">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ fontSize: `${fontSize}px`, textAlign }}
          placeholder="Enter transcribed text here (Press Tab to save & next)"
          className={`w-full flex-1 border focus:ring-2 rounded-lg px-4 py-3 text-black outline-none resize-none transition-all bg-white shadow-inner ${invalidChars.length > 0 ? 'border-red-500 focus:border-red-500 focus:ring-red-100 shadow-red-50' : 'border-gray-300 focus:border-blue-400 focus:ring-blue-100'}`}
        />
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{value.length} characters</p>
          <p className="text-[10px] text-gray-400 italic">Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-gray-600 font-mono">Tab</kbd> to save & next</p>
        </div>
      </div>
    </div>
  );
}
