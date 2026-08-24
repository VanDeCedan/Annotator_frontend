import React, { useMemo } from 'react';

interface Class {
  id: number;
  code: number;
  label: string;
  color: string;
}

interface ClassPanelProps {
  classes: Class[];
  activeClassCode: number | null;
  onSelectClass: (code: number) => void;
  projectType: string;
  selectedLabelIndices?: number[];
  labels?: { class_code: number }[];
}

export function ClassPanel({ classes, activeClassCode, onSelectClass, projectType, selectedLabelIndices = [], labels = [] }: ClassPanelProps) {
  const classCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    labels.forEach(l => {
      counts[l.class_code] = (counts[l.class_code] || 0) + 1;
    });
    return counts;
  }, [labels]);

  return (
    <div className="w-full bg-white flex flex-col min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-100">
        <h2 className="text-xs font-bold text-black uppercase tracking-wider">Classes</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {(projectType === 'Classification' || projectType === 'Ocr') 
            ? 'Select to assign class' 
            : selectedLabelIndices.length > 0 
              ? `Change class for ${selectedLabelIndices.length} selected item(s)` 
              : projectType === 'NER' ? 'Select then highlight text' : 'Select then draw on image'}
        </p>
      </div>

      {/* Class list */}
      <div className="overflow-y-auto flex-1 p-2 space-y-1">
        {classes.length === 0 ? (
          <div className="text-center text-sm text-gray-500 py-8">No classes defined</div>
        ) : (
          classes.map((cls) => {
            const isActive = activeClassCode === cls.code;
            const count = labels.filter(l => l.class_code === cls.code).length;
            const labelText = count > 0 ? `${cls.label} (${count})` : cls.label;

            return (
              <button
                key={cls.code}
                onClick={() => onSelectClass(cls.code)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded border text-left transition-all ${
                  isActive
                    ? 'bg-blue-50 border-blue-400'
                    : 'bg-white border-transparent hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className="w-4 h-4 rounded flex-shrink-0 border border-black/10" style={{ backgroundColor: cls.color }} />
                <span className={`text-sm font-medium flex-1 truncate ${isActive ? 'text-black' : 'text-gray-700'}`}>
                  {labelText}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 border rounded px-1.5 py-0.5 font-mono flex-shrink-0">
                  {cls.code}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

