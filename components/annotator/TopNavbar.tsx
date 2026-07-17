import React from 'react';

export function TopNavbar({
  title,
  onSave,
  onBack,
  isSaving,
}: {
  title: string;
  onSave: () => void;
  onBack: () => void;
  isSaving?: boolean;
}) {
  return (
    <div className="h-14 bg-gray-700 text-white border-b border-gray-600 flex items-center justify-between px-4 z-10 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-gray-300 hover:text-white transition-colors p-1"
          title="Back"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <span className="font-medium truncate max-w-xs text-sm">{title}</span>
      </div>
      <button
        onClick={onSave}
        disabled={isSaving}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-60"
      >
        {isSaving ? 'Saving...' : 'Save Progress'}
      </button>
    </div>
  );
}
