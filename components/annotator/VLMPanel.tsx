import React, { useRef, useEffect } from 'react';

interface VLMClass {
  code: number;
  label: string;
  color: string;
}

interface VLMPanelProps {
  classes: VLMClass[];
  values: Record<number, string>;
  onChange: (code: number, value: string) => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export function VLMPanel({ classes, values, onChange, onNext, onPrev }: VLMPanelProps) {
  const inputRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [classes]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (idx > 0) {
          inputRefs.current[idx - 1]?.focus();
        } else {
          if (onPrev) onPrev();
        }
      } else {
        if (idx < classes.length - 1) {
          inputRefs.current[idx + 1]?.focus();
        } else {
          if (onNext) onNext();
        }
      }
    }
  };

  const filledCount = classes.filter(cls => (values[cls.code] || '').trim() !== '').length;
  const allFilled = filledCount === classes.length && classes.length > 0;

  return (
    <div className="w-full bg-white flex flex-col h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xs font-bold text-black uppercase tracking-wider">VLM Annotation</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Provide text answers for each prompt field</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${allFilled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {filledCount} / {classes.length} filled
          </span>
        </div>
      </div>



      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {classes.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">
            No classes defined. Add classes to this project first.
          </div>
        )}
        {classes.map((cls, idx) => {
          const val = values[cls.code] || '';
          const isFilled = val.trim() !== '';
          return (
            <div key={cls.code} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-gray-300"
                  style={{ backgroundColor: cls.color }}
                />
                <label className="text-xs font-bold text-black uppercase tracking-wide">
                  {cls.label}
                </label>
                {isFilled && (
                  <span className="text-green-600 text-xs ml-auto">&#x2713;</span>
                )}
              </div>
              <textarea
                ref={(el) => { inputRefs.current[idx] = el; }}
                value={val}
                onChange={(e) => onChange(cls.code, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                placeholder={`Answer for "${cls.label}"...`}
                rows={1}
                className={`w-full border rounded-lg px-3 py-2 text-sm text-black outline-none resize-y transition-all bg-white shadow-inner focus:ring-2 ${isFilled ? 'border-green-300 focus:border-green-400 focus:ring-green-100' : 'border-gray-300 focus:border-blue-400 focus:ring-blue-100'}`}
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-gray-400">{val.length} chars</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}